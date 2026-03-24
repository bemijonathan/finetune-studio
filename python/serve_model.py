"""
Serve a fine-tuned MLX model with an OpenAI-compatible API.

Usage:
    python serve_model.py --model <model_id> --adapter <adapter_path> --port <port>

Starts an HTTP server compatible with OpenAI's chat completions API.
"""

import argparse
import json
import sys
import time
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread

import mlx_lm
from mlx_lm.sample_utils import make_sampler


def emit(event, **kwargs):
    print(json.dumps({"event": event, **kwargs}), flush=True)


class InferenceServer:
    def __init__(self, model_id, adapter_path=None, max_tokens=512):
        self.model_id = model_id
        self.adapter_path = adapter_path
        self.max_tokens = max_tokens
        self.model = None
        self.tokenizer = None

    def load(self):
        emit("status", message="Loading model...")
        kwargs = {}
        if self.adapter_path:
            kwargs["adapter_path"] = self.adapter_path
        self.model, self.tokenizer = mlx_lm.load(self.model_id, **kwargs)
        emit("status", message="Model loaded")
        emit("ready", model_id=self.model_id)

    def generate(self, messages, max_tokens=None, temperature=0.7, stream=False):
        if self.model is None:
            raise RuntimeError("Model not loaded")

        max_tokens = max_tokens or self.max_tokens

        # Apply chat template
        if hasattr(self.tokenizer, "apply_chat_template"):
            prompt = self.tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
        else:
            # Fallback: simple concatenation
            parts = []
            for m in messages:
                role = m.get("role", "user")
                content = m.get("content", "")
                parts.append(f"{role}: {content}")
            parts.append("assistant:")
            prompt = "\n".join(parts)

        if stream:
            return self._stream_generate(prompt, max_tokens, temperature)
        else:
            sampler = make_sampler(temp=temperature)
            response = mlx_lm.generate(
                self.model,
                self.tokenizer,
                prompt=prompt,
                max_tokens=max_tokens,
                sampler=sampler,
            )
            return response

    def _stream_generate(self, prompt, max_tokens, temperature):
        """Yield tokens one at a time."""
        sampler = make_sampler(temp=temperature)
        for response in mlx_lm.stream_generate(
            self.model,
            self.tokenizer,
            prompt=prompt,
            max_tokens=max_tokens,
            sampler=sampler,
        ):
            # mlx_lm >= 0.19 yields GenerationResponse objects
            text = response.text if hasattr(response, 'text') else str(response)
            if text:
                yield text


class ChatHandler(BaseHTTPRequestHandler):
    server_instance = None

    def log_message(self, format, *args):
        pass  # Suppress default logging

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_length))

        messages = body.get("messages", [])
        max_tokens = body.get("max_tokens", 512)
        temperature = body.get("temperature", 0.7)
        stream = body.get("stream", False)

        try:
            if stream:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()

                chat_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"
                for token in self.server_instance.generate(
                    messages, max_tokens, temperature, stream=True
                ):
                    chunk = {
                        "id": chat_id,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": token},
                                "finish_reason": None,
                            }
                        ],
                    }
                    self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
                    self.wfile.flush()

                # Send done
                done_chunk = {
                    "id": chat_id,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "choices": [
                        {"index": 0, "delta": {}, "finish_reason": "stop"}
                    ],
                }
                self.wfile.write(f"data: {json.dumps(done_chunk)}\n\n".encode())
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            else:
                response = self.server_instance.generate(
                    messages, max_tokens, temperature
                )
                result = {
                    "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": response},
                            "finish_reason": "stop",
                        }
                    ],
                }
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            emit("error", message=str(e))
            self.send_error(500, str(e))

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self.send_error(404)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--adapter", default=None)
    parser.add_argument("--port", type=int, default=8321)
    parser.add_argument("--max-tokens", type=int, default=512)
    args = parser.parse_args()

    server = InferenceServer(args.model, args.adapter, args.max_tokens)
    server.load()

    ChatHandler.server_instance = server
    httpd = HTTPServer(("127.0.0.1", args.port), ChatHandler)
    emit("serving", port=args.port, model_id=args.model)
    httpd.serve_forever()


if __name__ == "__main__":
    main()

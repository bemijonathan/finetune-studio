"""
Merge a LoRA adapter into the base model using mlx_lm fuse.

Usage:
    python export_merge.py --model <model_id> --adapter <adapter_path> --output <output_path>
"""

import argparse
import json
import sys
import os


def emit(event, **kwargs):
    print(json.dumps({"event": event, **kwargs}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Base model ID from HuggingFace")
    parser.add_argument("--adapter", required=True, help="Path to LoRA adapter directory")
    parser.add_argument("--output", required=True, help="Output directory for merged model")
    parser.add_argument("--de-quantize", action="store_true", help="De-quantize the model")
    args = parser.parse_args()

    try:
        emit("status", message="Starting model merge...")

        from mlx_lm import fuse

        emit("status", message=f"Fusing adapter into {args.model}...")

        fuse.fuse(
            model=args.model,
            adapter_path=args.adapter,
            save_path=args.output,
            de_quantize=args.de_quantize,
        )

        emit("complete", output_path=args.output)
    except Exception as e:
        emit("error", message=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
FineTune Studio — MLX LoRA Training Script

Reads a config.json, runs LoRA/QLoRA fine-tuning via mlx-lm,
and outputs JSON progress lines to stdout.

Usage:
    python train_lora_mlx.py --config /path/to/config.json
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path


def log(data):
    """Print a JSON line to stdout and flush."""
    print(json.dumps(data), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Path to job config JSON")
    args = parser.parse_args()

    # Load config
    with open(args.config) as f:
        config = json.load(f)

    model_id = config["model_id"]
    dataset_path = config["dataset_path"]
    output_dir = config["output_dir"]
    lora_rank = config.get("lora_rank", 16)
    lora_alpha = config.get("lora_alpha", 32)
    learning_rate = config.get("learning_rate", 5e-5)
    epochs = config.get("epochs", 5)
    batch_size = config.get("batch_size", 4)
    use_qlora = config.get("use_qlora", False)
    eval_split = config.get("eval_split", 0.1)
    eval_steps = config.get("eval_steps", 50)
    max_seq_length = config.get("max_seq_length", 2048)
    num_lora_layers = config.get("num_lora_layers", 16)

    os.makedirs(output_dir, exist_ok=True)

    log({"event": "status", "message": "Loading model", "model": model_id})

    try:
        import mlx.core as mx
        import mlx.nn as nn
        import mlx.optimizers as optim
        from mlx_lm import load as mlx_load
        from mlx_lm.tuner.trainer import TrainingArgs, train as mlx_train
        from mlx_lm.tuner.utils import linear_to_lora_layers
        from mlx_lm.tuner.datasets import create_dataset, CacheDataset
        from mlx_lm.tuner.callbacks import TrainingCallback
    except ImportError as e:
        log({"event": "error", "message": f"Missing dependency: {e}"})
        sys.exit(1)

    # Load model and tokenizer
    try:
        model, tokenizer = mlx_load(model_id)
    except Exception as e:
        log({"event": "error", "message": f"Failed to load model: {e}"})
        sys.exit(1)

    log({"event": "status", "message": "Model loaded, applying LoRA layers"})

    # Freeze model and apply LoRA
    model.freeze()
    lora_config = {
        "rank": lora_rank,
        "alpha": lora_alpha,
        "dropout": 0.0,
        "scale": lora_alpha / lora_rank,
    }

    # num_lora_layers = how many transformer layers from the end to apply LoRA to
    actual_layers = min(num_lora_layers, len(model.layers))
    linear_to_lora_layers(model, num_layers=actual_layers, config=lora_config)

    log({"event": "status", "message": "Loading dataset", "dataset": dataset_path})

    # Load and validate dataset (supports JSONL and JSON array)
    try:
        with open(dataset_path) as f:
            raw = f.read().strip()

        if raw.startswith("["):
            data = json.loads(raw)
            if not isinstance(data, list):
                data = []
        else:
            data = [json.loads(line) for line in raw.split("\n") if line.strip()]

        if not data:
            log({"event": "error", "message": "Dataset is empty"})
            sys.exit(1)

        # Validate dataset format before proceeding
        sample = data[0]
        detected_format = None
        if "messages" in sample and isinstance(sample["messages"], list):
            detected_format = "chat"
            # Validate chat format
            for i, row in enumerate(data[:10]):
                msgs = row.get("messages", [])
                if not isinstance(msgs, list) or len(msgs) == 0:
                    log({"event": "error", "message": f"Row {i}: 'messages' must be a non-empty list of {{role, content}} objects"})
                    sys.exit(1)
                for msg in msgs:
                    if not isinstance(msg, dict) or "role" not in msg or "content" not in msg:
                        log({"event": "error", "message": f"Row {i}: each message must have 'role' and 'content' fields"})
                        sys.exit(1)
        elif "prompt" in sample and "completion" in sample:
            detected_format = "completions"
        elif "text" in sample:
            detected_format = "text"
        else:
            fields = list(sample.keys())
            log({"event": "error", "message": f"Unsupported dataset format. Found fields: {fields}. Expected one of:\n- Chat: {{\"messages\": [{{\"role\": ..., \"content\": ...}}]}}\n- Completions: {{\"prompt\": ..., \"completion\": ...}}\n- Text: {{\"text\": ...}}"})
            sys.exit(1)

        log({"event": "status", "message": f"Dataset format: {detected_format}"})

        # Try tokenizing a sample to catch template errors early
        try:
            test_dataset = create_dataset(data[:2], tokenizer, type("C", (), {"mask_prompt": False, "prompt_feature": "prompt", "text_feature": "text", "completion_feature": "completion", "chat_feature": "messages"})())
            _ = test_dataset[0]
        except Exception as e:
            log({"event": "error", "message": f"Dataset tokenization failed: {e}. Check that your dataset format is compatible with this model's tokenizer."})
            sys.exit(1)

        # Split into train/eval
        split_idx = max(1, int(len(data) * (1 - eval_split)))
        train_data = data[:split_idx]
        eval_data = data[split_idx:] if split_idx < len(data) else data[-1:]

        total_samples = len(train_data)
        steps_per_epoch = max(1, total_samples // batch_size)
        total_steps = steps_per_epoch * epochs

        log({
            "event": "status",
            "message": f"Dataset loaded: {total_samples} train, {len(eval_data)} eval samples",
            "total_steps": total_steps,
            "train_samples": total_samples,
            "eval_samples": len(eval_data),
        })
    except json.JSONDecodeError as e:
        log({"event": "error", "message": f"Invalid JSON in dataset: {e}"})
        sys.exit(1)
    except Exception as e:
        log({"event": "error", "message": f"Failed to load dataset: {e}"})
        sys.exit(1)

    # Create proper mlx_lm dataset objects
    config_obj = type("C", (), {
        "mask_prompt": False,
        "prompt_feature": "prompt",
        "text_feature": "text",
        "completion_feature": "completion",
        "chat_feature": "messages",
    })()

    train_set = CacheDataset(create_dataset(train_data, tokenizer, config_obj))
    eval_set = CacheDataset(create_dataset(eval_data, tokenizer, config_obj))

    # Setup MLflow tracking
    mlflow_uri = os.environ.get("MLFLOW_TRACKING_URI")
    if mlflow_uri:
        try:
            import mlflow
            mlflow.set_tracking_uri(mlflow_uri)
            mlflow.set_experiment("finetune-studio")
            mlflow.start_run(run_name=f"lora-{Path(model_id).name}")
            mlflow.log_params({
                "model": model_id,
                "lora_rank": lora_rank,
                "lora_alpha": lora_alpha,
                "learning_rate": learning_rate,
                "epochs": epochs,
                "batch_size": batch_size,
                "use_qlora": use_qlora,
                "format": detected_format,
            })
        except Exception:
            pass  # MLflow is optional

    log({"event": "training_start", "total_steps": total_steps, "epochs": epochs})

    start_time = time.time()

    try:
        # Setup adapter file path
        adapter_file = os.path.join(output_dir, "adapters.safetensors")

        training_args = TrainingArgs(
            batch_size=batch_size,
            iters=total_steps,
            val_batches=min(25, max(1, len(eval_data) // batch_size)),
            steps_per_report=1,
            steps_per_eval=eval_steps,
            steps_per_save=total_steps,  # Save at the end
            adapter_file=adapter_file,
            max_seq_length=max_seq_length,
        )

        # Create optimizer
        optimizer = optim.Adam(learning_rate=learning_rate)

        # Training callback to report progress
        class ProgressCallback(TrainingCallback):
            def on_train_loss_report(self, info):
                elapsed = time.time() - start_time
                entry = {
                    "event": "step",
                    "step": info["iteration"],
                    "total_steps": total_steps,
                    "loss": round(float(info["train_loss"]), 4),
                    "lr": info.get("learning_rate", learning_rate),
                    "tokens_per_sec": round(info.get("tokens_per_second", 0), 1),
                    "peak_mem_gb": round(info.get("peak_memory", 0), 2),
                    "elapsed_sec": round(elapsed, 1),
                }
                log(entry)

                if mlflow_uri:
                    try:
                        mlflow.log_metric("train_loss", float(info["train_loss"]), step=info["iteration"])
                    except Exception:
                        pass

            def on_val_loss_report(self, info):
                elapsed = time.time() - start_time
                entry = {
                    "event": "eval",
                    "step": info["iteration"],
                    "eval_loss": round(float(info["val_loss"]), 4),
                    "elapsed_sec": round(elapsed, 1),
                }
                log(entry)

                if mlflow_uri:
                    try:
                        mlflow.log_metric("eval_loss", float(info["val_loss"]), step=info["iteration"])
                    except Exception:
                        pass

        # Run training
        mlx_train(
            model=model,
            optimizer=optimizer,
            args=training_args,
            train_dataset=train_set,
            val_dataset=eval_set,
            training_callback=ProgressCallback(),
        )

    except KeyboardInterrupt:
        log({"event": "cancelled", "message": "Training cancelled by user"})
        sys.exit(1)
    except Exception as e:
        log({"event": "error", "message": str(e)})
        sys.exit(1)

    # Save adapter_config.json (required by mlx_lm.load for inference)
    adapter_config = {
        "lora_parameters": {
            "rank": lora_rank,
            "alpha": lora_alpha,
            "dropout": 0.0,
            "scale": lora_alpha / lora_rank,
        },
        "num_layers": actual_layers,
    }
    with open(os.path.join(output_dir, "adapter_config.json"), "w") as f:
        json.dump(adapter_config, f, indent=2)

    duration = time.time() - start_time

    # End MLflow run
    if mlflow_uri:
        try:
            mlflow.end_run()
        except Exception:
            pass

    log({
        "event": "complete",
        "adapter_path": output_dir,
        "duration_sec": round(duration, 1),
        "message": "Training complete",
    })


if __name__ == "__main__":
    main()

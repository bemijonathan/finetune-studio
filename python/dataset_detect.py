#!/usr/bin/env python3
"""
Auto-detect JSONL dataset format, validate structure for mlx_lm compatibility,
and provide stats.

mlx_lm supports three formats:
  - Chat:        {"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
  - Completions: {"prompt": "...", "completion": "..."}
  - Text:        {"text": "..."}

Usage:
    python dataset_detect.py --file /path/to/data.jsonl
"""

import argparse
import json
import os
import sys


SUPPORTED_FORMATS = {
    "chat": {
        "description": "Chat format with messages array",
        "required_fields": ["messages"],
        "example": '{"messages": [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi!"}]}',
    },
    "completions": {
        "description": "Prompt-completion pairs",
        "required_fields": ["prompt", "completion"],
        "example": '{"prompt": "What is 2+2?", "completion": "4"}',
    },
    "text": {
        "description": "Plain text for continued pretraining",
        "required_fields": ["text"],
        "example": '{"text": "The quick brown fox jumps over the lazy dog."}',
    },
}


def detect_format(rows):
    """Detect dataset format from sample rows."""
    if not rows:
        return "unknown"

    first = rows[0]

    # Chat format: {"messages": [{"role": ..., "content": ...}]}
    if "messages" in first and isinstance(first["messages"], list):
        return "chat"

    # Completions format: {"prompt": ..., "completion": ...}
    if "prompt" in first and "completion" in first:
        return "completions"

    # Text format: {"text": ...}
    if "text" in first:
        return "text"

    # Alpaca format — NOT directly supported by mlx_lm, needs conversion
    if "instruction" in first and "output" in first:
        return "alpaca"

    return "unknown"


def validate_rows(rows, fmt):
    """Validate all rows match the detected format. Returns list of errors."""
    errors = []
    warnings = []

    if fmt == "chat":
        for i, row in enumerate(rows):
            msgs = row.get("messages")
            if not isinstance(msgs, list) or len(msgs) == 0:
                errors.append(f"Row {i}: 'messages' must be a non-empty array")
                if len(errors) >= 5:
                    break
                continue

            has_assistant = False
            for j, msg in enumerate(msgs):
                if not isinstance(msg, dict):
                    errors.append(f"Row {i}, message {j}: must be an object with 'role' and 'content'")
                    break
                if "role" not in msg:
                    errors.append(f"Row {i}, message {j}: missing 'role' field")
                    break
                if "content" not in msg:
                    errors.append(f"Row {i}, message {j}: missing 'content' field")
                    break
                if msg["role"] not in ("system", "user", "assistant"):
                    warnings.append(f"Row {i}, message {j}: unexpected role '{msg['role']}' (expected: system, user, assistant)")
                if msg["role"] == "assistant":
                    has_assistant = True

            if not has_assistant and not errors:
                warnings.append(f"Row {i}: no assistant message found — model needs examples of what to generate")

            if len(errors) >= 5:
                break

    elif fmt == "completions":
        for i, row in enumerate(rows):
            if "prompt" not in row:
                errors.append(f"Row {i}: missing 'prompt' field")
            elif not isinstance(row["prompt"], str) or not row["prompt"].strip():
                errors.append(f"Row {i}: 'prompt' must be a non-empty string")
            if "completion" not in row:
                errors.append(f"Row {i}: missing 'completion' field")
            elif not isinstance(row["completion"], str) or not row["completion"].strip():
                errors.append(f"Row {i}: 'completion' must be a non-empty string")
            if len(errors) >= 5:
                break

    elif fmt == "text":
        for i, row in enumerate(rows):
            if "text" not in row:
                errors.append(f"Row {i}: missing 'text' field")
            elif not isinstance(row["text"], str) or not row["text"].strip():
                errors.append(f"Row {i}: 'text' must be a non-empty string")
            if len(errors) >= 5:
                break

    elif fmt == "alpaca":
        warnings.append(
            "Alpaca format detected (instruction/output). mlx_lm expects chat, completions, or text format. "
            "This dataset will be auto-converted to chat format for training."
        )

    elif fmt == "unknown":
        if rows:
            fields = list(rows[0].keys())
            errors.append(
                f"Unrecognized format. Found fields: {fields}. "
                f"Expected one of: chat (messages), completions (prompt + completion), or text (text)."
            )

    return errors, warnings


def convert_alpaca_to_chat(rows):
    """Convert alpaca format to chat format for mlx_lm compatibility."""
    converted = []
    for row in rows:
        messages = []
        instruction = row.get("instruction", "")
        input_text = row.get("input", "")
        output_text = row.get("output", "")

        if input_text:
            messages.append({"role": "user", "content": f"{instruction}\n\n{input_text}"})
        else:
            messages.append({"role": "user", "content": instruction})

        messages.append({"role": "assistant", "content": output_text})
        converted.append({"messages": messages})
    return converted


def estimate_tokens(text):
    """Rough token estimate: words * 1.3"""
    return int(len(text.split()) * 1.3)


def get_text_content(row, fmt):
    """Extract all text from a row for token counting."""
    if fmt == "chat":
        return " ".join(m.get("content", "") for m in row.get("messages", []))
    elif fmt == "completions":
        return " ".join([row.get("prompt", ""), row.get("completion", "")])
    elif fmt == "text":
        return row.get("text", "")
    elif fmt == "alpaca":
        return " ".join([row.get("instruction", ""), row.get("input", ""), row.get("output", "")])
    return str(row)


def load_rows(file_path):
    """Load rows from JSONL or JSON array file. Returns (rows, error_message)."""
    with open(file_path) as f:
        raw = f.read()

    stripped = raw.strip()
    if not stripped:
        return [], "File is empty."

    ext = os.path.splitext(file_path)[1].lower()

    # Try JSONL first (one JSON object per line)
    if stripped[0] == "{":
        rows = []
        for line_num, line in enumerate(stripped.split("\n"), 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                if line_num == 1:
                    return [], (
                        "Could not parse as JSONL. If this is a multi-line JSON file, "
                        "try converting to JSONL (one JSON object per line)."
                    )
                return [], f"Invalid JSON on line {line_num}. Each line must be a complete JSON object."
        return rows, None

    # Try JSON array
    if stripped[0] == "[":
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError:
            return [], "File starts with '[' but is not valid JSON. Check for syntax errors."

        if not isinstance(data, list):
            return [], "Expected a JSON array of objects."

        if len(data) == 0:
            return [], "JSON array is empty — no training examples found."

        if not all(isinstance(row, dict) for row in data):
            return [], "JSON array must contain objects, not strings or numbers."

        return data, None

    # CSV / TSV detection
    if ext in (".csv", ".tsv") or ("," in stripped.split("\n")[0] and "\n" in stripped):
        return [], (
            "This looks like a CSV file. Please convert to JSONL first.\n"
            'Each line should be a JSON object, e.g.:\n'
            '{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}'
        )

    return [], (
        f"Unrecognized file format (starts with '{stripped[0]}'). "
        "Expected JSONL (one JSON object per line) or a JSON array of objects."
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--preview-limit", type=int, default=50)
    args = parser.parse_args()

    try:
        rows, parse_error = load_rows(args.file)
    except Exception as e:
        print(json.dumps({"error": f"Failed to read file: {e}"}))
        sys.exit(1)

    if parse_error:
        print(json.dumps({"error": parse_error}))
        sys.exit(1)

    if not rows:
        print(json.dumps({"error": "File is empty or contains no training examples."}))
        sys.exit(1)

    fmt = detect_format(rows)
    fields = list(rows[0].keys()) if rows else []

    # Validate all rows
    errors, warnings = validate_rows(rows, fmt)

    # Token stats
    token_counts = [estimate_tokens(get_text_content(r, fmt)) for r in rows]
    avg_tokens = sum(token_counts) / len(token_counts) if token_counts else 0

    # Check for common issues
    if len(rows) < 10:
        warnings.append(f"Only {len(rows)} examples. Fine-tuning typically needs 50+ examples for reasonable results.")
    if avg_tokens > 2048:
        warnings.append(f"Average token count ({round(avg_tokens)}) exceeds default max_seq_length (2048). Consider increasing it or trimming examples.")

    result = {
        "format": fmt,
        "mlx_compatible": fmt in ("chat", "completions", "text"),
        "needs_conversion": fmt == "alpaca",
        "fields": fields,
        "sample_count": len(rows),
        "avg_tokens": round(avg_tokens),
        "min_tokens": min(token_counts) if token_counts else 0,
        "max_tokens": max(token_counts) if token_counts else 0,
        "errors": errors,
        "warnings": warnings,
        "examples": rows[:min(args.preview_limit, len(rows))],
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()

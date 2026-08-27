#!/usr/bin/env bash
# llama.cpp on loopback, the auth front door on the public port.
set -euo pipefail

# The binary's path differs between llama.cpp image builds; ask rather than assume.
LLAMA_BIN="$(command -v llama-server || true)"
[ -n "$LLAMA_BIN" ] || LLAMA_BIN=/app/llama-server
[ -x "$LLAMA_BIN" ] || { echo "llama-server not found"; exit 1; }

"$LLAMA_BIN" \
  --model /models/qwen.gguf \
  --host 127.0.0.1 \
  --port "${LLAMA_PORT:-8081}" \
  --ctx-size 1024 \
  --threads "${LLAMA_THREADS:-2}" &

exec node /app/router.mjs

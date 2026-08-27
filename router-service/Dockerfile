# A small classifier I host myself.
#
# This does the one job the Ask agent needs that a tiny model is genuinely good
# at: deciding what KIND of question was asked. It is never allowed near a
# factual claim about Saif, because at 0.5B it would get those wrong with total
# confidence. Sorting a question into six labels is a different task, and one
# that fits in ~1GB on a CPU.
#
# 1.5B, not 0.5B: at 0.5B this scored 5/10 on a ten-question label test even
# with few-shot examples, and a visibly wrong label in the UI is worse than no
# label at all.
FROM ghcr.io/ggml-org/llama.cpp:server

# node for the front door (see router.mjs for why llama.cpp is not exposed
# directly). curl is kept for debugging a running revision.
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Baked in at build time, not fetched on boot: Cloud Run scales to zero, and a
# 400MB download on every cold start would defeat the point of hosting it.
ARG MODEL_URL=https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf
ADD ${MODEL_URL} /models/qwen.gguf
RUN test -s /models/qwen.gguf

COPY router.mjs /app/router.mjs
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENV PORT=8080 LLAMA_PORT=8081
EXPOSE 8080
ENTRYPOINT ["/bin/bash", "/app/start.sh"]

---
"@ptt/desktop": minor
---

## Model auto-detection

- The model field now offers what the endpoint actually serves: `/models` for OpenAI-compatible backends
  (LM Studio, vLLM, llama.cpp, the OpenAI API itself), `/api/tags` for Ollama
- Typing a model name by hand still works, and RapidAPI is untouched since it picks its own model

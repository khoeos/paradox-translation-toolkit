---
"@ptt/desktop": patch
"@ptt/cli": patch
---

Fixed: an OpenAI-compatible backend that only supports `{"type":"json_object"}`, the OpenAI provider
now retries that batch once in `json_object` mode and stays there for the rest of the run, keeping
the strict `json_schema` everywhere it is accepted.
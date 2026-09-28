---
"@ptt/desktop": patch
"@ptt/cli": patch
---

Fixed: rate limiting (429) no longer kills a run.

- When one batch hits a 429, the batches behind it now wait out the same cooldown instead of firing immediately.
- A 429 no longer counts against a batch's retry limit.
- Retry-After headers up to 2 minutes are respected.

Result: the run slows to match the backend's quota and finishes. It only gives up after 5 straight minutes of nothing but 429.

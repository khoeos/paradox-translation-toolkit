---
"@ptt/desktop": minor
---

## In-app problem reporting

Added a "Report a problem" feature that sends feedback straight to a Discord webhook.

- **Always included** - the current page, the selected game, and the chosen settings (languages, mode, target content, theme, update channel). Never any file paths.
- **Opt-in technical info** - a toggle attaches folder paths and recent job summaries to help debugging.
- **Optional contact**
- **Community link**

The webhook URL is injected at build time.

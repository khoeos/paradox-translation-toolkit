# Security Policy

## Supported versions

Only the latest released version of Paradox Translation Toolkit receives security fixes. Older versions (including older betas) are not patched.

| Version         | Supported |
| --------------- | --------- |
| Latest stable   | ✅ Yes    |
| Latest beta     | ✅ Yes    |
| Previous majors | ❌ No     |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you find a vulnerability, report it privately via one of these channels:

- **Preferred:** [GitHub private vulnerability reporting](https://github.com/khoeos/paradox-translation-toolkit/security/advisories/new)
- **Alternative:** Direct message on Discord to [khoeos](https://discordapp.com/users/170144954964770816)

When reporting, please include:

- A clear description of the vulnerability
- Steps to reproduce (a minimal mod folder or input file is ideal)
- The version of Paradox Translation Toolkit affected
- Your operating system and version
- The potential impact as you understand it

## Scope

The following are **in scope** for security reports:

- Path traversal or injection vulnerabilities through user-supplied folder paths
- Crashes or arbitrary code execution triggered by malformed `_l_<lang>.yml` files (the parser processes third-party content from mods)
- Issues with the auto-updater (signature verification, channel hijacking, etc.)
- Privilege escalation or unintended file system writes outside the configured output folder
- Vulnerabilities in the IPC layer between main and renderer processes

The following are **out of scope**:

- Bugs that only result in incorrect translation output without security impact (please open a normal issue)
- Issues requiring physical access to an already-compromised machine
- Vulnerabilities in dependencies that are already publicly disclosed and tracked upstream
- The fact that the application is unsigned on Windows / macOS, this is documented in [docs/publishing.md](./docs/publishing.md) and is a known limitation, not a vulnerability

## Response process

- I will acknowledge receipt of the report within **7 days**.
- I will provide an initial assessment (in scope / out of scope, severity estimate) within **14 days**.
- For valid in-scope issues, I will work on a fix and coordinate disclosure with you.
- Credit will be given in the release notes unless you prefer to remain anonymous.

This is a single-maintainer project worked on in spare time, so response times are best-effort. Thank you for helping keep the project and its users safe.

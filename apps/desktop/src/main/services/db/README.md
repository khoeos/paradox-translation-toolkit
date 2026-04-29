# Database (placeholder)

Reserved for SQLite + Prisma when scan caching, edit history, or saved
"projects" are added (planned PR10+).

Approach:

- `better-sqlite3` driver (sync, fast, native to Electron)
- Prisma as ORM (`prisma generate` runs at build time)
- DB file lives in `app.getPath('userData')/ptt.db`
- Migrations checked into `apps/desktop/prisma/migrations/`

Until then this directory stays empty.

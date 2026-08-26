# AGENTS.md

## Cursor Cloud specific instructions

Personal OS is a single Node.js/Express service (SQLite via `better-sqlite3`) that serves both the JSON API and three static front-ends. There is no build step, no separate frontend server, and no lint or test suite in the repo (`package.json` only defines `start`).

### Running the app
- Start with `npm start` (runs `node server/index.js`). There is no dedicated dev/watch script, so restart the process manually after server-side changes — nothing hot-reloads. Static files under `public/`, `public-admin/`, and `public-landing/` are served directly, so front-end edits only need a browser refresh.
- The app listens on port `4321` by default; override with the `PORT` env var.
- Routes served by the single process: app UI at `/`, standalone mobile admin panel at `/admin`, marketing/landing page at `/landing`, and the API under `/api`.

### Data & state
- On first run the server auto-creates `data/personal-os.db` (SQLite) and a `.jwt-secret` file. Both are gitignored. Delete `data/personal-os.db` to reset all accounts/data.
- The very first account created (via register) becomes the OWNER/admin with lifetime access; every subsequent sign-up is treated as a trial customer. Keep this in mind when testing multi-tenant/billing behavior.

### Native dependency
- `better-sqlite3` is a native module. `npm install` fetches a prebuilt binary; if that ever fails it falls back to compiling, which needs `python3` + a C/C++ toolchain (already present on the VM).

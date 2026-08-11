# Personal OS

Your all-in-one life & project dashboard — tasks, projects, plans, brainstorming, files, calendar, expenses, habits, health, travel, and a built-in AI assistant that knows your data.

**100% free.** No subscriptions, no credits, no payments — register and use everything, including every AI model.

## Run it

```
npm install   (first time only)
npm start
```

Then open **http://localhost:4321** and create your account (username + password). The **first account becomes the owner/admin**. Everything is stored locally in `data/personal-os.db` (SQLite).

Want ready-made demo accounts instead? Start with `SEED_DEMO=1`:

| Role | Username | Password |
|---|---|---|
| Admin (owner) | `admin` | `admin123` |
| User | `demo` | `demo123` |

## How it works

| Who | What they do |
|---|---|
| **Users** | Register → use every module and every AI model, free and unlimited. One-click Google / Notion connect. |
| **Admin** (`/admin`) | Add platform AI API keys + models, view user data/chats/activity, manage team, configure integrations. |

### AI chat
- Model switcher + file upload (images / PDF / text), Markdown replies
- Every model is free and unlimited for every user
- API usage is billed to the platform keys the admin configures

### Integrations (one click for users)
1. Admin → Integrations: paste Google OAuth client + Notion OAuth client
2. Users → Settings: **Connect Google** / **Connect Notion** — no API keys on their side
3. Telegram: each user connects their own bot from Settings

## Admin Panel

Open **/admin** (owner or manager accounts).

- **Overview** — users, signups, AI usage, open tickets
- **Users** — inspect any user's data, chats & activity; delete accounts
- **AI Models** — platform provider keys + model catalog
- **Integrations** — Google + Notion OAuth apps
- **Activity** — platform-wide event feed
- **Team** — add managers/support staff (owner only)

## Hosting

- **[HOSTING.md](HOSTING.md)** — Oracle Cloud (always-free VM, persistent data — best for production)
- **[RAILWAY.md](RAILWAY.md)** — Railway (persistent volume)
- **[AWS-HOSTING.md](AWS-HOSTING.md)** — AWS EC2
- **[VERCEL.md](VERCEL.md)** — Vercel (one-click, **demo/preview only** — SQLite data is ephemeral on serverless)

## Notes

- Port: set `PORT` (default `4321`)
- Secrets (platform AI keys, OAuth secrets) live in the DB and are only shown masked
- Landing page: `/landing` — update `APP_URL` near the bottom of `public-landing/index.html`

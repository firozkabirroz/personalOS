# Personal OS

Your all-in-one life & project dashboard — tasks, projects, plans, brainstorming, files, calendar, expenses, habits, health, travel, and a built-in AI assistant that knows your data.

**The app is free forever.** No subscription lock. Users just register and use. Free AI models are unlimited; paid models use credits.

## Run it

```
npm install   (first time only)
npm start
```

Then open **http://localhost:4321** and create your account (username + password). Everything is stored locally in `data/personal-os.db` (SQLite).

## How it works now

| Who | What they do |
|---|---|
| **Users** | Register → use every module free. Chat with free AI models. Buy credits only for paid models. One-click Google / Notion connect. |
| **Admin** | Add platform AI API keys + multiple models (mark free or paid + credit cost). Create credit packs. Approve TrxID payments. View user data, chats & activity. |

### AI chat
- Model switcher (free vs paid)
- File upload (images / PDF / text)
- Free models never debit credits
- Paid models debit the model's credit cost per message

### Credits
- Signup bonus credits (configurable in Admin → Settings)
- Users buy packs (bKash/Nagad TrxID) → Admin approves → credits added
- Admin can also grant credits manually

### Integrations (one click)
1. Admin → Integrations: paste Google OAuth client + Notion OAuth client
2. Users → Settings: **Connect Google** / **Connect Notion** — no API keys on their side

## Admin Panel

Open **/admin** (owner account created on first register).

- **AI Models** — platform keys + free/paid catalog
- **Credit Packs** — sell credits instead of subscriptions
- **Users** — balances, grant credits, inspect chats/tasks/expenses/activity
- **Payments** — approve credit purchases
- **Integrations** — Google + Notion OAuth apps

## Hosting

- **[HOSTING.md](HOSTING.md)** — Oracle Cloud (always-free VM, persistent data — best for production)
- **[RAILWAY.md](RAILWAY.md)** — Railway (persistent volume)
- **[AWS-HOSTING.md](AWS-HOSTING.md)** — AWS EC2
- **[VERCEL.md](VERCEL.md)** — Vercel (one-click, **demo/preview only** — SQLite data is ephemeral on serverless)

## Notes

- Port: set `PORT` (default `4321`)
- Secrets (platform AI keys, OAuth secrets) live in the DB and are only shown masked
- Landing page: `/landing` — update `APP_URL` near the bottom of `public-landing/index.html`

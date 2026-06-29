# Personal OS

Your all-in-one life & project dashboard — tasks, projects, plans, brainstorming, files, calendar, expenses, habits, health, travel, and a built-in AI assistant that knows your data.

## Run it

```
npm install   (first time only)
npm start
```

Then open **http://localhost:4321** and create your account (username + password). Everything is stored locally in `data/personal-os.db` (SQLite) — nothing leaves your machine except the API calls you configure.

## Modules

| Module | What it does |
|---|---|
| Dashboard | Daily overview: tasks, projects, spending, habits, schedule |
| Daily Tasks | Date-based to-dos with priority, time and status |
| Running / Upcoming Projects | Projects with start & end dates, progress bars, deadline countdowns |
| Next Plans | Future ideas with estimated dates — one click converts them into projects |
| Brainstorming | Sticky-note style idea wall with tags, colors, pinning and search |
| Project Files | Upload/store files per project, download anytime, push to Google Drive |
| Calendar | Month view, local events + Google Calendar sync |
| Expense Tracker | Monthly view, category donut, 6-month trend |
| Habit Tracker | 14-day grid with streak counting |
| Health Dashboard | Weight, sleep, water, steps, mood with trend charts |
| Travel Planner | Trips with budget, packing checklist and itinerary |
| AI Assistant | Chat with an AI that can read all of the above |

## Connecting the AI (no code needed)

Settings → **AI Assistant**:
1. Pick a provider — Anthropic (Claude), OpenAI, or any OpenAI-compatible endpoint.
2. Paste your API key, optionally set a model (e.g. `claude-sonnet-4-6`).
3. Click **Test connection**.

The assistant automatically receives a live snapshot of your tasks, projects, plans, ideas, expenses, habits, health log, trips and calendar with every question.

## Google Calendar & Drive

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an **OAuth client ID** (type: Web application).
2. Add `http://localhost:4321/api/google/callback` as an authorized redirect URI.
3. Enable the **Google Calendar API** and **Google Drive API** for the project.
4. Settings → Google → paste Client ID + Secret → **Connect Google**.
5. Use **Sync Google** on the Calendar page, and the Drive upload button next to any stored file.

## Notion import

1. Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations).
2. In Notion, share the pages you want with that integration (… menu → Connections).
3. Settings → Notion → paste the token → **Browse & import pages** (they land in Brainstorming).

## Selling as a subscription (SaaS)

Personal OS is multi-tenant and ready to sell:

- **The first account ever created becomes the OWNER** (admin, lifetime access). Create yours right after deploying.
- **Every later sign-up is a customer** with a free trial (default 7 days), then their app locks until they pay.
- **Admin Panel** (owner only, in the sidebar): total customers, active vs expired, monthly & total revenue, customers expiring soon.
  - **Payments tab:** customers submit a Transaction ID after paying (bKash/Nagad/etc.); you approve or reject with one click. Approving extends their access automatically (added on top of any time left).
  - **Users tab:** extend +1 month / +1 year, give lifetime, lock, or delete any customer.
  - **Settings tab:** set monthly/yearly price, currency, trial length, and the payment instructions shown to customers.
- **Expired customers** see a renewal screen (plan + payment form) instead of the app — they can pay but not use features until approved.
- New sign-ups and submitted payments **ping your Telegram** instantly (if configured).

Pricing and payment are **manual by design** (no payment gateway needed) — perfect for bKash/Nagad markets. Customers pay you directly and submit the TrxID; you approve from the Admin Panel.

See **[HOSTING.md](HOSTING.md)** for a step-by-step free hosting guide on Oracle Cloud (always-free VM).

## Notes

- Port: set the `PORT` environment variable to change from 4321 (remember to update the Google redirect URI).
- Multiple accounts are supported — each user's data, settings and API keys are separate.
- Secrets (AI key, Notion token, Google secret) are stored in the local database and only ever shown masked.

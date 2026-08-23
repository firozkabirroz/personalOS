# Personal OS — Vercel-এ ডিপ্লয় গাইড

Vercel-এ **এক ক্লিকে ফ্রি ডিপ্লয়** হয়। ডাটা স্থায়ী রাখতে **Neon Postgres** লাগে (`DATABASE_URL`)।

| ব্যবহার | Vercel + Neon |
|---|---|
| Demo / আসল ইউজার + আসল ডাটা | ✅ Neon থাকলে ডাটা থাকে |
| আপলোড করা ফাইল | ⚠️ এখনও `/tmp` — redeploy-এ হারাতে পারে |
| Telegram scheduler | ✅ দুইটা daily Cron (Hobby OK): সকাল `0 4 * * *` UTC = ১০:০০ Dhaka, রাত `0 16 * * *` UTC = ২২:০০ Dhaka |

আপলোড ফাইল স্থায়ী রাখতে চাইলে পরে Vercel Blob যোগ করা যায়। VM চাইলে: **[HOSTING.md](HOSTING.md)** বা **[RAILWAY.md](RAILWAY.md)**।

---

## ধাপ ১ — Neon database

1. https://console.neon.tech → সাইন আপ (GitHub/Google)
2. **Create project** → নাম: `personal-os`
3. Dashboard থেকে **Connection string** কপি করুন (`postgresql://...@...neon.tech/neondb?sslmode=require`)

## ধাপ ২ — GitHub-এ কোড পুশ করুন

কোড আগে থেকেই GitHub-এ থাকলে এই ধাপ লাগবে না।

## ধাপ ৩ — Vercel-এ ইমপোর্ট করুন

1. যান → https://vercel.com → GitHub দিয়ে সাইন ইন
2. **Add New → Project** → আপনার `personalOS` রিপো সিলেক্ট করুন
3. Framework preset: **Other**
4. Root Directory: খালি রাখুন (`mobile-app` সিলেক্ট করবেন না)
5. Node.js Version: **22.x** বা **24.x** (Settings → General)
6. Deploy-এর আগে Environment Variables দিন (নিচের টেবিল)

## ধাপ ৪ — Environment Variable

Vercel dashboard → প্রজেক্ট → **Settings → Environment Variables**:

| Variable | Value | কেন |
|---|---|---|
| `DATABASE_URL` | Neon connection string | ছাড়া ডাটা ephemeral SQLite-এ হারাবে |
| `JWT_SECRET` | লম্বা একটা random string | না দিলে fallback secret — কাজ করবে, নিরাপত্তার জন্য নিজেরটা দিন |
| `DEMO_ADMIN_PASSWORD` | (ঐচ্ছিক) admin পাসওয়ার্ড | default: `admin123` |
| `DEMO_USER_PASSWORD` | (ঐচ্ছিক) demo পাসওয়ার্ড | default: `demo123` |
| `CRON_SECRET` | (ঐচ্ছিক) random string | থাকলে Vercel Cron Bearer দিয়ে পাঠায়; না থাকলেও vercel-cron UA দিয়ে চলবে |

Random secret বানাতে (নিজের পিসিতে):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

দেওয়ার পর **Redeploy** করুন (Deployments → ⋮ → Redeploy)।

## ধাপ ৪ — লগইন করুন (Demo অ্যাকাউন্ট built-in)

Vercel-এ প্রতিটা serverless instance-এর ডাটাবেস আলাদা — তাই **আপনার register করা অ্যাকাউন্ট পরের request-এ নাও থাকতে পারে** ("Invalid username or password" দেখায়)। এজন্য Vercel-এ অ্যাপ নিজেই প্রতিবার এই দুটো অ্যাকাউন্ট বানিয়ে রাখে:

| Role | Username | Password | কোথায় |
|---|---|---|---|
| Admin (owner) | `admin` | `admin123` | `https://your-project.vercel.app/admin` |
| User | `demo` | `demo123` | `https://your-project.vercel.app` |

পাসওয়ার্ড বদলাতে চাইলে env variables দিন: `DEMO_ADMIN_PASSWORD`, `DEMO_USER_PASSWORD` (তারপর Redeploy)।

- `https://your-project.vercel.app` → landing page
- `https://your-project.vercel.app/app` → login / app

## Google / Notion OAuth (ঐচ্ছিক)

Redirect URI-তে আপনার Vercel ডোমেইন দিন:
- Google: `https://your-project.vercel.app/api/google/callback` এবং `https://your-project.vercel.app/api/auth/google/callback`
- Notion: `https://your-project.vercel.app/api/notion/callback`

---

## কীভাবে কাজ করে (টেকনিক্যাল)

| ফাইল | কাজ |
|---|---|
| `api/index.js` | Vercel serverless entry — পুরো Express app এক function-এ চলে |
| `vercel.json` | সব route function-এ পাঠায়, static ফোল্ডারগুলো bundle-এ ঢোকায় |
| `server/app.js` | Express app (server আর Vercel দুজনেই share করে) |
| `DATABASE_URL` | সেট থাকলে Neon Postgres (স্থায়ী)। না থাকলে SQLite — লোকালে ফাইল, Vercel-এ `/tmp` |
| আপলোড | `DATA_DIR/uploads` — Vercel-এ ephemeral |

## Troubleshoot

| Error | কী করবেন |
|---|---|
| `DATABASE_URL` / Neon connection error | Vercel env-এ `DATABASE_URL` আছে কিনা দেখুন, তারপর Redeploy। |
| Expo / `mobile-app` build error | Root Directory খালি রাখুন। Framework = **Other**। |
| Deploy ok, পেজ খালি / CSS নেই | `vercel.json`-এ `public/**` include আছে কিনা দেখুন, তারপর Redeploy। |

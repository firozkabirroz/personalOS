# Personal OS — Vercel-এ ডিপ্লয় গাইড

Vercel-এ **এক ক্লিকে ফ্রি ডিপ্লয়** হয় — কিন্তু একটা বড় সীমাবদ্ধতা আছে, আগে সেটা পড়ুন।

## ⚠️ সবচেয়ে গুরুত্বপূর্ণ কথা

Vercel **serverless** — এর কোনো স্থায়ী ডিস্ক নেই। Personal OS-এর ডাটাবেস (SQLite) ও আপলোড করা ফাইল `/tmp`-এ থাকে, যেটা **কিছুক্ষণ পরপর মুছে যায়** (প্রতি নতুন deployment ও cold start-এ)।

| ব্যবহার | Vercel ঠিক আছে? |
|---|---|
| Demo / preview / ক্লায়েন্টকে দেখানো | ✅ একদম ঠিক আছে |
| আসল ইউজার + আসল ডাটা | ❌ না — ডাটা হারাবে |

আসল ব্যবহারের জন্য: **[HOSTING.md](HOSTING.md)** (Oracle ফ্রি VM) বা **[RAILWAY.md](RAILWAY.md)** দেখুন — ওখানে ডাটা স্থায়ী থাকে।

আরও যা Vercel-এ কাজ করবে না:
- **Telegram scheduler** (সকাল/রাতের অটো রিপোর্ট) — serverless-এ background timer চলে না। ম্যানুয়াল Telegram forward ঠিকই কাজ করে।

---

## ধাপ ১ — GitHub-এ কোড পুশ করুন

কোড আগে থেকেই GitHub-এ থাকলে এই ধাপ লাগবে না।

## ধাপ ২ — Vercel-এ ইমপোর্ট করুন

1. যান → https://vercel.com → GitHub দিয়ে সাইন ইন
2. **Add New → Project** → আপনার `personalOS` রিপো সিলেক্ট করুন
3. Framework preset: **Other** (অটো ডিটেক্ট হলে কিছু বদলাতে হবে না)
4. **Deploy** চাপুন — ২-৩ মিনিটে লাইভ

## ধাপ ৩ — Environment Variable দিন (গুরুত্বপূর্ণ)

Vercel dashboard → আপনার প্রজেক্ট → **Settings → Environment Variables**:

| Variable | Value | কেন |
|---|---|---|
| `JWT_SECRET` | লম্বা একটা random string (নিচে দেখুন) | না দিলে fallback secret ব্যবহার হয় — কাজ করবে, কিন্তু নিরাপত্তার জন্য নিজেরটা দিন |
| `DEMO_ADMIN_PASSWORD` | (ঐচ্ছিক) admin-এর পাসওয়ার্ড | default: `admin123` |
| `DEMO_USER_PASSWORD` | (ঐচ্ছিক) demo user-এর পাসওয়ার্ড | default: `demo123` |

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
| User (100 credits) | `demo` | `demo123` | `https://your-project.vercel.app` |

পাসওয়ার্ড বদলাতে চাইলে env variables দিন: `DEMO_ADMIN_PASSWORD`, `DEMO_USER_PASSWORD` (তারপর Redeploy)।

- `https://your-project.vercel.app/landing` → landing page

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
| DB path | Vercel-এ অটো `/tmp/personal-os-data` (ephemeral) |

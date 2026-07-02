# Personal OS — Railway-তে ফ্রি হোস্টিং গাইড

Railway আপনার Node.js অ্যাপকে একটি Docker container-এ চালায় — `better-sqlite3`,
ফাইল আপলোড, Telegram scheduler সব কাজ করবে।
ফ্রি টিয়ারে **$5 ক্রেডিট/মাস** পাবেন, একজন ব্যবহারকারীর জন্য যথেষ্ট।

> ⏱ সময় লাগবে ~১০ মিনিট।

---

## ধাপ ১ — GitHub-এ কোড পুশ করুন

আপনার প্রজেক্ট ফোল্ডারে PowerShell খুলুন:

```powershell
cd "D:\Cladue Project\Personal OS"
git add .
git commit -m "ready for railway"
```

GitHub-এ একটি নতুন রিপো তৈরি করুন (github.com → New Repository → নাম দিন
`personal-os` → **Private** রাখুন → Create), তারপর:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/personal-os.git
git branch -M main
git push -u origin main
```

---

## ধাপ ২ — Railway-তে সাইন আপ ও ডিপ্লয়

1. যান → https://railway.app
2. **"Login"** → **GitHub দিয়ে সাইন ইন** করুন
3. **"New Project"** → **"Deploy from GitHub Repo"**
4. আপনার `personal-os` রিপো সিলেক্ট করুন
5. Railway স্বয়ংক্রিয়ভাবে `Dockerfile` চিনবে এবং বিল্ড শুরু করবে
6. ২-৩ মিনিট অপেক্ষা করুন — বিল্ড শেষ হলে সবুজ **"Active"** দেখাবে

---

## ধাপ ৩ — Volume যোগ করুন (অত্যন্ত গুরুত্বপূর্ণ!)

⚠️ **Volume ছাড়া প্রতিবার redeploy-এ আপনার ডাটাবেস ও আপলোড ফাইল মুছে যাবে!**

1. Railway dashboard-এ আপনার service-এ ক্লিক করুন
2. **Settings** ট্যাবে যান
3. **Volume** সেকশনে → **"Add Volume"** ক্লিক করুন
4. **Mount Path:** `/app/data`
5. **Save** করুন — Railway স্বয়ংক্রিয়ভাবে রিস্টার্ট করবে

---

## ধাপ ৪ — পাবলিক URL তৈরি করুন

1. আপনার service → **Settings** → **Networking**
2. **"Generate Domain"** ক্লিক করুন
3. আপনি পাবেন: `https://personal-os-xxxx.up.railway.app`
4. এই URL-এ গেলেই আপনার অ্যাপ লাইভ!

---

## ধাপ ৫ — Environment Variables (ঐচ্ছিক)

Railway dashboard → আপনার service → **Variables** ট্যাব:

| Variable | কখন দরকার |
|---|---|
| `PORT` | দরকার নেই — Railway নিজেই সেট করে |
| `GEMINI_API_KEY` | AI চ্যাট ফিচার ব্যবহার করলে |
| `GOOGLE_CLIENT_ID` | Google Calendar sync করলে |
| `GOOGLE_CLIENT_SECRET` | Google Calendar sync করলে |

---

## ধাপ ৬ — Custom Domain (ঐচ্ছিক)

1. **Settings** → **Networking** → **"Custom Domain"**
2. আপনার domain লিখুন (যেমন `os.yourdomain.com`)
3. Railway একটি CNAME value দেবে
4. আপনার DNS provider-এ CNAME record যোগ করুন:
   - **Type:** CNAME
   - **Name:** os (বা আপনার subdomain)
   - **Value:** Railway-র দেওয়া value
5. SSL সার্টিফিকেট স্বয়ংক্রিয়ভাবে তৈরি হবে

---

## আপডেট ও রক্ষণাবেক্ষণ

| কাজ | পদ্ধতি |
|---|---|
| নতুন কোড ডিপ্লয় | `git push` করলেই Railway স্বয়ংক্রিয়ভাবে redeploy করবে |
| লগ দেখা | Dashboard → আপনার service → **Deployments** → লগ আইকন |
| রিস্টার্ট | Dashboard → **Deployments** → ⋮ মেনু → **Restart** |
| ব্যাকআপ | Volume-এর ডাটা Railway-তে থাকে; নিরাপত্তায় মাঝে মাঝে ডাটাবেস ডাউনলোড করুন |

---

## ⚠️ মনে রাখবেন

- **ফ্রি টিয়ার:** $5 ক্রেডিট/মাস পাবেন — ১-২ জন ব্যবহারকারীর জন্য যথেষ্ট
- ক্রেডিট শেষ হলে সার্ভিস **pause** হবে, ডাটা মুছবে না
- **Volume মুছবেন না** — এতে আপনার সব ডাটা (ডাটাবেস + আপলোড) আছে
- Redeploy-তে ডাটা হারাবে না যদি Volume সেটআপ ঠিক থাকে
- ব্যবসা বড় হলে Railway Pro ($5/মাস) বা VPS-এ মাইগ্রেট করুন

---

## প্রজেক্টে যা যোগ হয়েছে

| ফাইল | কাজ |
|---|---|
| `Dockerfile` | Railway-তে সঠিকভাবে `better-sqlite3` বিল্ড করে |
| `railway.toml` | Railway-কে Dockerfile ব্যবহার, healthcheck, ও restart policy জানায় |
| `.dockerignore` | `node_modules`, `data`, `.git` বাদ দিয়ে ইমেজ ছোট রাখে |

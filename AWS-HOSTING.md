# Personal OS — AWS EC2 (Ubuntu 22.04)-এ হোস্টিং গাইড

আপনি ইতিমধ্যে EC2 instance বানিয়ে ফেলেছেন (Ubuntu 22.04, .pem key)। এখন থেকে ধাপে ধাপে দেখানো হলো কীভাবে সেখানে Personal OS চালাবেন — always-on, নিজের domain + ফ্রি HTTPS সহ।

> ⚠️ **AWS ফ্রি টিয়ার নোট:** নতুন অ্যাকাউন্টে **t2.micro / t3.micro** ১২ মাস ফ্রি (মাসে ৭৫০ ঘণ্টা)। ১২ মাস পরে বা অন্য instance type হলে চার্জ শুরু হবে — Billing Dashboard-এ নজর রাখুন।

---

## ধাপ ১ — Security Group-এ পোর্ট খুলুন

1. AWS Console → **EC2 → Instances** → আপনার instance ক্লিক করুন
2. নিচে **Security** ট্যাব → Security Group-এর নামে ক্লিক
3. **Edit inbound rules** → **Add rule** দিয়ে এই তিনটা নিশ্চিত করুন:

| Type | Port | Source |
|---|---|---|
| SSH | 22 | My IP (নিরাপদ) বা Anywhere |
| HTTP | 80 | Anywhere (0.0.0.0/0) |
| HTTPS | 443 | Anywhere (0.0.0.0/0) |

**Save rules**।

---

## ধাপ ২ — Elastic IP লাগান (গুরুত্বপূর্ণ)

সাধারণ EC2 public IP প্রতিবার **restart** করলে বদলে যায় — domain সেটাপের জন্য এটা সমস্যা করবে। তাই একটা স্থায়ী IP নিন:

1. EC2 Console → বাঁ পাশে **Network & Security → Elastic IPs**
2. **Allocate Elastic IP address** → Allocate
3. নতুন IP সিলেক্ট করে **Actions → Associate Elastic IP address** → আপনার instance বেছে **Associate**

এই IP-টাই এখন থেকে আপনার সার্ভারের স্থায়ী ঠিকানা (এটা ফ্রি, যতক্ষণ instance-এর সাথে যুক্ত থাকে)।

---

## ধাপ ৩ — সার্ভারে SSH করুন

Windows PowerShell-এ (যেখানে `.pem` ফাইল আছে সেই ফোল্ডারে গিয়ে):

```powershell
icacls .\your-key.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i .\your-key.pem ubuntu@YOUR_ELASTIC_IP
```

প্রথমবার `yes` লিখে এন্টার দিন।

> Username `ubuntu` (Amazon-এর Ubuntu AMI-এ ডিফল্ট)। Amazon Linux হলে `ec2-user` হতো, কিন্তু আপনি Ubuntu বেছেছেন তাই `ubuntu`।

---

## ধাপ ৪ — Node.js + দরকারি টুল ইনস্টল

সার্ভারের ভেতরে:

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git build-essential
sudo npm install -g pm2
sudo apt install -y nginx certbot python3-certbot-nginx
```

চেক করুন: `node -v` → v22.x দেখানো উচিত।

---

## ধাপ ৫ — অ্যাপ আনুন (GitHub থেকে)

```bash
cd ~
git clone https://github.com/firozkabirroz/personalOS.git personal-os
cd personal-os
npm install --omit=dev
```

> সবচেয়ে সাম্প্রতিক ফিচার (SaaS/billing) পেতে সঠিক branch/main নিশ্চিত করুন। PR merge হয়ে থাকলে `main` থেকেই সব আসবে।

---

## ধাপ ৬ — pm2 দিয়ে চালু করুন (সবসময় অন, ক্র্যাশ হলেও অটো রিস্টার্ট)

```bash
cd ~/personal-os
pm2 start server/index.js --name personal-os
pm2 save
pm2 startup
```

শেষ কমান্ডটা একটা `sudo env PATH=... pm2 startup ...` লাইন দেখাবে — সেটা কপি করে আলাদাভাবে চালান, যাতে সার্ভার রিবুট হলেও অ্যাপ নিজে নিজে চালু হয়।

পরীক্ষা:
```bash
curl http://localhost:4321/api/auth/status
```
`{"hasUsers":...}` দেখালে অ্যাপ ঠিকঠাক চলছে।

---

## ধাপ ৭ — Domain যুক্ত করুন

আপনার domain রেজিস্ট্রারে (Namecheap, GoDaddy, Cloudflare যেখানেই কিনেছেন) একটা **A record** বানান:

```
Type: A
Name: os  (বা @ যদি রুট ডোমেইন চান)
Value: YOUR_ELASTIC_IP
```

DNS propagate হতে কয়েক মিনিট থেকে কয়েক ঘণ্টা লাগতে পারে। চেক করুন:
```bash
nslookup os.yourdomain.com
```

---

## ধাপ ৮ — Nginx reverse proxy + ফ্রি HTTPS

```bash
sudo nano /etc/nginx/sites-available/personal-os
```

পেস্ট করুন (`os.yourdomain.com` নিজের domain দিয়ে বদলান):

```nginx
server {
    listen 80;
    server_name os.yourdomain.com;
    client_max_body_size 100M;
    location / {
        proxy_pass http://localhost:4321;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`Ctrl+O` → এন্টার → `Ctrl+X` দিয়ে সেভ করুন। তারপর:

```bash
sudo ln -s /etc/nginx/sites-available/personal-os /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d os.yourdomain.com
```

certbot ইমেইল চাইবে → terms-এ `Y` → HTTP থেকে HTTPS redirect করতে `2` বেছে নিন।

✅ এখন **https://os.yourdomain.com** এ আপনার অ্যাপ লাইভ!

---

## ধাপ ৯ — Sales/Landing page (রুট ডোমেইনে)

`app.yourdomain.com`-এ চলছে আসল অ্যাপ, আর `yourdomain.com` (রুট) দিয়ে বিক্রি করার landing/sales page দেখাতে পারেন। কোডে এটা `public-landing/index.html`-এ আগে থেকেই আছে — শুধু server করে দিতে হবে।

**১. Root domain-এর জন্য DNS record বানান** (Cloudflare বা যেখানেই):
```
Type: A
Name: @  (এবং চাইলে www)
Value: YOUR_ELASTIC_IP
Proxy: DNS only (ধূসর মেঘ)
```

**২. Landing page-এর `APP_URL` ঠিক করুন** (যদি `app.yourdomain.com` ছাড়া অন্য নাম ব্যবহার করেন):
```bash
nano ~/personal-os/public-landing/index.html
```
এই লাইনটা খুঁজুন এবং নিজের app domain বসান:
```js
: 'https://app.syndaps.com';   // production: change to your app's URL
```

**৩. এই ডোমেইনের জন্য আলাদা nginx block বানান** (static file, Node app-এর সাথে proxy নয়):
```bash
sudo nano /etc/nginx/sites-available/landing
```
পেস্ট করুন (`yourdomain.com` বদলান):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    root /home/ubuntu/personal-os/public-landing;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**৪. চালু করুন ও HTTPS নিন:**
```bash
sudo ln -s /etc/nginx/sites-available/landing /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

✅ এখন **https://yourdomain.com** — sales page (প্রাইসিং সরাসরি Admin Panel-এর সেটিং থেকে আসে, তাই দাম বদলালে এখানেও অটো আপডেট হয়), আর **https://app.yourdomain.com** — আসল অ্যাপ।

> `git pull` করলে landing page-ও আপডেট হয়ে যাবে (একই repo-র অংশ)।

---

## ধাপ ১০ — Google OAuth (যদি ব্যবহার করেন)

Google Cloud Console → OAuth client → Authorized redirect URI:
```
https://app.yourdomain.com/api/google/callback
```

---

## রোজকার রক্ষণাবেক্ষণ

| কাজ | কমান্ড (সার্ভারে) |
|---|---|
| লগ দেখা | `pm2 logs personal-os` |
| স্ট্যাটাস | `pm2 status` |
| রিস্টার্ট | `pm2 restart personal-os` |
| নতুন কোড টানা | `cd ~/personal-os && git pull && npm install --omit=dev && pm2 restart personal-os` |

**ব্যাকআপ (গুরুত্বপূর্ণ)** — নিজের পিসিতে (আলাদা PowerShell-এ, `.pem` যেখানে আছে সেখান থেকে):
```powershell
scp -i .\your-key.pem -r ubuntu@YOUR_ELASTIC_IP:~/personal-os/data ./backup-$(Get-Date -Format yyyyMMdd)
```

---

## ⚠️ মনে রাখবেন

- **Elastic IP ফ্রি শুধু যখন instance-এ যুক্ত থাকে** — instance বন্ধ/টার্মিনেট করে IP আলগা রেখে দিলে চার্জ হয়। ব্যবহার না করলে release করে দিন।
- **`data/` ফোল্ডার = আপনার সব ডাটা** (ডাটাবেস + আপলোড) — নিয়মিত ব্যাকআপ নিন
- ফ্রি টিয়ারের ১২ মাস শেষ হওয়ার আগে billing alert সেট করে রাখুন (AWS Billing → Budgets)
- t2.micro/t3.micro (1GB RAM) ছোট ব্যবহারের জন্য যথেষ্ট; কাস্টমার বাড়লে instance resize করা যায় (stop → change instance type → start)

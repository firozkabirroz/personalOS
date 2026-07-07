# Personal OS — Oracle Cloud "Always Free" VM-এ ফ্রি হোস্টিং গাইড

এই গাইড অনুসরণ করলে আপনার Personal OS একটা **চিরকাল ফ্রি** Oracle সার্ভারে চলবে — আসল ডিস্ক, সবসময় চালু, নিজের domain + HTTPS সহ। কাস্টমারের ডাটা নিরাপদ থাকবে, Telegram scheduler চলবে।

> ⏱ সময় লাগবে ~৪৫ মিনিট। ক্রেডিট/ডেবিট কার্ড লাগবে (verify-এর জন্য, চার্জ হবে না — "Always Free" রিসোর্স ব্যবহার করছি)।

---

## ধাপ ১ — Oracle Cloud অ্যাকাউন্ট খুলুন

1. যান → https://www.oracle.com/cloud/free/
2. **"Start for free"** → ইমেইল, দেশ (Bangladesh), ফোন দিয়ে সাইন আপ
3. কার্ড verify করুন (Always Free রিসোর্সে টাকা কাটবে না)
4. **Home Region** বাছাই করার সময় কাছের region নিন (যেমন **Singapore** বা **Mumbai**) — পরে বদলানো যায় না

---

## ধাপ ২ — একটা ফ্রি সার্ভার (VM) বানান

1. Oracle Console-এ বাঁদিকের মেনু → **Compute → Instances → Create Instance**
2. **Name:** `personal-os`
3. **Image and shape** → **Edit**:
   - **Image:** Canonical **Ubuntu 22.04**
   - **Shape:** **Ampere (ARM)** → `VM.Standard.A1.Flex` → **1 OCPU, 6 GB RAM** (Always Free সীমার ভেতরে)
   - যদি "Out of capacity" দেখায়, OCPU 1 / RAM 6GB রেখে আবার চেষ্টা করুন, বা অন্য Availability Domain বাছুন
4. **Add SSH keys** → **Generate a key pair for me** → **দুটো key-ই ডাউনলোড করুন** (private key পরে লাগবে, হারাবেন না)
5. **Create** চাপুন। ২-৩ মিনিটে instance "Running" হবে।
6. instance পেজ থেকে **Public IP address** কপি করে রাখুন (যেমন `140.238.x.x`)

---

## ধাপ ৩ — Firewall খুলুন (পোর্ট ৮০ ও ৪৪৩)

1. Instance পেজে **Primary VNIC → Subnet** লিংকে ক্লিক করুন
2. **Security Lists → Default Security List → Add Ingress Rules**
3. দুটো রুল যোগ করুন (Source CIDR: `0.0.0.0/0`):
   - Destination port **80**
   - Destination port **443**
4. Save।

---

## ধাপ ৪ — সার্ভারে লগইন করুন

Windows-এ **PowerShell** খুলুন (যেখানে private key ডাউনলোড করেছেন সেই ফোল্ডারে):

```powershell
# key ফাইলের নাম ssh-key-xxxx.key ধরে নিচ্ছি
icacls .\ssh-key-xxxx.key /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i .\ssh-key-xxxx.key ubuntu@YOUR_PUBLIC_IP
```

`yes` লিখে এন্টার দিন। এখন আপনি সার্ভারের ভেতরে।

---

## ধাপ ৫ — Node.js + টুল ইনস্টল করুন

সার্ভারের ভেতরে নিচের কমান্ডগুলো এক এক করে চালান:

```bash
sudo apt update && sudo apt upgrade -y
# Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git build-essential
# always-on রাখার জন্য pm2, আর HTTPS-এর জন্য nginx + certbot
sudo npm install -g pm2
sudo apt install -y nginx certbot python3-certbot-nginx
# Ubuntu-র নিজস্ব firewall-ও খুলে দিন
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## ধাপ ৬ — অ্যাপ আপলোড করুন

**সবচেয়ে সহজ উপায় — GitHub দিয়ে** (যেহেতু আপনার কোড GitHub-এ আছে):

```bash
cd ~
git clone https://github.com/firozkabirroz/personalOS.git personal-os
cd personal-os
npm install --omit=dev
```

> বিকল্প: `personal-os-deploy.zip` আপলোড করতে চাইলে নিজের পিসি থেকে আলাদা PowerShell-এ:
> `scp -i .\ssh-key-xxxx.key .\personal-os-deploy.zip ubuntu@YOUR_PUBLIC_IP:~/` — তারপর সার্ভারে `unzip`।

---

## ধাপ ৭ — অ্যাপ চালু করুন (pm2 দিয়ে, সবসময় অন)

```bash
cd ~/personal-os
pm2 start server/index.js --name personal-os
pm2 save
pm2 startup
# উপরের কমান্ড একটা লাইন আউটপুট দেবে যেটা copy করে চালাতে বলবে — সেটা চালান
```

পরীক্ষা: `curl http://localhost:4321/api/auth/status` → `{"hasUsers":...}` দেখালে অ্যাপ চলছে।

---

## ধাপ ৮ — Domain যুক্ত করুন + HTTPS (https://)

1. আপনার domain-এর DNS-এ একটা **A record** বানান:
   `os.yourdomain.com → YOUR_PUBLIC_IP` (domain না থাকলে আপাতত IP দিয়েও চলবে, কিন্তু Google OAuth + HTTPS-এর জন্য domain দরকার)

2. Nginx reverse proxy সেটআপ:

```bash
sudo nano /etc/nginx/sites-available/personal-os
```

নিচের লেখাটা পেস্ট করুন (`os.yourdomain.com` বদলে দিন):

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

`Ctrl+O`, এন্টার, `Ctrl+X` দিয়ে সেভ করে বের হন। তারপর:

```bash
sudo ln -s /etc/nginx/sites-available/personal-os /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# ফ্রি HTTPS সার্টিফিকেট (Let's Encrypt)
sudo certbot --nginx -d os.yourdomain.com
```

certbot ইমেইল চাইবে, terms-এ `Y`, redirect-এ `2` (HTTP→HTTPS) বাছুন।

✅ এখন **https://os.yourdomain.com** এ আপনার অ্যাপ লাইভ! প্রথম যে অ্যাকাউন্ট খুলবেন সেটাই **owner** (admin) হবে।

---

## ধাপ ৯ — Sales/Landing page (রুট ডোমেইনে)

`os.yourdomain.com`-এ আসল অ্যাপ, আর `yourdomain.com` (রুট) দিয়ে বিক্রির landing page দেখাতে পারেন — কোডে `public-landing/index.html`-এ আগে থেকেই আছে।

```bash
# প্রয়োজনে APP_URL বদলান (app.js-এর মতো ঠিক করে): nano ~/personal-os/public-landing/index.html
sudo tee /etc/nginx/sites-available/landing <<'EOF'
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    root /home/ubuntu/personal-os/public-landing;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
EOF
sudo ln -s /etc/nginx/sites-available/landing /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

প্রাইসিং সরাসরি Admin Panel-এর সেটিং থেকে আসে — দাম বদলালে landing page-এও অটো আপডেট হয়।

---

## ধাপ ১০ — Google OAuth আপডেট (যদি ব্যবহার করেন)

Google Cloud Console → আপনার OAuth client → Authorized redirect URI:
`https://os.yourdomain.com/api/google/callback`

---

## রোজকার রক্ষণাবেক্ষণ

| কাজ | কমান্ড (সার্ভারে) |
|---|---|
| লগ দেখা | `pm2 logs personal-os` |
| রিস্টার্ট | `pm2 restart personal-os` |
| নতুন কোড টানা | `cd ~/personal-os && git pull && npm install --omit=dev && pm2 restart personal-os` |
| **ব্যাকআপ** (গুরুত্বপূর্ণ) | `data/` ফোল্ডার কপি রাখুন — এতে ডাটাবেস + সব আপলোড আছে |

ব্যাকআপ নিজের পিসিতে নামাতে (আলাদা PowerShell-এ):
```powershell
scp -i .\ssh-key-xxxx.key -r ubuntu@YOUR_PUBLIC_IP:~/personal-os/data ./backup-$(Get-Date -Format yyyyMMdd)
```

---

## ⚠️ মনে রাখবেন

- **`data/` ফোল্ডারই আপনার সব** — নিয়মিত ব্যাকআপ নিন (cron দিয়ে অটো করা যায়)
- Always Free shape (A1.Flex 1 OCPU / 6GB) যথেষ্ট কয়েকশো ইউজারের জন্য; বেশি হলে Oracle-এ paid shape-এ আপগ্রেড সহজ
- `better-sqlite3` Linux ARM-এ npm install করলেই prebuilt binary নামবে — কোনো ঝামেলা নেই
- ব্যবসা বড় হলে managed ব্যাকআপ + আলাদা ডাটাবেসের কথা ভাববেন

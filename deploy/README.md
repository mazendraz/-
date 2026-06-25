# نشر Al Assema على VPS (Ubuntu)

نشر بدومين واحد: الـ frontend ثابت + الـ backend (Next.js) خلف **Caddy** (HTTPS
تلقائي). نفس الـ origin → **مفيش CORS** ولا تعقيد.

```
https://your-domain.com/        →  app/dist (واجهة ثابتة، SPA fallback)
https://your-domain.com/api/*   →  Next.js على localhost:3000 (PM2)
```

> قاعدة البيانات على Supabase (بعيدة)، والـ migrations + الـ seed + الأدمن
> **اتعملوا بالفعل** من جهازك. فعلى السيرفر مش محتاج تعيدهم — بس محتاج `api/.env`
> فيه نفس القيم. (سكربت النشر بيشغّل `prisma migrate deploy` وهو آمن/idempotent.)

---

## أ) إعداد لمرة واحدة على السيرفر

### 1. الأساسيات
```bash
# Node 22 + git + build tools
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential

# PM2 (مدير العمليات) و Caddy (reverse proxy + HTTPS)
sudo npm i -g pm2
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

# فتح المنافذ
sudo ufw allow 80,443/tcp
```

### 2. جلب الكود
```bash
sudo mkdir -p /var/www && sudo chown -R $USER:$USER /var/www
cd /var/www
git clone https://github.com/mazendraz/-.git alassema
cd alassema
```

### 3. إنشاء `api/.env` على السيرفر  ⚠️ (الأسرار مش موجودة في git)
انسخ القيم من `.env` بتاعك المحلي (نفس القيم اللي بتشتغل دلوقتي):
```bash
cp api/.env.example api/.env
nano api/.env
```
لازم تملأ على الأقل:
- `DATABASE_URL` و `DIRECT_URL` → نفس الـ Session pooler (5432) الشغّال عندك.
- `JWT_SECRET` → نفس السر القوي اللي ولّدناه (أو ولّد واحد جديد بـ `openssl rand -base64 48`).
- `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY`.
- `CORS_ALLOWED_ORIGINS` → **سيبه فاضي** (دومين واحد، مفيش CORS).

### 4. أول build + تشغيل
```bash
# باك إند
cd /var/www/alassema/api
npm ci
npx prisma generate
npx prisma migrate deploy        # idempotent — هيقول "up to date"
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup                      # نفّذ السطر اللي هيطبعه علشان PM2 يشتغل بعد reboot

# فرونت إند (VITE_API_URL=/api مهم — same-origin)
cd /var/www/alassema/app
npm ci
VITE_API_URL=/api npm run build
sudo mkdir -p /var/www/alassema/dist
sudo cp -r dist/* /var/www/alassema/dist/
```

### 5. Caddy
```bash
sudo cp /var/www/alassema/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # غيّر your-domain.com لدومينك الحقيقي
sudo systemctl reload caddy
```
> قبلها: اعمل **DNS A record** لدومينك يشاور على IP السيرفر. Caddy هيجيب شهادة
> HTTPS تلقائيًا أول ما الدومين يوصله.

### 6. تأكيد
- `https://your-domain.com/api/health` → بيرجّع `{ ok: true }`.
- `https://your-domain.com/` → الموقع شغّال والشركات ظاهرة.
- `https://your-domain.com/admin` → سجّل دخول ببيانات الأدمن.

---

## ب) التحديثات بعد كده (أمر واحد)
بعد أي `git push` على main:
```bash
cd /var/www/alassema
bash deploy/deploy.sh
```
بيعمل: pull → build للاتنين → `migrate deploy` → نشر الواجهة → `pm2 reload`.

---

## ملاحظات
- **Rate limiting** in-memory، فإحنا مشغّلين **نسخة واحدة** من الـ API (fork mode)
  علشان يفضل صح. لو هتعمل cluster/scale، اربط Upstash Redis الأول.
- **رفع الصور** بيتخزّن في Supabase Storage (الـ 4 buckets اللي عملتهم) — مش على
  قرص السيرفر، فالنشر مايأثرش عليها.
- لو فضّلت **subdomain منفصل للـ API** (مثلاً `api.your-domain.com`) بدل
  `/api`: ابنِ الواجهة بـ `VITE_API_URL=https://api.your-domain.com/api`، وحُط
  `CORS_ALLOWED_ORIGINS=https://your-domain.com` في `api/.env`، وزوّد block في
  الـ Caddyfile للـ subdomain.

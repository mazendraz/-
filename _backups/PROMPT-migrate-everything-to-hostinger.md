# برومبت للسيرفر — نقل كل حاجة (قاعدة البيانات + الصور) إلى سيرفر هوستنجر

انسخه بالكامل وابعته لـ Claude Code اللي شغّال على سيرفر الإنتاج (هوستنجر VPS).

**الهدف:** نخلّي **كل حاجة على الـ VPS** — قاعدة البيانات (Postgres) **وصور المستخدمين** — عشان الـ auto-backup بتاع هوستنجر (+ باك-أب `pg_dump` بتاعنا) يحافظ على كل حاجة، ونبطّل نعتمد على Supabase.

**السياق:** المشروع Next.js API (PM2) + Vite frontend (Caddy). حاليًا Supabase بيوفّر: (١) Postgres للبيانات، (٢) Storage للصور (buckets: logos/covers/gallery/projects). الـ Auth خاص بالتطبيق (JWT، مش Supabase). الكود اتحدّث ودلوقتي بيدعم تخزين الصور محليًا عبر `STORAGE_DRIVER=local` (مع `UPLOADS_DIR` و `PUBLIC_UPLOADS_BASE_URL`) — لازم تكون آخر نسخة من الكود متسطّبة على السيرفر قبل ما تبدأ.

**قواعد عامة:** اشتغل بالترتيب، اطبع نتيجة كل مرحلة، **متمسحش/متوقفش مشروع Supabase** (يفضل fallback لحد ما الجديد يثبت أيام). لو أي خطوة فشلت، ارجع الإعدادات القديمة و`pm2 reload` علشان الموقع يرجع فورًا.

---

## المرحلة ٠ — تقييم (قراءة فقط، بلّغ واستنى تأكيد)
```bash
free -h; df -h /; nproc; lsb_release -a 2>/dev/null
grep -n "DATABASE_URL\|NEXT_PUBLIC_SUPABASE_URL\|STORAGE_DRIVER" /var/www/alassema/api/.env | sed 's/:[^:@]*@/:****@/'
caddy version 2>/dev/null; ls /etc/caddy/Caddyfile
```
سجّل: مواصفات السيرفر، الدومين، قيمة `DATABASE_URL` الحالية (Supabase) و`NEXT_PUBLIC_SUPABASE_URL`. اطبع خطة مختصرة واستنى تأكيد قبل المرحلة ٢.

## المرحلة ١ — Postgres محلي على الـ VPS
```bash
sudo apt-get update && sudo apt-get install -y postgresql-17 postgresql-client-17 || sudo apt-get install -y postgresql postgresql-client
sudo -u postgres psql -c "CREATE ROLE alassema WITH LOGIN PASSWORD '<باسورد-قوي>';"
sudo -u postgres psql -c "CREATE DATABASE alassema OWNER alassema;"
```
**أمان:** في `postgresql.conf` خلّي `listen_addresses = 'localhost'`، ومتفتحش بورت 5432 للنت. `sudo systemctl restart postgresql`.

## المرحلة ٢ — نقل بيانات قاعدة البيانات (Supabase → محلي)
```bash
SUPA_URL="<DATABASE_URL بتاعة Supabase>"
LOCAL_URL="postgresql://alassema:<الباسورد>@localhost:5432/alassema"
pg_dump "$SUPA_URL" --no-owner --no-privileges --format=custom --file=/tmp/supa.dump
pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$LOCAL_URL" /tmp/supa.dump
psql "$LOCAL_URL" -c 'select (select count(*) from "User") users, (select count(*) from "Company") companies, (select count(*) from "AppSetting") settings;'
```

## المرحلة ٣ — تخزين الصور محليًا على الـ VPS
1. **مجلد الصور** (على قرص بيتغطّى بباك-أب هوستنجر):
   ```bash
   sudo mkdir -p /var/www/alassema/uploads/{logos,covers,gallery,projects}
   sudo chown -R $(whoami) /var/www/alassema/uploads
   ```
2. **Caddy يخدم `/uploads/*`** كملفات ثابتة. ضيف في `/etc/caddy/Caddyfile` جوه بلوك الدومين (قبل الـ reverse_proxy بتاع الـ API عشان الأسبقية):
   ```
   handle_path /uploads/* {
       root * /var/www/alassema/uploads
       file_server
       header Cache-Control "public, max-age=31536000, immutable"
   }
   ```
   بعدها: `sudo systemctl reload caddy`. اختبر بملف تجريبي إن `https://<الدومين>/uploads/test.txt` بيفتح.
3. **اتأكد إن الكود المتسطّب فيه driver التخزين المحلي** (دالة `uploadToLocalDisk` في `api/src/lib/services/upload.service.ts`). لو مش موجود، اعمل `git pull` وطبّق آخر نسخة (`bash deploy/deploy.sh`).
4. **انقل الصور الموجودة من Supabase Storage → المجلد المحلي.** استخدم S3 endpoint بتاع Supabase (لوحة Supabase → Storage → S3 access keys)، واعمل remote في rclone عليه:
   ```bash
   sudo apt-get install -y rclone
   rclone config     # remote اسمه supa-s3 نوعه s3، provider Other، endpoint بتاع Supabase Storage
   for b in logos covers gallery projects; do
     rclone copy "supa-s3:$b" "/var/www/alassema/uploads/$b/" --no-traverse
   done
   ls -R /var/www/alassema/uploads | head
   ```
   (بديل لو الـ S3 keys مش متاحة: نزّل عبر Storage REST API بالـ service-role key.)
5. **أعِد كتابة روابط الصور في قاعدة البيانات** من رابط Supabase للرابط المحلي الجديد. الشكل القديم:
   `https://<REF>.supabase.co/storage/v1/object/public/<bucket>/<file>` ← الجديد: `https://<الدومين>/uploads/<bucket>/<file>`.
   - افحص `api/prisma/schema.prisma` وحدّد كل الأعمدة اللي بتخزّن روابط صور (المعروف: `Company.logo`, `Company.cover`, `Project.img`, `Category.cover`، وكمان معرض الصور `gallery` — شوف نوعه String[]/Json/جدول منفصل).
   - لكل عمود نصّي:
     ```sql
     UPDATE "Company" SET logo  = replace(logo,  'https://<REF>.supabase.co/storage/v1/object/public/', 'https://<الدومين>/uploads/') WHERE logo  LIKE '%supabase.co/storage%';
     UPDATE "Company" SET cover = replace(cover, 'https://<REF>.supabase.co/storage/v1/object/public/', 'https://<الدومين>/uploads/') WHERE cover LIKE '%supabase.co/storage%';
     UPDATE "Project" SET img   = replace(img,   'https://<REF>.supabase.co/storage/v1/object/public/', 'https://<الدومين>/uploads/') WHERE img   LIKE '%supabase.co/storage%';
     UPDATE "Category" SET cover= replace(cover, 'https://<REF>.supabase.co/storage/v1/object/public/', 'https://<الدومين>/uploads/') WHERE cover LIKE '%supabase.co/storage%';
     ```
   - للأعمدة من نوع array/JSON (زي gallery): اعمل الاستبدال على التمثيل النصّي بحذر (cast → replace → cast back)، أو دوّر أولًا عن أي روابط باقية:
     ```sql
     -- للتأكد إن مفيش روابط Supabase فاضلة في أي عمود نصّي:
     -- (نفّذها بعد الاستبدال؛ المفروض ترجع صفر)
     SELECT 'Company.logo' col, count(*) FROM "Company" WHERE logo LIKE '%supabase.co/storage%'
     UNION ALL SELECT 'Company.cover', count(*) FROM "Company" WHERE cover LIKE '%supabase.co/storage%'
     UNION ALL SELECT 'Project.img', count(*) FROM "Project" WHERE img LIKE '%supabase.co/storage%';
     ```

## المرحلة ٤ — التحويل (cutover)
حدّث `/var/www/alassema/api/.env`:
```
DATABASE_URL="postgresql://alassema:<الباسورد>@localhost:5432/alassema?schema=public"
DIRECT_URL="postgresql://alassema:<الباسورد>@localhost:5432/alassema?schema=public"
STORAGE_DRIVER="local"
UPLOADS_DIR="/var/www/alassema/uploads"
PUBLIC_UPLOADS_BASE_URL="https://<الدومين>/uploads"
```
(سيب مفاتيح Supabase في `.env` مؤقتًا كـ fallback؛ مش هتُستخدم للرفع بعد كده.) بعدها:
```bash
cd /var/www/alassema/api && npx prisma migrate deploy && pm2 reload alassema-api
curl -s https://<الدومين>/api/ready       # {"ok":true,"db":"up"}
```
افتح الموقع: الداتا بتظهر؟ الصور القديمة بتحمّل من `/uploads/`؟ جرّب ترفع صورة جديدة من لوحة الأدمن واتأكد إنها اتخزّنت في المجلد المحلي ورابطها `/uploads/...`.

## المرحلة ٥ — الباك-أب: نسختين، بمزوّدين إنت عارفهم بس (هوستنجر + Supabase)
الهدف: الداتا في **مكانين مش مكان واحد**، وبسيط.
1. **المكان ١ — هوستنجر:** فعّل الأوتو باك-أب من لوحة هوستنجر (بيصوّر قرص الـ VPS اللي فيه **القاعدة + مجلد `/uploads` + مجلد الـ dumps**). وكمان `deploy/backup.sh` بيسيب نسخة `pg_dump` يومية على قرص السيرفر في `/var/www/alassema/backups` (فتتصوّر مع الـ snapshot).
2. **المكان ٢ — Supabase Storage:** خلّي `backup.sh` يرفع نفس النسخة على Supabase (نفس حسابك، مفيش مزوّد جديد):
   ```bash
   sudo apt-get install -y rclone
   rclone config    # remote اسمه supa-s3 نوعه s3 على Supabase Storage (Settings → Storage → S3 keys)
   # في api/.env على السيرفر (أو كمتغيّر بيئة للـ cron): BACKUP_REMOTE="supa-s3:alassema-backups"
   crontab -e       # 0 3 * * *  BACKUP_REMOTE=supa-s3:alassema-backups /var/www/alassema/deploy/backup.sh >> /var/log/alassema-backup.log 2>&1
   /var/www/alassema/deploy/backup.sh    # شغّل أول نسخة وتأكد إنها اتحفظت محليًا واترفعت
   ```
   لو سبت `BACKUP_REMOTE` فاضي، السكربت بياخد النسخة المحلية بس (المكان ١) من غير أخطاء.
   (ملاحظة: snapshot هوستنجر ممكن ياخد نسخة نص عملية كتابة للقاعدة؛ الـ pg_dump المنطقي أأمن — عشان كده بناخد الاتنين.)

## بعد ما كله يثبت (أيام)
- لما تتأكد إن الصور والداتا شغّالة من السيرفر، تقدر تخفّض/تلغي مشروع Supabase وتشيل مفاتيحه من `.env`.
- حدّث `deploy/README.md` و`deploy/RESTORE.md`: القاعدة والصور بقوا محليين، والاسترجاع بقى من باك-أب هوستنجر + `pg_dump` + مجلد `/uploads`.

## أمان أثناء التنفيذ
- متفتحش بورت Postgres للنت. متمسحش Supabase قبل التأكد. اعمل التحويل وقت زحمة قليلة (ثواني downtime). لو فشل أي شي، رجّع `.env` القديم و`pm2 reload`.

# برومبت للسيرفر — نقل قاعدة البيانات من Supabase إلى Postgres على سيرفر هوستنجر

انسخه بالكامل وابعته لـ Claude Code اللي شغّال على سيرفر الإنتاج (هوستنجر VPS).

أنت على سيرفر الإنتاج لمشروع "العاصمة" (Al Assema): Next.js API (PM2) + Vite frontend (Caddy). قاعدة البيانات حاليًا على **Supabase** (Postgres 17)، والتطبيق بيستخدم Supabase كمان لـ **Storage الصور** (buckets: logos/covers/gallery/projects). الـ Auth بتاع التطبيق **خاص** (JWT + bcrypt، مش Supabase Auth).

**الهدف:** ننقل **قاعدة البيانات (Postgres) بس** لتكون مستضافة محليًا على نفس الـ VPS، عشان تتغطّى بالـ auto-backup بتاع هوستنجر + الـ `pg_dump` بتاعنا. **الصور تفضل على Supabase Storage** (منقلهاش في المهمة دي).

اشتغل بحذر، ونفّذ بالترتيب، واطبع نتيجة كل مرحلة. **متمسحش مشروع Supabase ولا توقفه** — يفضل كخطة رجوع (fallback) لحد ما الجديد يثبت إنه شغّال كويس أيام.

---

## المرحلة ٠ — تقييم (قراءة فقط، بلّغ قبل ما تكمّل)
1. مواصفات السيرفر: `free -h`, `df -h /`, `nproc`, وإصدار الـ OS. اتأكد إن فيه RAM/disk كفاية لـ Postgres (على الأقل ~1GB RAM فاضية و2GB disk).
2. أكّد اللي التطبيق بيستخدم Supabase فيه: ابحث في `api/src` عن `@supabase/supabase-js` و `supabase.storage` — المفروض تلاقي الصور بس. الداتا كلها عبر Prisma/`DATABASE_URL`.
3. اقرأ `api/.env` الحالي على السيرفر وسجّل قيمة `DATABASE_URL` الحالية (Supabase) في مكان آمن مؤقت — دي مصدر النقل.
4. اطبع خطة مختصرة بالخطوات اللي جاية واستنى تأكيد قبل المرحلة ٢ فما فوق.

## المرحلة ١ — تجهيز Postgres محلي على الـ VPS
1. ثبّت Postgres **17** (يطابق نسخة Supabase الحالية عشان النقل ينجح):
   ```bash
   sudo apt-get update && sudo apt-get install -y postgresql-17 postgresql-client-17 || sudo apt-get install -y postgresql postgresql-client
   psql --version
   ```
2. اعمل قاعدة بيانات ومستخدم مخصّص بباسورد قوي:
   ```bash
   sudo -u postgres psql -c "CREATE ROLE alassema WITH LOGIN PASSWORD '<باسورد-قوي-عشوائي>';"
   sudo -u postgres psql -c "CREATE DATABASE alassema OWNER alassema;"
   ```
3. **أمان (مهم):** خلّي Postgres يسمع على localhost بس، ومتفتحش بورت 5432 للنت:
   - في `postgresql.conf`: `listen_addresses = 'localhost'`
   - اتأكد إن الفايروول (ufw/hostinger) مش فاتح 5432 للخارج.
   ```bash
   sudo systemctl restart postgresql
   ```

## المرحلة ٢ — نقل الداتا من Supabase إلى المحلي
> ده بيقرأ من Supabase (غير مدمّر) ويكتب في القاعدة المحلية الجديدة الفاضية.
```bash
SUPA_URL="<DATABASE_URL بتاعة Supabase من المرحلة ٠>"
LOCAL_URL="postgresql://alassema:<الباسورد>@localhost:5432/alassema"

# 1) صوّر الحالة الحالية من Supabase (يشمل Users/AppSettings/AuditLog + الكتالوج)
pg_dump "$SUPA_URL" --no-owner --no-privileges --format=custom --file=/tmp/supa.dump
ls -lh /tmp/supa.dump

# 2) استعِد جوه القاعدة المحلية
pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$LOCAL_URL" /tmp/supa.dump

# 3) اتأكد من الأعداد
psql "$LOCAL_URL" -c 'select
  (select count(*) from "User") users,
  (select count(*) from "Company") companies,
  (select count(*) from "AppSetting") settings,
  (select count(*) from "AuditLog") audit;'
```
لو ظهرت مشاكل امتدادات (extensions) زي `pgcrypto`/`uuid-ossp`، ثبّتها في القاعدة المحلية وأعِد خطوة الاستعادة.

## المرحلة ٣ — التحويل (cutover)
1. حدّث `api/.env` على السيرفر (الإنتاج): غيّر **`DATABASE_URL` و `DIRECT_URL`** لـ:
   ```
   DATABASE_URL="postgresql://alassema:<الباسورد>@localhost:5432/alassema?schema=public"
   DIRECT_URL="postgresql://alassema:<الباسورد>@localhost:5432/alassema?schema=public"
   ```
   **سيب** `NEXT_PUBLIC_SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` و `NEXT_PUBLIC_SUPABASE_ANON_KEY` زي ما هم — لسه بيستخدمهم لتخزين الصور.
2. اتأكد إن السكيمة متزامنة وشغّل:
   ```bash
   cd /var/www/alassema/api && npx prisma migrate deploy
   pm2 reload alassema-api
   curl -s https://<الدومين>/api/ready    # المتوقع: {"ok":true,"db":"up"}
   ```
3. افتح الموقع وتأكد إن الداتا بتظهر والصور بتحمّل (الصور من Supabase لسه).

## المرحلة ٤ — الباك-أب (متعتمدش على snapshot هوستنجر لوحده)
1. وجّه `deploy/backup.sh` على القاعدة الجديدة — هو أصلاً بيقرأ `DATABASE_URL` من `api/.env`، فبعد التحويل هيصوّر المحلية. فعّل الـ cron:
   ```bash
   sudo apt-get install -y rclone
   rclone config      # اعمل remote off-site (Backblaze B2 مثلاً)
   crontab -e         # ضيف: 0 3 * * *  /var/www/alassema/deploy/backup.sh >> /var/log/alassema-backup.log 2>&1
   /var/www/alassema/deploy/backup.sh    # شغّل أول نسخة دلوقتي وتأكد إنها اترفعت
   ```
2. فعّل الـ auto-backup من لوحة هوستنجر (بيصوّر قرص الـ VPS — مكمّل، مش بديل للـ pg_dump).
3. **ملاحظة:** الصور لسه على Supabase Storage — مش مغطّاة بباك-أب هوستنجر. فعّل نسخ الصور في `backup.sh` (متغيّر `STORAGE_REMOTE`) أو خلّي مشروع Supabase شغّال عشان الصور.

## بعد ما كله يثبت (كام يوم)
- تقدر تخفّض مشروع Supabase أو تلغيه، **بس** بعد ما تتأكد إن الصور اتنقلت أو إنك مكمّل على Supabase Storage. متلغيش قاعدة البيانات القديمة قبل ما الجديدة تثبت.
- حدّث `deploy/README.md` و `deploy/RESTORE.md` بإن قاعدة البيانات بقت محلية.

## قواعد أمان أثناء التنفيذ
- متمسحش/متوقفش مشروع Supabase في المهمة دي (fallback).
- اعمل التحويل في وقت زحمة قليلة (فيه ثواني downtime عند `pm2 reload`).
- متفتحش بورت Postgres للنت إطلاقًا.
- لو أي مرحلة فشلت، ارجع `api/.env` لـ `DATABASE_URL` بتاعة Supabase و `pm2 reload` — الموقع يرجع يشتغل حالًا.

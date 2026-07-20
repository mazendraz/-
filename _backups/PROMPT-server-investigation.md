# برومبت للسيرفر — انسخه بالكامل وابعته لـ Claude Code اللي شغّال على سيرفر الإنتاج

أنت على سيرفر الإنتاج لمشروع "العاصمة" (Al Assema). حصلت حادثة: بيانات قاعدة بيانات الإنتاج (الشركات/المشاريع/الريفيوز/التصنيفات) اتمسحت واستُبدلت بـ demo data. عايزك تعمل حاجتين بالترتيب: **(١) تحقيق للقراءة فقط لتحديد السبب وهل ده هجوم، ثم (٢) استرجاع البيانات من الباك-أب off-site بتاعنا**. اشتغل بحذر شديد واطبع نتيجة كل خطوة قبل ما تكمّل.

---

## المعطيات المؤكدة (من فحص Supabase مباشرة)
- في مشروع Supabase (ref: `vdwurkqarfnrquwihweo`) كل صفوف `Company` / `Project` / `Review` / `Category` اتمسحت واتحطّت بيانات وهمية في نافذة ثانيتين يوم **2026-07-20 الساعة 15:59:33–15:59:35** (توقيت قاعدة البيانات = UTC).
- الداتا الوهمية مطابقة تمامًا للـ seed بتاعنا `api/prisma/seed.ts` اللي بيقرأ من `app/src/lib/data.ts` (الشركات: Aura Interiors / NexTech Living / Eden Landscapes / Apex Architecture). ⇐ **يعني حد شغّل `prisma db seed` / `npm run seed` / `npm run db:setup` والـ `DATABASE_URL` مأشّر على الإنتاج.**
- سكربت الـ seed فيه حماية بترفض لو `Lead.count() > 0`، لكن الـ AuditLog بيبيّن إن كل الـ leads اتمسحت الساعة 13:01 نفس اليوم — فالحماية اتشالت واشتغل الـ seed.
- جداول `User` و `AppSetting` و `AuditLog` **سليمة** (متأثرتش).
- **مهم:** مشروع Supabase على الخطة المجانية = **مفيش أي backups من طرف Supabase** (لا Scheduled ولا PITR). الاسترجاع الوحيد الممكن = من الباك-أب off-site بتاعنا على B2 (لو كان شغّال).

---

## الجزء الأول — تحقيق (قراءة فقط، ممنوع أي تعديل)
**ممنوع منعًا باتًا** أي أمر مدمّر في المرحلة دي: لا seed، لا `db:setup`، لا `prisma migrate reset`، لا حذف، لا git push/force.

1. **سجل الأوامر:**
   ```bash
   grep -rniE "seed|db:setup|prisma (db seed|migrate reset)" /home/*/.bash_history /root/.bash_history 2>/dev/null
   ```
   هل الأمر اتشغّل على السيرفر؟ إمتى ومين؟

2. **لوجات التطبيق حوالين 15:59:**
   ```bash
   ls -la ~/.pm2/logs/ 2>/dev/null
   pm2 logs alassema-api --lines 3000 --nostream | grep -iE "seed|deleteMany|15:5|16:0"
   ```

3. **مصدر الاتصال:**
   ```bash
   grep -n "DATABASE_URL" /var/www/alassema/api/.env 2>/dev/null | sed 's/:[^:@]*@/:****@/'
   git -C /var/www/alassema ls-files | grep -i "\.env"   # لازم يكون فاضي (‎.env مش في git)
   git -C /var/www/alassema log --oneline -5
   ```

4. **دخول SSH والجلسات (2026-07-20 من 12:00 لـ 16:30):**
   ```bash
   last -a | head -40 ; who
   grep "2026" /var/log/auth.log 2>/dev/null | grep -iE "accepted|failed" | tail -60 \
     || journalctl -u ssh --since "2026-07-20 12:00" --until "2026-07-20 16:30" --no-pager 2>/dev/null | tail -60
   ```
   دوّر على: IPs غريبة، محاولات فاشلة كتير (brute-force)، مستخدمين مش متوقعين.

5. **الحكم:**
   - **حادث بالغلط (الأرجح):** مفيش أثر seed في history السيرفر ولا دخول غريب ⇐ الأغلب إن حد من الفريق شغّل الـ seed من جهازه و `.env` عنده مأشّر على الإنتاج. (مهاجم مكنش هيعيد ملء الداتا بالـ demo data بتاعتنا نفسها.)
   - **هجوم:** لو فيه دخول SSH مجهول أو brute-force ناجح أو تعديلات في ملفات مش إحنا عملناها.

اطبع خلاصة واضحة: **حادث ولا هجوم، ومين/منين اتشغّل الـ seed.**

---

## الجزء الثاني — استرجاع الداتا من الباك-أب بتاعنا (على B2)
المرجع: `deploy/RESTORE.md` و `deploy/backup.sh`. الباك-أب المفروض بيتاخد كل يوم 3 الفجر ويترفع على `b2:alassema-backups/db/`.

6. **اتأكد إن الباك-أب موجود فعلاً:**
   ```bash
   rclone lsl b2:alassema-backups/db/
   ```
   - **لو فيه ملف بتاريخ `2026-07-20T03…` (أو أحدث نسخة قبل 15:59):** كمّل. النسخة دي فيها كل الداتا الحقيقية قبل الكارثة بساعات.
   - **لو القايمة فاضية أو الـ rclone remote مش متظبط:** يبقى الـ cron مكنش شغّال ومفيش باك-أب — **قِف وبلّغ فورًا** من غير ما تعمل أي حاجة تانية. (في الحالة دي الداتا المفقودة غالبًا مش قابلة للاسترجاع، ولازم نقرر خطوة تانية.)

7. **جرّب الاسترجاع على قاعدة بيانات مؤقتة الأول (بروفة — متلمسش الإنتاج):**
   ```bash
   LATEST=$(rclone lsf b2:alassema-backups/db/ | sort | tail -1); echo "$LATEST"
   rclone copy "b2:alassema-backups/db/$LATEST" /tmp/
   docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=pw -p 5544:5432 postgres:17
   sleep 5
   SCRATCH="postgresql://postgres:pw@localhost:5544/postgres"
   pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$SCRATCH" "/tmp/$LATEST"
   psql "$SCRATCH" -c 'select (select count(*) from "Company") companies, (select count(*) from "Lead") leads, (select count(*) from "Review") reviews, (select count(*) from "User") users;'
   ```
   لازم الأرقام تطلع منطقية وفيها الشركات الحقيقية. اطبعها.

8. **الاسترجاع للإنتاج (بعد ما البروفة تنجح فقط):**
   الاسترجاع **بيمسح ويكتب فوق قاعدة بيانات الإنتاج** — ده مقبول دلوقتي لأنها فيها demo data بس. استخدم رابط الاتصال المباشر (session mode، port 5432) من `api/.env`.
   ```bash
   # (اختياري) وقف الـ API لحظيًا عشان مفيش كتابة أثناء الاسترجاع:
   pm2 stop alassema-api
   pg_restore --no-owner --no-privileges --clean --if-exists \
     --dbname "$DATABASE_URL" "/tmp/$LATEST"
   pm2 start alassema-api
   curl -s https://<الدومين>/api/ready   # المتوقع: {"ok":true,"db":"up"}
   ```
   بعدها أكّد رجوع الداتا:
   ```bash
   psql "$DATABASE_URL" -c 'select (select count(*) from "Company") companies, (select count(*) from "Lead") leads, (select count(*) from "Review") reviews;'
   ```

9. **نظّف:**
   ```bash
   docker rm -f pg-restore-test; rm -f "/tmp/$LATEST"
   ```

> ملاحظة عن فقدان بسيط محتمل (RPO): النسخة من الساعة 3 الفجر، فأي تعديل حصل بين 3ص و15:59 هيرجع لحالة الفجر — ده هيرجّع كمان الـ leads/التصنيفات اللي مازن مسحها بنفسه النهاردة (تقدر تمسحهم تاني لو عايز). ده مقبول مقابل استرجاع كل الداتا الحقيقية.

---

## الجزء الثالث — منع التكرار (بعد الاسترجاع، وابعتلي اقتراحك قبل ما تعمله)
- الحماية في `api/prisma/seed.ts` ضعيفة (بتعتمد على وجود leads بس). قوّيها: ترفض الشغل لو `User.count() > 0` **أو** `Company.count() > 0`، **و** ترفض تمامًا لو `DATABASE_URL` بيحتوي على host الإنتاج (`pooler.supabase.com`) إلا بفلاج صريح جدًا.
- أي `.env` على أجهزة الفريق لازم يأشّر على قاعدة بيانات محلية للتطوير — مش الإنتاج.
- فعّل تنبيه dead-man's-switch في `backup.sh` (متغيّر `BACKUP_HEALTHCHECK_URL`) عشان لو باك-أب فشل ييجيلك تنبيه.

# دليل النشر — Al Assema (العاصمة)

المشروع جزئين منفصلين، كل واحد بيتنشر لوحده:

| الجزء | المسار | النوع | الاستضافة المقترحة |
| ----- | ------ | ----- | ------------------ |
| الواجهة (Frontend) | [`app/`](app/) | Vite SPA ثابت (static) | Vercel / Netlify / أي static host |
| الخدمة الخلفية (Backend) | [`api/`](api/) | Next.js API + Prisma | Vercel / أي Node host |
| قاعدة البيانات | — | Postgres | Supabase |
| تخزين الصور | — | Object storage | Supabase Storage |

> الترتيب مهم: **قاعدة البيانات → الباك إند → الـ migrations والأدمن → الـ buckets → الفرونت إند → الربط (CORS/دومين)**.

---

## 0. المتطلبات قبل ما تبدأ

- حساب [Supabase](https://supabase.com) (مجاني يكفي للبداية).
- حساب [Vercel](https://vercel.com) (أو أي بديل).
- الكود متعمله `push` على GitHub (أول commit اتعمل بالفعل — كل اللي ناقص هو ربط الـ remote والـ push).
- Node 22 لو هتشغّل أوامر محليًا.

```bash
# لو لسه مربطتش remote:
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

---

## 1. قاعدة البيانات (Supabase)

1. اعمل مشروع جديد في Supabase.
2. من **Project Settings → Database → Connection string** خد رابطين:
   - **Pooled** (Transaction, منفذ 6543) → `DATABASE_URL`
   - **Direct** (Session, منفذ 5432) → `DIRECT_URL`
3. لو هتستخدم الـ pooler في الإنتاج، فعّل `directUrl` في
   [`api/prisma/schema.prisma`](api/prisma/schema.prisma).

---

## 2. نشر الباك إند (`api/` على Vercel)

1. في Vercel: **New Project** → اختار نفس الريبو.
2. **Root Directory = `api`** (مهم جدًا).
3. Vercel هيقرأ [`api/vercel.json`](api/vercel.json) اللي بيشغّل `prisma generate && next build`.
4. حط متغيرات البيئة (من [`api/.env.example`](api/.env.example)) في
   **Settings → Environment Variables**:

   | المتغير | القيمة |
   | ------- | ------ |
   | `DATABASE_URL` | رابط Supabase الـ pooled |
   | `DIRECT_URL` | رابط Supabase الـ direct |
   | `NEXT_PUBLIC_SUPABASE_URL` | رابط مشروع Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | الـ anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | الـ service-role key (سري) |
   | `JWT_SECRET` | سر عشوائي قوي — `openssl rand -base64 32` |
   | `JWT_TTL` | مثلاً `7d` |
   | `CORS_ALLOWED_ORIGINS` | دومين الفرونت إند (هتعرفه بعد خطوة 5) |
   | `API_KEY` | اختياري — لازم يطابق `VITE_API_KEY` |

5. اعمل Deploy، وتأكد إن `https://<api-domain>/api/health` بيرجّع OK.

> **ملاحظة Prisma 7:** الـ client بيتولّد وقت الـ build؛ مفيش حاجة إضافية.

---

## 3. تشغيل الـ Migrations وإنشاء أول أدمن

يتعملوا **مرة واحدة** بعد ما قاعدة البيانات تبقى جاهزة. شغّلهم محليًا والـ `.env`
فيه نفس بيانات الإنتاج، أو من جهازك مباشرة على Supabase:

```bash
cd api
npm ci

# 1) إنشاء الجداول
npx prisma migrate deploy

# 2) تعبئة الكتالوج (شركات + تصنيفات)
npm run seed

# 3) إنشاء أول أدمن للدخول على /admin
ADMIN_EMAIL="you@site.com" ADMIN_PASSWORD="<باسورد قوي>" npm run create-admin
# أو:
npm run create-admin -- --email you@site.com --password '<باسورد قوي>' --name 'Site Admin'
```

> `create-admin` **idempotent** — لو شغّلته تاني بنفس الإيميل بيحدّث الباسورد
> ويرقّي الحساب لـ ADMIN. السكربت مش بيحفظ أي بيانات في الكود.

---

## 4. إنشاء Storage buckets في Supabase

رفع الصور من لوحة الأدمن بيحتاج 4 buckets. من **Supabase → Storage** اعمل:

`logos` · `covers` · `gallery` · `projects`

كلهم **Public read** + الكتابة عن طريق الـ service-role key (الموجود في الباك إند).

---

## 5. نشر الفرونت إند (`app/` على Vercel)

1. **New Project** تاني على نفس الريبو، بس **Root Directory = `app`**.
2. Vercel هيقرأ [`app/vercel.json`](app/vercel.json) (build + الـ SPA rewrites).
3. حط متغيرات البيئة (من [`app/.env.example`](app/.env.example)):

   | المتغير | القيمة |
   | ------- | ------ |
   | `VITE_API_URL` | `https://<api-domain>/api` (بدون `/` في الآخر) |
   | `VITE_API_KEY` | اختياري — لازم يطابق `API_KEY` في الباك إند |

   > متغيرات Vite بتتحقن وقت الـ build، فلو غيّرتها لازم تعمل redeploy.
4. اعمل Deploy.

---

## 6. الربط النهائي (CORS + الدومين)

1. ارجع لمشروع الباك إند على Vercel، وحدّث `CORS_ALLOWED_ORIGINS` بدومين الفرونت
   إند (مثلاً `https://alassema.com`)، واعمل redeploy.
2. اربط الدومين المخصص لكل مشروع من **Settings → Domains** (HTTPS تلقائي).
3. جرّب:
   - الصفحة الرئيسية بتعرض الشركات (يعني الفرونت بيكلّم الـ API).
   - اعمل طلب خدمة → لازم يظهر في `/admin`.
   - سجّل دخول على `/admin` ببيانات الأدمن.

---

## 7. تحسينات الإنتاج (مهمة قبل ضغط حقيقي)

- [ ] **Rate limiting:** التنفيذ الحالي in-memory ومش بيشتغل على serverless متعدد
      النسخ. اربط **Upstash Redis** عن طريق `UPSTASH_REDIS_URL` وحدّث
      [`api/src/lib/middleware/rateLimit.ts`](api/src/lib/middleware/rateLimit.ts).
- [ ] **إيميلات الإشعارات (اختياري):** حط `RESEND_API_KEY` + `RESEND_FROM` (sender
      موثّق) علشان مزوّد الخدمة ياخد إيميل مع كل طلب جديد. من غيرها الطلبات بتتسجّل عادي.
- [ ] **reCAPTCHA (اختياري):** `RECAPTCHA_SECRET_KEY` لحماية فورم الطلب من السبام.
- [ ] **مراقبة الأخطاء (اختياري):** Sentry أو ما شابه.
- [ ] `JWT_TTL` قصير في الإنتاج، و`JWT_SECRET` قوي وسري.

---

## بديل: استضافة على VPS عادي (بدون Vercel)

- **الباك إند:** `npm ci && npx prisma generate && npm run build && npm start`
  (منفذ 3000) خلف Nginx/Caddy كـ reverse proxy، وشغّل خطوة 3 مرة واحدة.
- **الفرونت إند:** `npm ci && npm run build` ثم قدّم مجلد `dist/` كملفات ثابتة.
  لازم **SPA fallback** علشان الـ deep links، مثال Nginx:

  ```nginx
  location / {
    try_files $uri $uri/ /index.html;
  }
  ```

---

## ملخص أوامر سريع

```bash
# الباك إند (مرة واحدة بعد ربط قاعدة البيانات)
cd api && npx prisma migrate deploy && npm run seed
ADMIN_EMAIL=you@site.com ADMIN_PASSWORD='...' npm run create-admin

# تأكيد محلي إن كله بيـ build
cd api && npx tsc --noEmit
cd app && npm run build
```

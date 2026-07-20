# CLAUDE.md — دليل العمل لـ Claude Code

مشروع **العاصمة (Al Assema)**: منصة دليل خدمات (lead-generation) للعاصمة الإدارية الجديدة.
Monorepo: `api/` (Next.js + Prisma + Supabase) و `app/` (Vite + React). التفاصيل في [`README.md`](README.md).

---

## 🚀 الرفع (الأهم) — اعمل كده وبس

عشان ترفع أي تعديل على GitHub، شغّل أمر واحد من جذر المشروع:

```bash
npm run ship -- "وصف التعديل"
```

ده بيعمل: تنظيف أي قفل عالق → `git add -A` → `commit` → `push` للبرانش الحالي. خلاص.

**متعملش حاجة تانية غير كده.** تحديدًا:
- **ماتعملش** `rebase` ولا `push --force` ولا تنقّل بين برانشات كتير — ده بيلخبط الريبو.
- **ماتعملش** merge أو branch جديد إلا لو مازن طلب كده صراحةً.
- اشتغل على برانش واحد ثابت (يفضّل `main`). كل التعديلات تروح عليه.

---

## 🖥️ تحديث السيرفر

بعد الرفع، السيرفر بيتحدّث بأمر واحد عليه (SSH):

```bash
cd <repo> && bash deploy/deploy.sh
```

`deploy.sh` بيسحب **نفس البرانش** المفتوح على السيرفر (مش `main` ثابت)، فخلّي السيرفر على نفس برانش الشغل.

---

## 🛑 قاعدة البيانات — لوكال ضد إنتاج (قاعدة حرجة)

**التطوير المحلي لازم يستخدم قاعدة بيانات محلية — ممنوع منعًا باتًا يأشّر على الإنتاج.**
في 2026-07-20 حصلت كارثة: `api/.env` كان `DATABASE_URL` بتاعه مأشّر على الإنتاج، فأمر
seed اتشغّل "لوكال" ومسح كل داتا العملاء الحقيقية على السيرفر. عشان ميتكررش:

1. `api/.env` (المحلي) لازم يفضل على `postgresql://postgres:postgres@localhost:5433/alassema`.
   شغّل قاعدة البيانات المحلية بـ: `docker compose -f api/docker-compose.dev.yml up -d`.
2. بيانات الإنتاج في `api/.env.production` (متجاهَل من git) وعلى السيرفر — **متنقلهاش**
   للـ `.env` الافتراضي أبدًا.
3. أوامر مدمّرة (`seed`, `db:setup`, `prisma migrate reset`) تتشغّل على اللوكال بس.
   سكربت الـ seed محصّن دلوقتي: بيرفض لو `DATABASE_URL` فيه host الإنتاج
   (`pooler.supabase.com` / `supabase.co`) إلا بـ `SEED_I_KNOW=1`، وبيرفض لو فيه
   users/companies موجودين إلا بـ `--force`.
4. لو محتاج demo data، استخدمها على اللوكال: `npm run db:seed` والـ `.env` على اللوكال.

---

## ⚠️ المشروع جوه OneDrive — انتبه

الريبو متزامن مع OneDrive، وده بيلخبط git أحيانًا (index تالف، قفل `.git/index.lock` عالق، ملفات بترجع لمكانها).

قواعد للتعامل:
1. لو ظهر خطأ `index file corrupt` أو `index.lock`: احذف القفل ثم أعِد بناء الـ index —
   ```bash
   rm -f .git/index.lock
   git reset            # يعيد بناء الـ index من HEAD بدون لمس ملفاتك
   ```
2. بعد أي عملية git، اتأكد بـ `git status` إن النتيجة زي المتوقع قبل ما تكمّل.
3. لو git بقى بطيء أو بيتصرف بغرابة، استنى ثواني (OneDrive بيزامن) وأعِد المحاولة.

> **الحل الجذري (مُوصى به):** انقل الريبو بره OneDrive (مثلًا `C:\dev\al-assema`) — ده بيخلّي كل مشاكل git بتاعت المزامنة تختفي.

---

## أوامر مفيدة

```bash
npm run install:all     # تثبيت اعتماديات api و app
npm run dev:api         # الباك إند على :3000
npm run dev:app         # الواجهة على :5173
npm run db:setup        # generate + migrate + seed
npm run ship -- "msg"   # رفع على GitHub
```

# العاصمة — Al Assema

منصة **دليل خدمات** للعاصمة الإدارية الجديدة: بتربط العملاء بمقدّمي الخدمات (شركات تشطيبات، ديكور، مقاولات… إلخ). مش marketplace بمزايدات أو مدفوعات — الفكرة **lead generation**: العميل يختار شركة ويبعتلها طلب، والشركة تتواصل معاه بره المنصة.

> A service-directory / lead-generation platform for Egypt's New Administrative Capital. Clients browse verified providers and submit a request; providers receive the lead and follow up off-platform.

---

## هيكل المشروع (Monorepo)

```
العاصمة/
├── api/        الخدمة الخلفية — Next.js API Routes + Prisma + Supabase (Postgres)
├── app/        الواجهة — Vite + React + TypeScript + Tailwind + React Router
├── deploy/     سكربتات ووثائق النشر (Caddy, PM2, backup/rollback)
├── design/     تصاميم Stitch المرجعية (screenshots + HTML mockups)
└── docs/       كل التوثيق: خطط، تدقيق، نشر، برومبتات
```

كل من `api/` و `app/` **حزمة مستقلة** بالـ `package.json` الخاص بيها. الجذر فيه سكربتات اختصار بتشغّل الاتنين من مكان واحد.

---

## التشغيل السريع (Quick Start)

**المتطلبات:** Node 22، وحساب [Supabase](https://supabase.com) لقاعدة البيانات.

```bash
# 1) تثبيت اعتماديات المشروعين
npm run install:all        # أو: npm --prefix api install && npm --prefix app install

# 2) الإعدادات (انسخ ملفات المثال واملأ القيم)
cp api/.env.example api/.env
cp app/.env.example app/.env

# 3) قاعدة البيانات (أول مرة بس)
npm run db:setup           # prisma generate + migrate + seed

# 4) التشغيل
npm run dev:api            # الباك إند   → http://localhost:3000
npm run dev:app            # الواجهة     → http://localhost:5173
```

> كل سكربت موجود بالتفصيل في `package.json` بتاع كل مجلد. الجذر بيعيد توجيهها بس للراحة.

---

## المكوّنات

### `api/` — الخدمة الخلفية
Next.js API Routes + Prisma ORM على Postgres (Supabase). فيه ~11 موديل (Company, Project, Review, Lead, User, …)، طبقة `services/` للمنطق، `middleware/` (auth, rate-limit, captcha, body-limit)، و `validation/` بـ Zod. تفاصيل التشغيل في [`api/README.md`](api/README.md).

### `app/` — الواجهة
تطبيق React (Vite) بيعيد إنتاج تصاميم Stitch. صفحات عامة (استكشاف الخدمات، الشركاء، المعرض، تفاصيل المشروع)، ومعالج طلب من 4 خطوات، ولوحات للأدمن ومقدّم الخدمة. تفاصيل أكتر في [`app/README.md`](app/README.md) و [`app/FRONTEND.md`](app/FRONTEND.md).

### `deploy/` — النشر
نشر على VPS بدومين واحد خلف Caddy (HTTPS تلقائي) + PM2. سكربتات `deploy.sh`, `backup.sh`, `rollback.sh`. الشرح في [`deploy/README.md`](deploy/README.md).

---

## التوثيق (Documentation)

كل الوثائق اتنقلت جوه [`docs/`](docs/) ومتصنّفة. ابدأ من [`docs/README.md`](docs/README.md) كفهرس، أو روح على طول:

| المجلد | فيه إيه |
| ------ | ------- |
| [`docs/architecture/`](docs/architecture/) | خطة الباك إند التقنية وخطة البناء بالمراحل |
| [`docs/audits/`](docs/audits/) | تدقيق CTO، خطة الإصلاح، وصف الـ PR |
| [`docs/deployment/`](docs/deployment/) | دليل النشر الكامل خطوة بخطوة |
| [`docs/prompts/`](docs/prompts/) | برومبتات جاهزة لأي AI agent يفهم المشروع |

---

## Tech Stack

| الطبقة | التقنية |
| ------ | ------- |
| Frontend | Vite · React 18 · TypeScript · Tailwind CSS · React Router |
| Backend | Next.js 16 API Routes · Prisma 7 · Zod |
| Database | Supabase (Postgres) |
| Storage | Supabase Storage |
| Infra | Caddy · PM2 · Vercel (بديل) |
| Testing | Vitest (api) · Playwright (app e2e) |

---

## الحالة

المشروع قيد التطوير النشِط. للاطّلاع على وضع الجاهزية للإطلاق راجع [تدقيق CTO](docs/audits/CTO-AUDIT.md) و [خطة الإصلاح](docs/audits/REMEDIATION-PLAN.md).

# برومبت سياقي — مشروع "العاصمة" (Al Assema)

ده برومبت جاهز تلصقه في أول رسالة لأي AI assistant/agent جديد (Claude, ChatGPT, Claude Code, …) عشان يفهم المشروع بالكامل من غير ما يحتاج يستكشف الكود من الصفر. انسخه كامل زي ما هو.

---

## الفكرة

**Al Assema (العاصمة)** هو مارکت بليس (lead-generation marketplace) بيربط بين عملاء بيدوروا على خدمات تشطيب وتصميم وبناء فاخرة في **العاصمة الإدارية الجديدة** بمصر، وبين شركات/مزودي خدمة موثّقين في نفس المجال. الموقع بيركّز على فئة بريميوم: تصميم داخلي وتشطيب، سمارت هوم وأمان، لاندسكيب وحدائق، أثاث وديكور، إنشاءات وبناء، ونقل عفش. كل شركة عندها بروفايل فيه معرض صور، مشاريع سابقة، تقييمات حقيقية موثّقة، وشهادات/credentials.

**موديل العمل:** العميل يدخل الموقع، يستكشف الشركات حسب الفئة، ويبعت "طلب خدمة" (lead) لشركة معيّنة من غير ما يعمل حساب خالص (anonymous lead). الشركة (provider) بتستقبل الطلب وتتواصل مع العميل تليفونيًا بره المنصة. الأدمن هو اللي بيدير كل الكتالوج (الشركات والفئات)، يتابع كل الـ leads، ويدير حسابات الشركات (providers)، ويراقب التقييمات والشكاوى.

السوق المستهدف: شريحة بريميوم (فلل، شقق فاخرة، شركات) في منطقة جغرافية محددة (العاصمة الإدارية الجديدة)، مش سوق عام.

---

## الـ Personas الثلاثة

### 1. Client (العميل) — بدون حساب
- يستكشف الفئات والشركات، يفلتر، يحفظ شركات (Saved)، يقرأ بروفايل الشركة (Overview / Projects / Gallery).
- يبعت طلب خدمة (فورم فيه اسم، تليفون، حي، بَدجِت، وصف) — بيرجع له **رقم مرجعي** (format: `AA-YYYYMMDD-XXXX`) لازم يحفظه بنفسه لأن مفيش حساب.
- يتابع طلباته من صفحة "My Requests" — التتبّع ده مرتبط بالـ device/المتصفح (localStorage)، مش بحساب حقيقي.
- لما الطلب يوصل لحالة "Completed"، يقدر يسيب تقييم موثّق (verified review) مرة واحدة بس لكل طلب.
- يقدر يبعت "Report a problem / Suggestion / Inquiry" عن شركة معيّنة من بروفايلها.

### 2. Provider (مزود الخدمة) — حساب بصلاحية PROVIDER
- يسجل دخول على `/provider`، يشوف KPIs/تحليلات لشركته بس، يدير الـ leads الخاصة بيه (بحث/فلترة/تغيير حالة الطلب)، يستعرض تقييمات شركته.
- بياخد إيميل أوتوماتيك على كل lead جديد (مش SMS ولا WhatsApp حاليًا).
- بروفايل الشركة والمشاريع (Projects/Portfolio) حاليًا **read-only** بالنسبة له — أي تعديل لازم "تواصل مع الأدمن".

### 3. Admin (الأدمن) — حساب بصلاحية ADMIN
- لوحة كاملة على `/admin`: نظرة عامة (تحليلات/رسوم بيانية)، كل الـ leads (كل الشركات)، إدارة الكتالوج (شركات + فئات، رفع صور)، إدارة حسابات (Team: admin + provider، بما فيها reset password)، تقييمات المنصة (Platform Reviews + Feedback & Reports)، Settings.
- هو اللي بيعمل "Login" لأي شركة جديدة (يربط حساب provider بشركة في الكتالوج).

---

## الـ Stack التقني

| الجزء | التفاصيل |
|---|---|
| Frontend (`app/`) | Vite + React + React Router (SPA)، Tailwind utility classes، i18n عربي/إنجليزي مع RTL (`t(locale, key)`)، Material Symbols icons |
| Backend (`api/`) | Next.js API Routes، Prisma 7 ORM، service-layer pattern (`lib/services/*.service.ts`)، Zod validation (`lib/validation/*.ts`)، JWT auth (التوكن في localStorage) |
| Database | Postgres على Supabase |
| Storage | Supabase Storage (buckets: logos, covers, gallery, projects) |
| Email | Resend (HTTP API، بدون SDK) — "fail-open": فشل الإيميل أبدًا ما يوقّفش العملية الأساسية |
| Rate limiting | in-memory (نسخة واحدة) أو Upstash Redis (نسخ متعددة) |
| CAPTCHA | Turnstile/reCAPTCHA — اختياري، عبر `verifyCaptcha` middleware |
| النشر | Frontend → static host (Vercel/Netlify). Backend → Vercel (serverless) أو VPS (serverful + PM2) |

---

## خاصيّة مهمة: Dual-mode design

الفرونت إند ممكن يشتغل في وضعين:
1. **Demo mode** — من غير `VITE_API_URL`: كل الداتا localStorage بس (بيانات seed جاهزة)، مفيش auth حقيقي.
2. **API mode** — مع `VITE_API_URL` مظبوط: الباك إند هو مصدر الحقيقة، والفرونت إند بيستخدم نمط: **optimistic local write + hydrate/reconcile من السيرفر لو فشل** — منطبّق على leads, catalog, site reviews.

⚠️ **ملاحظة مهمة لأي تعديل مستقبلي:** أي دالة بتكتب localStorage لازم تتفحص هل بتفرّق بين الوضعين (`isApiConfigured()`) أو لأ — فيه تاريخ من دوال كانت بتفتكر إنها "محلية بس" بينما المفروض تتكلم مع API (هي دي بالظبط نوعية الباجز اللي اكتشفناها واتصلحت/بتتصلح، شوف "الحالة الحالية" تحت).

---

## كونفنشنز مهمة في الكود

- **مفيش حسابات عملاء** — تتبّع الطلب بـ refNumber + تليفون (shared secret)، عبر endpoint عام `/leads/track`.
- **التقييمات الموثّقة (verified reviews)** بس على leads بحالة `Completed`، مرة واحدة للطلب (`reviewedAt` gate).
- **`Company.rating` و `reviewCount` بيُحسبوا أوتوماتيك** من جدول `Review` الحقيقي (`recompute()` في `reviews.service.ts`) — **مش حقول يدوية**.
- **Honeypot + rate limit + CAPTCHA اختياري** على كل public POST endpoint (leads, reviews, site-reviews).
- **فلسفة "fail-open" للإشعارات** — فشل إشعار أبدًا ما يوقّفش/يفشّلش العملية الأساسية (مثلاً إنشاء lead).

---

## الحالة الحالية (آخر تحديث)

- قاعدة البيانات اتنقلت لـ Supabase **Session pooler** (مناسبة للنشر serverful/VPS).
- تم عمل مراجعة UX شاملة للتلات personas، واكتشفنا كذا مشكلة كريتيكال:
  1. فورم "Report a problem" في صفحة الشركة بيكتب localStorage بس — مفيش `feedback` endpoint في الباك إند خالص، يعني شكاوى الزوار ما توصلش للأدمن في الإنتاج.
  2. أدوات Settings في `/admin` (Demo Data, Catalog Backup, Reset Catalog) بتكتب localStorage من غير شرط `isApiConfigured()` — خطر بيانات في الإنتاج.
  3. حقول Rating/Reviews في تعديل الشركة قابلة للكتابة في الواجهة بس الباك إند بيتجاهلها بصمت (مش جزء من الـ validation schema).
  4. مفيش فورم لتتبّع الطلب يدويًا من جهاز/متصفح تاني.
  5. الأدمن مفيش له أي إشعار عند lead جديد (البروفيدر بس بياخد إيميل).
- تم كتابة برومبت تنفيذي مفصّل لإصلاح المشاكل دي (Phase 1) + إضافة إشعار للأدمن (Phase 2)، موجود في ملف `dev-prompt-critical-fixes-and-notifications.md` بجوار الملف ده — لو شغلت على إصلاحها، ارجع له الأول.

---

## أماكن مهمة في الكود (للمرجعية السريعة)

- فورم الطلب: `app/src/pages/RequestForm.tsx` · تتبّع الطلبات: `app/src/pages/MyRequests.tsx` + `app/src/lib/requests.ts`
- بروفايل الشركة: `app/src/pages/CompanyProfile.tsx`
- لوحة الأدمن: `app/src/pages/AdminDashboard.tsx` (أكبر ملف في المشروع، ~1500 سطر)
- لوحة البروفيدر: `app/src/pages/ProviderDashboard.tsx`
- منطق الكتالوج: `app/src/lib/catalog.ts` · المراجعات: `app/src/lib/siteReviews.ts` · الشكاوى: `app/src/lib/feedback.ts`
- الباك إند: `api/src/app/api/**/route.ts` (Next.js routes) · `api/src/lib/services/*.service.ts` · `api/src/lib/validation/*.ts` · `api/prisma/schema.prisma`
- دليل النشر: `DEPLOY.md`

---

*استخدم البرومبت ده كسياق بداية بس — مش بديل عن قراءة الكود الفعلي لو هتعدّل حاجة بالذات.*

# خطة تطوير العاصمة — الإصدار الثاني (v2)

> خطة تنفيذية لـ Claude Code، مقسّمة **ملف لكل مرحلة**. كل مرحلة وحدة مستقلة
> فيها: الهدف، تغييرات قاعدة البيانات، الـ endpoints، ملفات الفرونت إند،
> وحالات الاختبار.
>
> **الملف ده هو المشترك بين كل المراحل — اقراه الأول.** فيه القرارات المتفق
> عليها، الترتيب والاعتماديات، القواعد العامة، سياسة الـ migrations والرجوع،
> وتشيك ليست الـ ship.
>
> **واقرأ [`CLAUDE.md`](../../CLAUDE.md) قبل أي شغل** — خصوصًا قاعدة اللوكال
> ضد الإنتاج.

---

## ملفات المراحل

| المرحلة | الملف | migration | الاعتمادية |
|---------|-------|-----------|------------|
| 0 | [تقسيم `AdminDashboard.tsx`](phase-0-admin-split.md) | — | مفيش |
| 1 | [Feature D — صفحة الحالة/الصيانة](phase-1-status-screen.md) | — | 0 |
| 2 | [Feature A — نظام الموافقات العام](phase-2-change-requests.md) | ✅ | 0 |
| 3 | [Feature B — الأسعار (Offerings)](phase-3-offerings.md) | ✅ | 🔴 2 |
| 4 | [Feature C — طلب متعدد الخدمات](phase-4-multi-service.md) | ✅ | 3 |
| 5 | [Feature F — فترات الانشغال](phase-5-busy-windows.md) | ✅ | مفيش |
| 6 | [Feature E — الشات](phase-6-chat.md) | ✅ | مفيش · الأكبر |

---

## 1. القرارات المتفق عليها (لا تغيّرها من غير ما تسأل مازن)

| # | القرار | الاختيار |
|---|--------|----------|
| 1 | عرض الأسعار | **البروفيدر يحدد لكل خدمة**: سعر ثابت / رينج / سعر بالوحدة / **"يتحدد بعد المعاينة"** |
| 2 | ضبط واقعية الأسعار | **البروفيدر هو اللي بيحدد** — الضبط بيجي من موافقة الأدمن (قرار 4) + مؤشرات مساعدة للأدمن |
| 3 | هوية العميل في الشات | **رقم الطلب + trackingToken** — من غير تسجيل حساب |
| 4 | تعديلات البروفايل | **كل حاجة تستنى موافقة الأدمن** قبل ما تظهر |
| 5 | الخدمات المتعددة | **جمع الأسعار + خصم باقة يحدده البروفيدر** (بموافقة الأدمن) |
| 6 | جدولة الانشغال | **فترات مجدولة من/إلى** تقفل وتفتح لوحدها + زر يدوي |
| 7 | صفحة الصيانة | **يدوي من الأدمن + تلقائي لو الباك إند وقع + تلقائي لو الواجهة ضربت** |

---

## 2. ترتيب التنفيذ (مهم — في اعتماديات)

```
المرحلة 0  →  تقسيم AdminDashboard.tsx             نقل ملفات وبس · صفر تغيير سلوك
المرحلة 1  →  Feature D (صفحة الحالة/الصيانة)      مستقلة · صفر migration
المرحلة 2  →  Feature A (نظام الموافقات العام)      بيبني ChangeRequest اللي B بيستعمله
المرحلة 3  →  Feature B (الأسعار) — B1 باك إند ثم B2 واجهات · محتاج A فعلًا
المرحلة 4  →  Feature C (طلب متعدد الخدمات)          محتاج B
المرحلة 5  →  Feature F (فترات الانشغال المجدولة)    مستقلة
المرحلة 6  →  Feature E (الشات)                      الأكبر · مستقلة · آخر حاجة
```

> **التقسيم قبل Feature D مش بعدها.** Feature D بتضيف تبويب "حالة الموقع" لـ
> `AdminDashboard.tsx` — يعني لو عملتها الأول هتكبّر الملف وبعدين تقسّمه.
> قسّم الأول (صفر تغيير سلوك، مراجعة سهلة)، وبعدين D بتضيف التبويب في مكانه
> الجديد على طول.

**مفيش migration بتخلط مرحلتين.** القاعدة بالظبط: migration **واحدة كحد أقصى**
لكل مرحلة، وممنوع مرحلتين يشتركوا في نفس الـ migration. مش كل مرحلة ليها
migration — المرحلة 0 و1 من غير أي migration، والمرحلة 3 اتنين ship (B1/B2)
على migration واحدة.

> **الاعتمادية `A → B` حقيقية مش شكلية:** Feature B **مابيعملش** نظام موافقة
> خاص بيه — بيستعمل موديل `ChangeRequest` وشاشة المراجعة بتوع Feature A
> بالظبط. نظامين موافقة مختلفين في نفس المنتج = سلوك مختلف و UI مختلف
> ولخبطة للأدمن. شوف قاعدة النشر في [المرحلة 3](phase-3-offerings.md).

---

## 3. قواعد عامة تنطبق على كل feature

1. **قاعدة البيانات:** أي `prisma migrate dev` يتشغّل على اللوكال بس
   (`postgresql://postgres:postgres@localhost:5433/alassema`). شغّل
   `docker compose -f api/docker-compose.dev.yml up -d` الأول. **ممنوع** أي أمر
   مدمّر على الإنتاج (راجع `CLAUDE.md`).
2. **العقد (contract):** أي حقل جديد في الـ API لازم يتضاف في **الاتنين**:
   `api/src/lib/apiTypes.ts` و `app/src/lib/apiTypes.ts`، وتتحدّث
   `api/src/lib/contract.test.ts`.
3. **الطبقات في الباك إند:** route رفيع في `api/src/app/api/**/route.ts` →
   منطق في `api/src/lib/services/*.service.ts` → تحقق بـ zod في
   `api/src/lib/validation/*.ts`. استعمل `adminOnly` / `providerOnly` / `authed`
   من `api/src/lib/middleware/guards.ts` و `ok()` من `api/src/lib/utils/response.ts`.
4. **الطبقات في الفرونت:** موديول في `app/src/lib/*.ts` بنفس نمط
   `siteReviews.ts` (كاش في localStorage + `CustomEvent` + hook `useX`) وبعدين
   الصفحة. **لازم** يشتغل في demo mode — غلّف كل نداء بـ `isApiConfigured()`.
5. **الترجمة:** أي نص ظاهر للمستخدم يتحط في `app/src/lib/i18n.ts` في `en` و `ar`
   الاتنين، ويتنادى بـ `t(locale, "key")`. ممنوع نص مكتوب مباشرة في JSX.
6. **RTL:** استعمل خصائص منطقية (`margin-inline-*`, `ps-*`, `pe-*`) مش
   `left/right`. ولو استعملت `transform: translateX` اعمل نسخة `[dir="rtl"]`
   (زي `reviewMarquee` / `reviewMarqueeRtl` في `index.css`).
7. **الرفع:** `npm run ship -- "وصف"` وبس.

---

## 4. ملخص الملفات الجديدة (خريطة عامة)

> التفاصيل في ملف كل مرحلة — ده مجرد مسح شامل عشان تشوف الصورة كلها.

**الباك إند**
```
api/prisma/schema.prisma                       (5 migrations منفصلة — Feature D
                                                مالهاش migration، بتستعمل AppSetting)
api/prisma/seed.ts                             (لازم يتحدّث مع كل موديل جديد)
api/src/lib/middleware/maintenance.ts
api/src/lib/middleware/customerGuard.ts
api/src/lib/services/changeRequests.service.ts
api/src/lib/services/offerings.service.ts
api/src/lib/services/pricing.ts
api/src/lib/services/busyWindows.service.ts
api/src/lib/services/chat.service.ts
api/src/lib/validation/{changeRequests,offerings,busyWindows,chat}.ts
api/src/app/api/provider/{profile,change-requests,offerings,bundle-rules,busy-windows,chat}/**
api/src/app/api/admin/{change-requests,offerings,chat}/**
api/src/app/api/admin/companies/[id]/busy-windows/**
api/src/app/api/chat/route.ts
```

**الفرونت إند**
```
app/src/components/StatusScreen.tsx
app/src/components/ChatThread.tsx
app/src/components/OfferingEditor.tsx
app/src/components/BusyWindowsEditor.tsx
app/src/hooks/useBackendHealth.ts
app/src/lib/{changeRequests,offerings,pricing,cart,chat}.ts
```

**ملفات مشتركة في جذر الريبو**
```
pricing-cases.json      حالات اختبار التسعير — بيقراها تست في api وتست في app
```

**ملفات بتتعدّل بشكل كبير**
> أرقام الأسطر تحت هي `wc -l` (السطور الكلية). لو عدّيت بأداة بتتجاهل السطور
> الفاضية هتطلع أقل (مثلاً `AdminDashboard.tsx` = 2412 كلي / 2248 غير فاضي).
> الأرقام إرشادية للحجم بس — **اتأكد بنفسك قبل ما تبني عليها أي قرار.**
```
app/src/pages/ProviderDashboard.tsx   (838 سطر → تبويبات جديدة + فورم البروفايل)
app/src/pages/AdminDashboard.tsx      (2412 سطر → 4 أقسام جديدة — فكّر تقسّمه لملفات)
app/src/pages/CompanyProfile.tsx      (878 سطر → كروت الأسعار + السلة + شارة الحالة)
app/src/pages/RequestForm.tsx         (564 سطر → اختيار متعدد + ملخص السعر)
app/src/lib/i18n.ts                   (722 سطر → مفاتيح كتير جديدة)
app/src/RootLayout.tsx · main.tsx     (بوابة الصيانة + ErrorBoundary)
```

> **ملاحظة:** `AdminDashboard.tsx` بـ 2412 سطر هيبقى صعب جدًا بعد ٤ أقسام
> جديدة. تقسيمه لملفات تحت `app/src/pages/admin/` هو
> [**المرحلة 0**](phase-0-admin-split.md) — أول حاجة تتعمل قبل Feature D، مش
> مرحلة وسيطة بعدها.

---

## 5. الترحيل والرجوع (rollback) — ناقص من أي خطة بتتنسى

### قبل أي migration على الإنتاج
```bash
# ناخد نسخة احتياطية الأول — مفيش استثناءات
pg_dump "$PRODUCTION_DATABASE_URL" -Fc -f backup-$(date +%F-%H%M).dump
```
احتفظ بالنسخة لحد ما تتأكد إن الـ feature شغالة على الإنتاج ٢٤ ساعة على الأقل.

### قاعدة تصميم الـ migrations
كل migration في المراحل الخمسة **إضافية بس (additive)**: جداول جديدة وأعمدة
جديدة `NULL`-able أو بـ default. **مفيش** حذف عمود ولا تغيير نوع ولا
`NOT NULL` على عمود قايم. ده معناه إن الرجوع = رجوع الكود بس، والداتا الجديدة
تفضل قاعدة من غير ما تأذي حاجة.

الاستثناء الوحيد: حذف `Company.services` — **ماتعملوش في المرحلة 3**. سيبه
migration مستقلة بعد ما كل حاجة تستقر شهر.

### خطة الرجوع لكل مرحلة
| المرحلة | الرجوع |
|---------|--------|
| [0](phase-0-admin-split.md) | نقل ملفات — `git revert` نظيف |
| [1 (D)](phase-1-status-screen.md) | مفيش migration — اطفي `maintenance_enabled` أو ارجع الكود |
| [2 (A)](phase-2-change-requests.md) | ارجع الكود. جدول `ChangeRequest` يفضل موجود وفاضي، مالوش أي تأثير |
| [3 (B1/B2)](phase-3-offerings.md) | ارجع الكود → الواجهات ترجع تقرا `Company.services` (لسه موجود). العروض تفضل في الداتا |
| [4 (C)](phase-4-multi-service.md) | ارجع الكود → `RequestForm` يرجع للخدمة الواحدة. `LeadItem` يفضل للطلبات القديمة |
| [5 (F)](phase-5-busy-windows.md) | ارجع الكود → `isEffectivelyBusy` ترجع لـ `busy/busyUntil` بس |
| [6 (E)](phase-6-chat.md) | ارجع الكود. المحادثات تفضل محفوظة |

### `api/prisma/seed.ts` (183 سطر)
🟡 **لازم يتحدّث مع كل مرحلة** وإلا اللوكال بتاعك هيبقى فاضي من أي feature
جديدة وهتختبر على بيانات ناقصة:
- المرحلة 3 → عروض بأربع نماذج التسعير + شرائح + قاعدة باقة على شركة على الأقل
- المرحلة 4 → طلب أو اتنين بـ `LeadItem` متعددة
- المرحلة 5 → فترة انشغال جارية وفترة جاية
- المرحلة 6 → محادثة فيها رسايل من الطرفين
ملاحظة أمان: السكربت محصّن ضد الإنتاج (بيرفض hosts الإنتاج) — سيب التحصين ده
زي ما هو.

---

## 6. تشيك ليست قبل كل ship

- [ ] `npm run dev:api` و `npm run dev:app` شغّالين من غير أخطاء
- [ ] الـ migration اتعملت على **اللوكال** بس · `api/.env` على `localhost:5433`
- [ ] `apiTypes.ts` متطابقة في الاتنين + `contract.test.ts` بتعدّي
- [ ] كل النصوص الجديدة في `i18n.ts` بالعربي والإنجليزي
- [ ] الصفحة متظبطة في RTL و LTR
- [ ] Demo mode (من غير `VITE_API_URL`) ما بيضربش
- [ ] موبايل: من 360px لفوق
- [ ] `npm run ship -- "وصف التعديل"`

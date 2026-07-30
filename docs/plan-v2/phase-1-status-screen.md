# المرحلة 1 — Feature D · صفحة الحالة / "الموقع تحت التطوير"

> **اقرأ [`README.md`](README.md) الأول** — فيه القرارات المتفق عليها والقواعد
> العامة وتشيك ليست الـ ship.

| | |
|---|---|
| **الاعتمادية** | [المرحلة 0](phase-0-admin-split.md) (عشان التبويب الجديد يروح مكانه مباشرة) |
| **migration** | مفيش — بتستعمل `AppSetting` الموجودة |
| **ship** | واحد |
| **الرجوع** | اطفي `maintenance_enabled` أو ارجع الكود |

---

مستقلة تمامًا، اعملها الأول عشان تبقى موجودة وانت بتنفذ الباقي.

### الهدف
شاشة واحدة بديزاين حلو تظهر في تلات حالات: صيانة مقصودة، الباك إند واقع،
الواجهة ضربت. الأدمن يفضل قادر يدخل `/admin` في كل الحالات.

### قاعدة البيانات
مفيش موديل جديد — استعمل `AppSetting` (key/value) الموجود:

| key | مثال |
|-----|------|
| `maintenance_enabled` | `"true"` |
| `maintenance_title_ar` / `maintenance_title_en` | `"بنطوّر حاجات حلوة"` |
| `maintenance_message_ar` / `maintenance_message_en` | نص أطول |
| `maintenance_eta` | epoch ms — لعدّاد "بنرجع خلال..." |

### الباك إند
- `api/src/lib/services/settings.service.ts` — ضيف قراءة/كتابة مفاتيح الصيانة.
- **`GET /api/status` هو المصدر الوحيد لبيانات الصيانة.** راوت جديد خفيف بـ
  `ok()` و `Cache-Control: no-store`.
  > ⚠ **ماتضيفش `maintenance` في `/api/settings`.** الراوت ده بيستعمل
  > `okCached()` (`api/src/app/api/settings/route.ts:9`) بـ
  > `max-age=30, s-maxage=60, stale-while-revalidate=300` — يعني تشغيل الصيانة
  > ممكن يتأخر ٥ دقايق على الـ CDN. مصدر واحد بس، والفرونت يقرا من
  > `/api/status`. مفيش تكرار.
- `PATCH /api/admin/settings` (موجود) — يقبل المفاتيح الجديدة بعد إضافتها لـ
  `api/src/lib/validation/settings.ts`.
- **مهم — الحماية الحقيقية مش شكلية:** ضيف
  `api/src/lib/middleware/maintenance.ts` بيلفّ الـ endpoints العامة الكتابية
  (`POST /leads`, `POST /site-reviews`, `POST /feedback`,
  `POST /companies/:slug/waitlist`, وبعدين الشات) ويرجّع
  `503 { code: "MAINTENANCE" }` وقت الصيانة، ما لم تكن الجلسة ADMIN.
  القراءة تفضل شغالة عشان الأدمن يعاين.

  > 🔴 **الخطر معكوس عن اللي ممكن تتوقعه.** المشروع مافيهوش global middleware —
  > `api/src/lib/middleware/` دي wrappers بتتلفّ يدويًا حوالين كل راوت
  > (و`api/src/proxy.ts` — اسم Next 16 لـ middleware — شغّال على Edge runtime
  > فمايقدرش يلمس Prisma عشان يقرا الإعداد). يعني `/api/auth/*` **مش هتتلفّ
  > أصلًا** — الاستثناء بديهي مش خطر.
  >
  > الخطر الحقيقي هو العكس: **تنسى تلفّ راوت كتابي جديد فيفضل مفتوح في
  > الصيانة بصمت**، وماحدش هيلاحظ. الحماية الإجبارية:
  > اكتب تست بيعدّي على كل ملفات `api/src/app/api/**/route.ts` اللي بتصدّر
  > `POST`/`PATCH`/`PUT`/`DELETE` وهي **مش** تحت `admin/` ولا `provider/`
  > ولا `auth/`، ويتأكد إن كل واحدة ملفوفة بـ `withMaintenance`. أي راوت جديد
  > ينساه المطوّر هيوقّع التست فورًا.

### الفرونت إند
ملف جديد `app/src/components/StatusScreen.tsx` بثلاث variants:

```tsx
type StatusVariant = "maintenance" | "offline" | "crash";
```

- ديزاين واحد مشترك: خلفية بألوان البراند، إيلاستريشن SVG بسيط متحرك
  (يحترم `prefers-reduced-motion`)، عنوان + رسالة + عدّاد ETA لو موجود +
  زر "تحديث الصفحة".
- `maintenance` و `offline` يقدروا يقروا اللغة من `LocaleContext` ولينك
  التواصل من الإعدادات — دول شغالين والموقع سليم.

> 🔴 **variant الـ `crash` لازم يبقى صفر اعتماديات — ملف منفصل.**
> `<ErrorBoundary>` مكانه فوق `<RouterProvider/>` في `main.tsx`، يعني **فوق**
> `LocaleProvider` ومصدر الإعدادات. لو اللي ضرب هو الـ locale provider نفسه
> أو جلب الإعدادات، شاشة الـ crash هترمي هي كمان وتدّيك صفحة بيضا — وتبقى
> عملت شاشة خطأ بتقع في نفس الخطأ.
>
> اعمل `app/src/components/CrashScreen.tsx` منفصل بالقواعد دي:
> - نصوص عربي/إنجليزي **مدمجة في الملف** كثوابت. مفيش `t()` ولا `i18n`.
> - اللغة من `navigator.language` مباشرة. مفيش `LocaleContext`.
> - **مفيش أي `fetch`** ولا قراءة إعدادات ولا لينكات ديناميكية.
> - CSS inline أو كلاسات أساسية بس — من غير أي اعتماد على حالة التطبيق.
>
> `StatusScreen.tsx` يفضل للـ variants التانية ويقدر يبقى أغنى.

الربط:
1. **يدوي:** `app/src/RootLayout.tsx` — hook `useMaintenance()` جديد في
   `app/src/lib/settings.ts`. لو `enabled` والمستخدم مش ADMIN → ارسم
   `<StatusScreen variant="maintenance" />` بدل `<Outlet/>`.
   **ملاحظة:** `/admin` و `/provider` برّه `RootLayout` في
   `app/src/main.tsx` فهما بيفضلوا شغالين تلقائيًا — كويس، خليهم كده.
2. **الباك إند واقع:** hook `useBackendHealth()` جديد (`app/src/hooks/`).
   > 🟠 **ماتستعملش `/api/health`** — هو liveness probe بس، بيرجّع
   > `{ ok: true }` من غير ما يلمس قاعدة البيانات (شوف
   > `api/src/app/api/health/route.ts`). لو الـ DB واقعة هيقول "كله تمام"
   > والموقع كله ضارب.
   > **استعمل `/api/ready`** — موجود أصلًا في
   > `api/src/app/api/ready/route.ts`، بيعمل `SELECT 1` على الـ DB ويرجّع 503
   > لو وقعت. هو اللي محتاجه بالظبط. خليه هو مصدر `variant="offline"`،
   > و `/api/status` الجديد يبقى لبيانات الصيانة بس.
   
   > 🟡 **ماتعملش polling دوري في الحالة الطبيعية.** `/api/ready` بيضرب
   > `SELECT 1` على الـ DB — poll كل ٣٠ ثانية لكل تاب مفتوح للأبد = حمل
   > مجاني على قاعدة البيانات مقابل صفر فائدة وقت ما كل حاجة تمام.
   >
   > **الصح — polling تفاعلي:** `app/src/lib/api.ts` يبعت
   > `CustomEvent("al-assema-api-down")` لما يتكرر فشل الشبكة/5xx.
   > الـ hook يبدأ الـ polling **بعد أول فشل بس**، كل ١٠ ثواني، ويقف تمامًا
   > بعد أول نجاح. صفر تكلفة في الحالة العادية، ونفس النتيجة بالظبط.
   > أوقفه كمان وقت `document.hidden`.

   بعد **3** محاولات فاشلة متتالية → `variant="offline"`. يعني أول فشل + ٣
   محاولات × ١٠ ثواني ≈ **٣٠ ثانية** لحد ما الشاشة تظهر. لو عايزها أبطأ عشان
   ما تظهرش من انقطاع شبكة لحظي، زوّد عدد المحاولات — **مش** فترة الـ polling.
3. **الواجهة ضربت:** 
   - حدّث `app/src/pages/ErrorPage.tsx` (هو أصلًا `errorElement` للراوتر)
     عشان يرسم `<StatusScreen variant="crash" />`.
   - ضيف `<ErrorBoundary>` فوق `<RouterProvider/>` في `main.tsx` عشان يمسك
     أخطاء الرندر اللي برّه الراوتر.
   - تفاصيل الخطأ (stack) تتعرض بس لو المستخدم ADMIN أو لو `?debug=1`.

### الأدمن
تبويب جديد "حالة الموقع" في `app/src/pages/AdminDashboard.tsx`: سويتش تشغيل +
حقول العنوان/الرسالة بالعربي والإنجليزي + منتقي وقت الرجوع + **معاينة حيّة**
للشاشة قبل التشغيل.

### الاختبار
- شغّل الصيانة → صفحة عامة تعرض الشاشة، `/admin` شغّال، `POST /api/leads` يرجّع 503.
- اقفل الـ API → بعد ~30 ثانية (أول فشل + ٣ محاولات × ١٠ث) تظهر شاشة offline.
- ارمي `throw new Error()` في صفحة → تظهر شاشة crash مش صفحة بيضا.

---


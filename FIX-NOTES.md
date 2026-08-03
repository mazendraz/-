# FIX-NOTES.md — مشاكل اتلاقت أثناء فيز معينة بس مش في نطاقها

> بنسجل هنا أي مشكلة نلاقيها وإحنا شغالين في فيز معينة لكنها برة نطاقها. ماتتصلحش
> فورًا — تتراجع مع مازن الأول.

---

## [Phase 6 — التحقق النهائي] نتيجة `tests/ui-audit.spec.ts` (route × viewport × locale)

شغّلنا الـ suite كامل (90 حالة) آخر حاجة في الفيز. **مفيش أي فشل جديد سببه شغل
الفيز دي** — اتأكدنا بإعادة تشغيل حالات فردية بـ `--workers=1` للمقارنة:

1. **الـ overflow "الظاهر" في الـ run الكامل (`service-category-390-*`,
   `company-profile-768-en`) كان flaky بسبب الضغط على الموارد** — 90 test
   شغالين بالتوازي (`fullyParallel: true`) على بيئة sandboxed محدودة الموارد.
   أعدنا تشغيل نفس الحالات بـ worker واحد فمفيش overflow ظهر خالص. لو حد شغّل
   الـ suite دي على جهاز/CI عادي هيلاقيها خضرا في البند ده.
2. **`color-contrast` (axe) و`touch targets >= 44x44` بيفشلوا على كل صفحة تقريبًا
   — ده مش جديد.** ده بالظبط نفس الباج الموثّق في قسم "[Phase 2 —
   Accessibility] text-outline نفسه..." فوق: التوكن الأساسي `text-outline`
   والعناصر زي أزرار التوپ نف (40x40/40x46) ولينكات الفوتر (358x36 وشبهها) —
   حاجات مالهاش علاقة بالفيز دي، ومؤجلة عن قصد لقرار تصميم شامل (DS-04..07).
3. **الـ screenshot diffs (كل الصفحات تقريبًا) متوقّعة، مش باج.** الـ baseline
   اتلقط في Phase 0 قبل 6 فيزات تغيير حقيقي (design tokens، RTL، الـ CTA bar
   merge، scroll dots، إلخ). محتاجة `--update-snapshots` كخطوة منفصلة (بعد
   ما مازن يراجع الشكل الجديد بصريًا)، مش تصليح كود.

**خلاصة:** الـ suite مش أخضر دلوقتي، بس السبب مش أي حاجة من Phase 6 — كله إما
باج موثّق برة النطاق، أو baseline قديم محتاج تحديث، أو flake بيئة. لو حد عايز
يقفل البند ده فعليًا، الخطوات: (أ) قرار تصميم لـ contrast/touch-targets
(منفصل عن أي فيز polish)، (ب) `npx playwright test --config=playwright.ui-audit.config.ts --update-snapshots` بعد مراجعة بصرية.

---

## [Phase 6.7 — البنود المتبقية] بنود اتصلحت مقابل بنود اتأجلت

6.7 طلبت مسح كل بند من قايمة طويلة (~50 ID) من `UI-UX-AUDIT.md`. اللي اتصلح
فعليًا (تأكدنا إنه شغال بعد الفحص، أو لقيناه اتصلح أصلًا في فيز سابقة):

**اتصلح دلوقتي:** DS-02 (`darkMode` + `theme-color`/`color-scheme`)،
HOME-04 (★ glyph → Icon)، HOME-05 (شيل card-lift من كروت مش قابلة للنقر)،
HOME-06 (`style={{height:148}}` → `h-[148px]`)، HOME-07 (زرار pause/play
للـ marquee)، HOME-12 (scroll cue بيختفي بعد أول سكرول)، CO-01 (نفس الـ inset
16px للوجو وزرار الحفظ)، CO-02 (`pt-9` → `pt-4`)، CO-05 (`localeCompare` مع
locale)، CP-05 (back button بيتبع `--nav-h` الحقيقي)، CP-06 (fallback لـ
`/companies` لو مفيش history)، CP-10 (`aggregateRating` في الـ JSON-LD)،
GS-04 (focus بينتقل لعنوان الخطوة الجديدة)، GS-05 (الإجابات بتتحفظ في
sessionStorage)، LEG-03 (print stylesheet — التبويب/الفوتر بيختفوا عند
الطباعة)، NF-03 (فئات شائعة بدل زرارين بس)، ERR-03 (`?debug=1` اتشال خالص —
الأدمن بس اللي بيشوف الـ stack trace)، ST-01 (لوجو+سبينر بدل صفحة بيضا
فاضية)، SO-03 (title tooltip على زرار البحث يوضّح `/`)، ADM-27 (ترتيب
`hidden`/`flex` في `DashboardShell.tsx`).

**اتأكدنا إنها اتصلحت في فيز سابقة (مش محتاجة حاجة):** SRV-06 (delay cap —
اتعمل في 6.4)، CO-03 (الـ select فعليًا 16px، `.field-input` بتكسب الـ
cascade)، GS-03 (progress bar + "خطوة X من 3" موجودين أصلًا)، SAV-04
(النص بيوضّح device-only storage أصلًا)، LEG-01 (الـ container متسّق أصلًا
مع باقي الصفحات).

**اتأجلت — قرار منتج أو مجهود أكبر من "تلميع":**
- **SRV-07**: مواءمة `/services` مع `/companies` (sort/count/pagination) —
  `/services` عارضة فئات ثابتة قليلة (~6)، مش قايمة paginated؛ التوصية
  الأصلية ممكن متبقاش مناسبة. يستاهل نقاش قبل التنفيذ.
- **SAV-05**: bulk actions للمحفوظات (compare/clear all) — إضافة feature،
  مش تلميع.
- **NF-05**: الـ SPA بترجع HTTP 200 لصفحات 404 — محتاج تعديل على مستوى
  الـ hosting/server config، برة `app/`.
- **ST-02**: `useBackendHealth` بيغطي الموقع كله بشاشة offline بدل بانر —
  ده تغيير سلوك حقيقي (business logic)، يستاهل تأكيد من مازن الأول.
- **SO-02**: نمط ARIA كامل لـ combobox في الـ search overlay
  (`aria-activedescendant`, `role="combobox"/"listbox"/"option"`) — مجهود
  a11y متوسط، مش تعديل سطرين.
- **ADM-05/06/07/08/09/16/24/25/28**: تحسينات لوحة الأدمن (leads filters،
  bulk actions، column sorting، validation summary، dirty-state indicator،
  ⌘K command palette، إلخ) — كل واحد فيهم feature إضافة حقيقية.
- **PRV-08/09/11/13/15**: نفس الحكاية بس للوحة الـ provider (validation،
  drag-reorder، unsaved guard، onboarding checklist).
- **CODE-06**: `CompanyProfile.tsx` كان ~900 سطر، اتقل لـ ~805 بعد ما الـ
  lightbox/gallery اتنقلوا لـ `CompanyGallery.tsx` (شغل جاري في نفس الوقت،
  مش من الفيز دي) — التقسيم الإضافي (مودالز تانية) لسه محتاج شغل.
- **CODE-08**: كنس CSS ميت — محتاج مسح شامل لكل الملف مش تصليح موضعي.
- **NAV-04/05/08/09/10/11**: تحسينات تنقّل (BottomNav يضيف Messages،
  aria-label، لينكات فوتر مكررة، نسخة كوبي رايت مكررة، مكان اللغة، عرض
  الديسكتوب لـ 6 وجهات) — كل واحد يستاهل قرار تصميم منفصل.
- **UX-07/10/11/12/13**: حالة "no company" للـ provider، إعادة scroll عند
  الـ pagination، إعلان نتائج البحث، `title=` بدل نص حقيقي، شرح الزرار
  المعطّل — كل واحد محتاج مراجعة UX منفصلة.
- **NAV-03 و UX-14**: قرارات منتج صريحة (تسجيل دخول عام، تتبع الطلب بعد
  مسح البيانات) — الفيز نفسها قالت نناقشهم مع مازن قبل التنفيذ، فمتعملتش.

---

## [Phase 6 — الأداء] `e2e/customer.spec.ts` locator strict-mode violation — اتصلح فورًا

**اتلاقت في:** تشغيل الـ e2e suite كاملة عشان أتأكد إن إزالة `key={pathname}` من
`RootLayout.tsx` (PERF-07) ما كسرتش تنقّل `/companies` → صفحة الشركة.

**المشكلة:** `getByRole("heading", { name: /Aura Interiors/i })` بيطابق
عنصرين: الـ `<h1>` (اسم الشركة الحقيقي) والـ `<h2>نبذة عن Aura Interiors</h2>`
(قسم "About" — موجود من الـ commit الأول، مش حاجة من الفيز دي). Playwright's
strict mode بيفشل الاختبار بدل ما يختار واحد عشوائي.

**ليه اتصلح فورًا بدل ما يتسجّل بس:** الفيز دي معايير قبولها بالنص "كل تستات
Playwright خضرا" — الباج ده كان بيمنع التحقق من PERF-07 نفسها، والتصليح سطر
واحد في ملف اختبار (مش كود التطبيق) بمخاطرة صفر. أضفنا `level: 1` للـ locator
عشان يقصر بس على الـ `<h1>`. الاختبار بيعدّي دلوقتي (`customer journey` ✓).

---

## [Phase 10 — Requests visual refresh] Honeypot input بيعمل horizontal overflow ضخم

**اتلاقت في:** فحص `/request` بعد إعادة تصميم `RequestItemPicker` (مش سبب فيها).

**المشكلة:** حقل الـ honeypot (anti-spam) في 3 أماكن:
- `app/src/pages/CompanyProfile.tsx:791`
- `app/src/pages/CompanyProfile.tsx:951`
- `app/src/pages/RequestForm.tsx:459`

كلهم بنفس الكلاس: `absolute -left-[9999px] top-0 w-px h-px opacity-0`.

`position: absolute` مع `left: -9999px` بيوسّع الـ scrollable area بتاع الصفحة كلها
(`document.documentElement.scrollWidth`) لحوالي **10,000px+** — حتى لو الحاوية الأب
مالهاش `overflow-hidden`. اتأكد بالفحص: على `/request` بـ viewport 375px،
`scrollWidth` طلع `10374px` بدل `375px` (نفس الحكاية على 1366px: `11365px`).
الصفحة نفسها بتبان طبيعي بصريًا لأن كل المحتوى التاني في مكانه الصح — بس أي
اختبار overflow آلي (زي Playwright overflow check في Phase 0) هيفشل على التلات
صفحات دي، وممكن يسبب مشاكل حقيقية في scroll-snap أو `scroll-behavior: smooth`
أو حتى تجربة استخدام فعلية لو المستخدم عمل swipe يمين كتير.

**الحل المقترح (من غير ما نكسر وظيفة الـ honeypot):** استخدم باترن الإخفاء البصري
القياسي اللي بيحافظ على الوصولية بدون overflow، مثلاً:
```css
position: absolute;
width: 1px; height: 1px;
padding: 0; margin: -1px;
overflow: hidden;
clip: rect(0,0,0,0);
white-space: nowrap;
border: 0;
```
(أو ببساطة أضف `overflow-x: hidden` على حاوية أعلى — بس الحل الأول أدق ومايأثرش
على أي حاجة تانية).

**النطاق:** الملفين دول (`CompanyProfile.tsx`, `RequestForm.tsx`) مش في نطاق
Phase 10 (`docs/plan-v2/phase-10-requests-visual-refresh.md` بيحدد بس
`RequestItemPicker.tsx`, `RequestBar.tsx`, `RequestForm.tsx` [الجزء الخاص
بصناديق التنبيه بس], `MyRequests.tsx`). تصليح الـ honeypot في `RequestForm.tsx`
ممكن يتعمل في نفس الفيز لو مازن موافق (نفس الملف)، بس `CompanyProfile.tsx`
برة نطاق الفيز خالص.

**ملحوظة من Phase 0:** الـ overflow test الآلي (`tests/ui-audit.spec.ts`) بيفحص
`/request` من غير `?company=`، وفي الحالة دي الباج مش بيظهر (الـ scrollWidth
طبيعي) — يبان بس لما فيه شركة/عروض محمّلة فعلًا زي `/request?company=nextech-living`.
يعني الـ automated overflow check الحالي مش هيمسك الباج ده تلقائيًا؛ لو حابين
نغطيه، محتاجين نضيف route variant بـ `?company=` في الـ matrix.

---

## [Phase 0 — Safety net] ملاحظتين من بناء الـ Playwright harness

**1. الـ overflow على `/saved`, `/requests`, `/messages` (RESP-01) شرطي مش دايم:**
`PersonalTabs.tsx:27` (`inline-flex` من غير `flex-wrap`/`overflow-x-auto`) بس
بيفيض فعليًا لما شارة العدّاد (badge) على تاب واحد على الأقل تكون >0 — في جلسة
مجهولة فاضية (صفر محفوظات/صفر طلبات/صفر رسايل) الصف بيبقى أضيق من 390px ومفيش
overflow. اتأكدنا بالتجربة: زرع `al-assema-saved` بـ localStorage بعنصر واحد
كفى إنه يرجّع الباج (`scrollWidth` بقى 558px). الـ harness دلوقتي بيزرع
`al-assema-saved` تلقائيًا (client-side فقط، بدون أي كتابة على الـ DB) عشان
يضمن إعادة إنتاج الباج بثبات، بس عدّاد الطلبات/الرسايل بييجي من الـ API الحقيقي
فمش قابل للزرع من غير عمل lead/message حقيقي — يعني الباج موجود فعليًا في
الشلاشة كلها (نفس الكومبوننت)، بس مش كل حالة هتفشل في اختبار فارغ 100%.

**2. بعض الصفحات محتاجة screenshot timeout أطول من الديفولت (5000ms):**
`home`, `services`, `service-category`, `companies` (وبعض حالات admin/provider)
مش بيستقروا بصريًا خلال الـ 5 ثواني اللي Playwright بيستناها قبل ما ياخد
baseline جديد — يبان إن الصور الكسولة (`LazyImage`/IntersectionObserver) بتفضل
تحمّل أثناء الـ full-page screenshot (اللي بيعمل scroll للصفحة كلها فبيشغّل
الـ lazy-load في نص العملية). رفعنا الـ timeout لـ 30 ثانية في
`tests/ui-audit.spec.ts` عشان الـ baseline يستقر، بس ده عرض جانبي يستاهل نظر
في Phase 6 (PERF) — الـ full-page screenshot بتاعنا مش هو استخدام حقيقي للموقع،
بس بيوضّح إن أي تفاعل تاني بيعمل scroll سريع لصفحة طويلة (زي الرجوع لأعلى) ممكن
يشغّل نفس الـ lazy-load الكسول في وقت غير متوقع.

---

## [Phase 1 — إيقاف النزيف] الـ eslint no-restricted-syntax: 19 مخالفة باقية برة نطاق الفيز

بعد تنفيذ 1.4 (RTL-02/03/04/ADM-01) بالظبط زي الجدول، فضل 19 مخالفة `no-restricted-syntax`.
الفيز 1 معرّفة نطاقها بالجدول المحدد بس (مش "كل استخدام فيزيائي في الكود")، فديه
سجلّناها من غير تصليح:

**تصليح فعلي حصل في قاعدة الـ lint نفسها (مش في الكود):** `left-0`/`right-0` كانا
بيتفلتروا حتى على الباترن الصح المطلوب في RTL-01 نفسه
(`left-0 rtl:left-auto rtl:right-0`، بالظبط زي `TopNav.tsx:257` المرجعي) — يعني
القاعدة كانت بتعاقب الحل الصح. اتصلحت في `eslint.config.js` بـ lookahead/lookbehind
يستثني الحالة المتعوّض عنها فعليًا بـ rtl:. اتأكدنا إن `admin/index.tsx:200` و
`ProviderDashboard.tsx:267` (اللي أصلحناهم في 1.2) بقوا نضاف من الـ lint دلوقتي.

**مخالفات لسه موجودة (19)، اتنين نوع:**

1. **غالبًا مش باج حقيقي** — `left-0 right-0` سوا (بدون rtl) بيعملوا span لعرض
   الشاشة كامل، فمفيش فرق فعلي بين RTL/LTR (الحافتين مثبتين سوا):
   `BottomNav.tsx:19`, `RequestBar.tsx:51`, `Companies.tsx:271` (الـ mobile filter
   sheet)، `CompanyProfile.tsx:128` (الـ sticky CTA bar). وكمان `TopNav.tsx:114,191`
   (`left-0` مع `w-full` — العرض بيتحدد بـ w-full مش left/right). أفضل حل لو حبينا
   نوضّح النية: `inset-x-0` بدل `left-0 right-0`.

2. **باج حقيقي محتمل، محتاج قرار تصميم:** بادجات العداد في الزاوية
   `TopNav.tsx:161,239` (`-top-0.5 -right-0.5` — بادج العدّاد ملزوق في الزاوية
   الفيزيائية اليمين بدل `end`، يعني في RTL هيبقى في الزاوية الغلط)، وصناديق
   التسمية فوق صور المشاريع في الرئيسية `Home.tsx:327,341,355`
   (`absolute bottom-0 left-0` — نفس الفكرة). دول يستاهلوا مراجعة في فيز لاحقة.

3. **متأجلين لفيز تانية بالاسم:** `AvailabilityControl.tsx:83` و
   `ProviderDashboard.tsx:615,617` (مفتاح التبديل toggle — ده A11Y-19 في Phase 2)،
   و `ProviderDashboard.tsx:1014` كان هيتصلح كجزء من RTL-05 في نفس الفيز (شوف
   القسم اللي بعده لو اتصلح).

---

## [Phase 2 — Accessibility] 3 icon-only delete buttons delete immediately, no confirmation at all

**اتلاقت في:** فحص A11Y-05 (تسمية أزرار الحذف) — دول أوسع من `confirm.tsx` اللي
الفيز كانت مركّزة عليه.

**المشكلة:** الأزرار دي بتحذف فورًا بضغطة واحدة، من غير أي تأكيد (حتى مش الباترن
القديم "armed"):
- `app/src/pages/admin/CompanyEditor.tsx:315` — حذف صورة مشروع من الـ draft
  (على الأرجح مقبول لأنه تعديل على مسودة لسه ما اتحفظتش، مش حذف نهائي).
- `app/src/pages/admin/ProjectApprovals.tsx:106` — حذف مشروع معتمد فعليًا.
- `app/src/pages/admin/ReviewsTab.tsx:234` — حذف تقييم من الموقع.

**اللي اتصلح دلوقتي:** أضفنا `aria-label` واضح على التلاتة (A11Y-05 نفسها)،
من غير ما نغيّر سلوك الحذف الفوري — ده كان برة نطاق الفيز (اللي حددت
`confirm.tsx` تحديدًا لباترن الـ "armed"→dialog في A11Y-06).

**يستاهل قرار مستقبلي:** لو `ProjectApprovals` و`ReviewsTab` بيحذفوا حاجات
منشورة فعليًا (مش draft)، يستاهلوا نفس `ConfirmDialog` المشترك اللي بنيناه في
`confirm.tsx` (استيراده جاهز: `import { ConfirmDialog } from "./components/confirm"`،
زي ما استخدمناه في `CategoryEditor.tsx`).

---

## [Phase 2 — Accessibility] `/services` search box doesn't actually filter anything (found while doing A11Y-09)

**اتلاقت في:** بحاول أضيف `role="status"` على رسالة "no results" في `Services.tsx`
عشان تتقري لقارئ الشاشة (A11Y-09) — لاقيت إن الرسالة دي مستحيل تظهر أصلًا.

**المشكلة:** `Services.tsx:56` بيعمل `SERVICE_CATEGORIES.length === 0` — دي
القايمة الثابتة الكاملة، مش نتيجة الفلترة بـ `query`. يعني مربع البحث فوق
(`SearchInput value={query} onChange={setQuery}`) بيغيّر الـ state بس مفيش أي
مكان بيستخدم `query` عشان يفلتر `SERVICE_CATEGORIES` قبل العرض — الجريد بيعرض
**كل** الفئات دايمًا بغض النظر عن اللي المستخدم كتبه. مربع البحث ديكوري بالكامل
حاليًا.

**الحل:** فلترة `SERVICE_CATEGORIES` بـ `query` قبل الـ `.map()`، زي الباترن في
`Companies.tsx`/`Saved.tsx`. مش عملتها دلوقتي لأنها برة نطاق فيز الـ
accessibility — دي باج وظيفي (functional)، مش a11y.

---

## [Phase 2 — Accessibility] `text-outline` نفسه (مش أي تخفيف بـ opacity) بيفشل contrast على أحجام صغيرة

**اتلاقت في:** axe scan بعد إكمال Phase 2 — بعد إصلاح كل حالات `text-outline/NN`
(التخفيف بـ opacity، A11Y-13/14)، لسه فيه `color-contrast` violations كتير
(11 على `/companies` وحدها) كلها على **نفس التوكن الأساسي `text-outline` بدون
أي opacity** على نصوص صغيرة (12-14px): أسماء الفئات، عدّادات الأقواس `(3)`،
عدد المشاريع، إلخ.

**ليه مش اتصلحت دلوقتي:** ده مش "تخفيف زيادة بـ opacity" (اللي Phase 2 كانت
بتصلحه) — ده لون التوكن الأساسي `#70787f` نفسه (الأودت قدّره ~4.6:1، فوق حد
الـ 4.5:1 بالظبط تقريبًا) بيوقع تحت العتبة فعليًا حسب الحجم/الوزن. تغيير قيمة
التوكن نفسه قرار تصميم شامل بيأثر على **مئات** الاستخدامات في الموقع كله —
مش حاجة تتصلح كتعديل موضعي، ده بالظبط نطاق DS-04..07 (نظام الألوان الدلالي)
في Phase 3.

**الحالة الحالية بعد Phase 2:** axe صفر violations serious/critical على `/` و
`/request` بالكامل. باقي الصفحات كلها نظّفت الـ violations التانية (dialog
names, button names, select names, skip link, إلخ) وما تبقاش غير
`color-contrast` على `text-outline`. جدول عدد الـ violations لكل route
(ar/en, 1366px) بعد التصليح:
- `/`: 0/0
- `/request`: 0/0 (ar) — 1 (en، سطر submit error الإنجليزي "Couldn't submit...")
- `/services`: 3/2 · `/companies`: 11/13 · `/companies/:slug`: 7/14
- `/saved`: 2/4 · `/requests`: 2/4 · `/messages`: 1/4
- `/admin`: 1/2 · `/provider`: 1/2 (كلهم قبل تسجيل الدخول)

---

## [Phase 3 — نظام التصميم] DS-07: اتصلح الجزء الأساسي بس، مش كل الـ ~108 استخدام

**اللي اتصلح:** أضفنا توكنز دلالية (`warning`, `warning-container`,
`on-warning-container`, `success`, `success-container`, `on-success-container`)
في `tailwind.config.js`، وطبّقناها على الحالة اللي الأودت حددها بالظبط —
busy=amber/available=green في `AvailabilityControl.tsx`, `WaitlistManager.tsx`,
`BusyWindowsEditor.tsx`. كمان صلّحنا الـ 19 hex hardcoded برة `CrashScreen.tsx`
(اللي دلوقتي موثّق فيه الاستثناء صراحة)، وباج `--color-primary` غير المعرّف
(كان بيرجع بني `#8a6a4f` بدل الأساسي) في مكانين تانيين (`BusyWindowsEditor.tsx`,
`ChangeRequestsTab.tsx`) — نفس الباج اللي كان في `RequestItemPicker.tsx` واتصلح
في Phase 10.

**اللي فضل زي ما هو (عن قصد):** الـ `STATUS_COLORS` (5 حالات lead: New=blue,
Contacted=yellow, In Progress=orange, Completed=green, Cancelled=neutral) —
ده نظام تصنيفي حقيقي محتاج 5 ألوان مميّزة، مش نفس مشكلة "amber/green من غير
توكن دلالي" اللي الأودت بيقصدها. باقي الـ amber-*/green-* استخدامات (بادجات
حالة، أرقام) لسه بتستخدم ألوان Tailwind الجاهزة مباشرة — ده تقريبًا ~90
استخدام برة نطاق التغيير ده، محتاج قرار تصميم منفصل لو حبينا نوحّدهم (خمس
حالات محتاجين 5 توكنز، مش 3).

---

## [Phase 3 — نظام التصميم] PERF-01: اتنين lightbox images من غير width/height عن قصد

**اللي اتصلح:** كل الـ `<img>`/`<LazyImage>` (~40 موقع) في الصفحات العامة والأدمن
والبروڤايدر خدوا `width`/`height` مطابقة للصندوق المعروف (كروت `h-44`/`h-48`/`h-64`،
لوجوهات `w-N h-N` مربعة، إلخ) — القيم دي مجرد hint لحجز مساحة الـ layout؛ الحجم
الفعلي بيتحدد بردو بـ `w-full h-full object-cover` زي ما كان. `Logo.tsx` كمان
خد `width`/`height` props اختيارية (كل استخدام مرّر القيمة المطابقة لحجمه
الفعلي — مقاسات مختلفة في أماكن مختلفة، والقياس الحقيقي لملف `/logo.png` اتقاس
612×408px عشان استخدامات `TopNav.tsx` اللي بتحدد الـ height بس وتسيب الـ width
`auto`).

**اللي فضل من غير width/height (عن قصد):**
- `CompanyProfile.tsx:601` — صورة الـ lightbox (معرض الصور بملء الشاشة).
- `admin/ProjectApprovals.tsx:152` — صورة المعاينة قبل اعتماد مشروع.

الاتنين بيعرضوا صورة **مرفوعة من المستخدم بأي نسبة أبعاد**، بـ
`object-contain`/`max-h-[90vh]`/`max-h-[50vh]` من غير صندوق أب بحجم ثابت (على
عكس كل الحالات التانية اللي كان أبوها عنده `h-44` أو `w-N h-N` معروفين مسبقًا).
حط رقم width/height تخميني هنا كان هيكذب عن الأبعاد الحقيقية ويعمل نفس مشكلة
"صندوق غلط" اللي PERF-01 أصلًا بيحاول يمنعها، مش يحلها — الحجم الحقيقي مش معروف
غير بعد تحميل الصورة. سيبناهم زي ما هما.

---

## [Phase 4 — التكرار والتدفق] CMP-09: الـ drag handle اتشال، مش اتنفّذ

**القرار:** الأودت عرض حلين للـ bottom sheet المزيف (`Companies.tsx` mobile
filter sheet): تنفيذ drag-to-dismiss حقيقي (pointer events + عتبة سرعة)، أو
شيل الـ handle. اخترنا الشيل — تنفيذ سحب حقيقي كان محتاج pointer tracking +
velocity threshold + احترام `prefers-reduced-motion` جوه استايل inline (مش
CSS class عادي زي باقي الأنيميشن في المشروع)، وده استثمار وقت مش متناسب مع
باقي بنود الفيز دي. الـ handle اتشال من الـ sheet variant بتاع `Modal.tsx`
المشترك (اللي اتعمل في نفس الفيز)، فمفيش مكان تاني في المشروع فيه نفس الباج.

---

## [Phase 4 — التكرار والتدفق] UX-09: `ProfileEditor` — الحارس بيغطي مغادرة الصفحة، مش تبديل تاب البروڤايدر

**اللي اتصلح:** `useUnsavedChangesGuard` (beforeunload + `useBlocker`) اتضاف
لـ `CompanyEditor`, `CategoryEditor`, `ProfileEditor`, و`/request` — تسكّر
التاب أو تتنقّل بره الصفحة وعندك تعديل مش محفوظ بيوريك تأكيد.

**اللي فضل مكشوف عن قصد:** تبديل تابات البروڤايدر (Overview↔Profile↔Leads..)
لسه `useState` محلي جوه `ProviderDashboard.tsx`، مش routes حقيقية (NAV-06
حوّل الأدمن بس، مش البروڤايدر — قرار موثّق من بداية الفيز). يعني لو الپروڤايدر
عدّل حاجة في تاب Profile وبعدين ضغط "Leads" في نفس الصفحة، `useBlocker` مش
هيمسك التنقل ده لأن مفيش route تغيّر فعليًا — الحارس شغّال بس على مغادرة
`/provider` بالكامل (رجوع للموقع، إغلاق التاب، تحديث الصفحة). تغطية تبديل
التابات محتاجة الپروڤايدر يتحوّل لـ routes زي الأدمن (نفس الحجم بالظبط)، أو
الـ ProfileEditor يمرّر callback للـ shell يمنع تبديل التاب وقت وجود تعديل —
الاتنين برة نطاق الفيز دي.

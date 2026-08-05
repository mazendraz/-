# DASHBOARD-FIX-NOTES

سجل تنفيذ [`DASHBOARD-FIX-PROMPT.md`](DASHBOARD-FIX-PROMPT.md). كل فيز ليها قسم:
اللي اتعمل، اللي اتأجّل، والأرقام قبل/بعد.

---

## Phase 0 — شبكة الأمان ✅ (2026-08-03)

### اللي اتعمل

| # | البند | الملف |
|---|---|---|
| 0.1 | مستخدمَين تست ثابتين (ADMIN + PROVIDER) بـ upsert غير مدمّر ومحصّن ضد الإنتاج | `api/prisma/seed-test-users.ts` + سكربت `seed:test-users` |
| 0.1 | Setup project بيسجّل دخول الدورين بالفورم الحقيقي ويحفظ الـ session | `app/tests/auth.setup.ts` |
| — | مسارات ملفات الـ session في موديول عادي (Playwright بيرفض إن ملف تست يستورد ملف تست تاني) | `app/tests/authState.ts` |
| 0.2 | المصفوفة اتوسّعت من `/admin` + `/provider` (شاشة لوجين) لـ **18 تاب حقيقي** | `app/tests/ui-audit.spec.ts` |
| 0.3 | الـ 12 baseline القدام (صور فورم لوجين) اتمسحوا، واتولّدوا بدالهم baselines حقيقية | `app/tests/__baseline__/` |
| 0.4 | assertion جديدة: مفيش scroll container جوّا scroll container على ≤430px | `ui-audit.spec.ts` |
| — | `tests/.auth/` اتضاف لـ `.gitignore` (فيه session cookies حقيقية) | `app/.gitignore` |
| — | assertion الـ touch targets بقت بتتخطّى عناصر `sr-only` | `ui-audit.spec.ts` |

### الأرقام — قبل/بعد

| | قبل | بعد |
|---|---|---|
| تستات بتقيس اللوحات فعليًا | **0** (12 تست كانت بتصوّر فورم اللوجين) | **108** (18 تاب × 3 viewports × 2 لغات) |
| إجمالي تستات الـ chromium | 78 | **192** |

**نتيجة أول تشغيلة كاملة (10.6 دقيقة):** 192 failed / 2 passed.
التوزيع (عدد التستات اللي فيها ≥1 فشل من النوع ده):

| النوع | public (84) | admin (54) | provider (54) |
|---|---|---|---|
| touch targets | 82 | 50 | 44 |
| axe serious/critical | 69 | 39 | 29 |
| overflow أفقي | 1 | 0 | 0 |
| نص < 12px | 0 | 0 | 0 |
| scroll متداخل | 0 | 0 | 0 |
| screenshot | 84 | 54 | 53 |

> فشل الـ screenshot متوقع ومش معبّر: الـ 18 route الجداد مالهمش baselines أصلاً
> (بتتولّد في أول تشغيلة)، والـ baselines القديمة بايتة لأن فيه تعديلات UI
> غير مرفوعة في الـ working tree. الأرقام المعبّرة هي touch/axe.

### تفصيل لكل تاب @390-ar (بعد تنظيف الـ false positives)

| التاب | عناصر تحت 44px | axe serious/critical |
|---|---|---|
| admin-services | **0** ✅ | — |
| admin-leads | **0** ✅ | — |
| admin-overview | 3 | — |
| admin-companies | 5 | — |
| admin-chat | 5 | 19 serious |
| admin-reviews | 6 | — |
| admin-settings | 7 | 4 critical |
| admin-team | 12 | 1 serious |
| **admin-changes** | **69** 🔴 | 13 serious |
| provider-reviews | 3 | 1 serious |
| provider-analytics | 3 | 1 serious |
| provider-messages | 3 | 18 serious |
| provider-profile | 3 | 7 serious + 13 critical |
| provider-settings | 5 | 1 serious |
| provider-overview | 10 | 13 serious + 5 critical |
| provider-availability | 16 | 1 serious + 2 critical |
| **provider-leads** | **26** 🔴 | 2 serious + **13 critical** |
| **provider-projects** | **46** 🔴 | 21 critical |

### الحاجات اللي التستات كشفتها والـ audit اليدوي مشفهاش

1. **`admin-leads` = 0 مخالفة، `provider-leads` = 26.** ده بالظبط الـ asymmetry
   اللي DM-03 بيتكلم عنها، بس مقيسة دلوقتي مش مستنتجة. أقوى دليل على إن الحل هو
   إعادة استخدام `LeadMobileCard`.
2. **DM-06b جديد: 13 `<select>` من غير اسم متاح** (`select-name` critical) في
   `provider-leads`. مستخدم قارئ الشاشة بيسمع 13 combo box مجهولة. **مكنش في
   التقرير الأصلي خالص** — اتضاف كـ DM-06b.
3. **`admin-changes` فيها 69 عنصر تحت 44px** — التقرير قدّر checkbox واحد بـ 16px.
   الصفحة كلها محتاجة كنسة مش تعديل نقطة واحدة.
4. **`provider-projects` فيها 46 عنصر + 21 critical** — التاب ده مكنش مذكور في
   التقرير أصلاً.
5. **الأرقام المقدّرة كانت غلط في حالات:** select حالة الليد اتقدّر 26px وطلع
   **35px** (الـ min-height الافتراضي للـ select في المتصفح). التقرير اتصحّح.

### قيود لازم تتعرف — الفيز دي مغطّتش كل حاجة

الـ harness بيقيس **حالة الـ route وهي مفتوحة أول مرة بس**. أي حاجة ورا تفاعل
لسه غير مغطّاة:

- **DM-09** (تابات `CompanyEditor` بتعمل overflow) — مظهرش خالص (`overflow: 0`
  على كل اللوحات) لأن الـ modal مبيتفتحش غير لما تدوس "تعديل".
- **جزء من DM-06** — checkbox حقول التغيير ونجمة المشروع جوّا modals.
- **DM-05** (scroll متداخل في الشات) — الـ assertion اشتغلت 0 مرة لأن صفحة الشات
  بتفتح من غير محادثة مختارة، فالتريد مش مركّب أصلاً.

**المطلوب:** فيز 0.6 لاحقة (أو تتضاف لأول فيز محتاجاها) تفتح modal واحد على الأقل
لكل editor وتختار محادثة، وبعدين تشغّل نفس الـ assertions. من غيرها، DM-05 و DM-09
هيتصلّحوا "على الورق" من غير أي تحقّق.

### قرارات

- **اتشال project الـ `standalone`.** الفكرة كانت تشغيل حالات الموبايل بـ
  safe-area insets حقيقية عشان DM-04 يبقى قابل للقياس. جرّبت
  `--force-display-mode-standalone` و `--safe-area-insets=59,0,34,0` وقستهم:
  `env(safe-area-inset-top)` فضلت **0px** و `(display-mode: standalone)` فضلت
  **false**. يعني الـ project كان هيعدّي دايمًا وهو مش بيقيس حاجة — نفس عيب
  DM-01 بالظبط. اتشال، واتكتب بدله في Phase 2.2 إن الـ insets تعدّي على CSS
  custom properties عشان التست يقدر يـ override القيمة ويقيس فعلاً.
- **الـ baselines مش متتبّعة في git** (`git ls-files tests/__baseline__/` = 0).
  يعني مقارنة الـ screenshots شغّالة محليًا بس ومبتحميش من أي regression على
  جهاز تاني أو في CI. مش من نطاق Phase 0 — قرار مازن: نتتبّعهم (≈96 PNG) ولا لأ.

### اللي اتأجّل

- 14 خطأ ESLint موجودين من قبل في `src/` (لينكات `left-0/right-0` فيزيائية في
  `BottomNav`, `TopNav`, `RequestBar`, `CompanyProfile`, `Home` + تعارض
  `flex/hidden` في `ServiceCategory:174`). مش من شغل الفيز دي (قاعدة 4).

### التحقق
- `npx tsc -b --noEmit` ✅
- `npm run lint` — نفس الـ 14 خطأ اللي كانوا موجودين قبل الفيز، ولا واحد جديد ✅
- `npm run test:ui-audit` بيدخل اللوحات فعليًا وبيفشل على المشاكل الصح ✅

---

## Phase 1 — المكاسب الميكانيكية ✅ (2026-08-03)

### اللي اتعمل

| البند | التغيير | الملفات |
|---|---|---|
| **DM-03** | تاب الليدز والـ overview في لوحة المزوّد بقوا `hidden lg:block` للصفوف + `lg:hidden` كروت. الكارت بيفتح `LeadModal`/`WaitlistDetailModal` | `ProviderDashboard.tsx` |
| **DM-03** | `LeadListRow` المكرّر اتشال؛ بيتستورد دلوقتي من `admin/LeadsTab.tsx` | `ProviderDashboard.tsx` |
| **DM-09** | `overflow-x-auto` اتحطّت جوّا `Tabs` نفسه + `whitespace-nowrap flex-shrink-0` على تابات الـ editor | `Tabs.tsx`, `CompanyEditor.tsx` |
| **DM-10** | 5 مواقع `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` | `AdminOfferingsPanel.tsx` (×2), `ReviewsTab.tsx`, `LeadsTab.tsx` (×2) |
| **DM-17** | `aria-label` على 3 أزرار الليبل بتاعها `hidden sm:inline` | `AdminLayout.tsx`, `ProviderDashboard.tsx`, `CompaniesPage.tsx` |
| **DM-18** | `min-h-[44px]` على شريط تابات الإعدادات (كان 42px) | `SettingsTab.tsx` |

### قرار: `onDelete` بقى اختياري في `LeadModal`

`LeadModal` كان بيطلب `onDelete` إجباري، ولوحة المزوّد **معندهاش صلاحية حذف ليد**
(الصفوف القديمة مكنش فيها زرار حذف أصلاً). الحل كان بين إني أدّي المزوّد صلاحية
جديدة — ده تغيير business logic ممنوع في الفيز دي (قاعدة 5) — أو أخلّي الـ prop
اختياري والزرار يختفي لما ميتبعتش. اخترت التاني: نفس الصلاحيات بالظبط، الـ layout
بس اللي اتغيّر.

### قبل/بعد — `provider-leads-390-ar`

| | قبل | بعد |
|---|---|---|
| عناصر تحت 44px | **26** | **11** |
| axe critical (`select-name`) | **13** | **0** |
| axe serious | 2 | 2 (color-contrast — بند قديم) |

الـ 11 الباقيين **مش** من بنود Phase 1 — كلهم عناصر مستوى الـ shell بتظهر على كل
تاب: الهامبرجر (36×42)، اللوجو (36×36)، تسجيل الخروج (48×40)، `SearchInput`
(358×40)، و7 شرايح فلترة (32px). دول شغل **Phase 2** (DM-06).

> **تنويه مهم على الـ 13 `select-name`:** المخالفة اختفت من الموبايل لأن الـ
> selects دي بقت جوّا `hidden lg:block` — مش لأنها اتصلحت. المستخدم على شاشة
> ≥1024px **لسه** بيقابل 13 combo box من غير اسم. الإصلاح الحقيقي (`aria-label`
> على كل select في `LeadRows`) لسه مطلوب في Phase 2 مع DM-06.

### إصلاح في الـ harness نفسه — عدم ثبات النتائج

أول مقارنة قبل/بعد طلعت متناقضة: `admin-services` كان **0** مخالفة في تشغيلة و**11**
في اللي بعدها، وأنا ملمستش الملف ده أصلاً. تشغيلتين بنفس الكود بالظبط أثبتوا إن
**2 من 17 route** بيتغيّروا بين تشغيلة وتشغيلة (`provider-projects` من 46 لـ 0).

السبب: `waitForTimeout(2000)` ثابتة. الصفحات العامة بتكفيها، لكن اللوحات بتجيب
listاتها بعد الـ mount، فالعدّاد كان بيتغيّر حسب إيه اللي وصل في الثانيتين.
**عدّاد بيتحرّك مع الشبكة بيلغي فايدة المقارنة قبل/بعد أصلاً — وهي سبب وجود الـ suite.**

الحل: نستنى الـ DOM يبطّل يكبر (عدّ عناصر متطابق مرتين على بعد 250ms، بحد أقصى 8 ثواني)
بدل الانتظار الثابت. بعد التعديل: التشغيلتين اتطابقوا على كل الـ routes.

### سد ثغرة الـ modals — `tests/ui-audit-modals.spec.ts` (جديد)

Phase 0 سابت ثغرة موثّقة: الـ harness بيقيس الـ route وهي مفتوحة أول مرة بس، فـ
DM-09 كان هيتقفل من غير أي تحقّق. الملف الجديد بيفتح الـ modals فعليًا ويشغّل نفس
فحوص الـ overflow جوّاها.

**اتأكدت إن التست بيمسك المشكلة مش بس بينجح:** رجّعت تعديل `Tabs.tsx` مؤقتًا،
والتست فشل بالرسالة الصح (`tablist must be a horizontal scroller`)، وبعدين رجّعته
ونجح. تست بينجح من غير ما يكون قادر يفشل = مش تست.

### اللي اتأجّل
- تابات `CompanyEditor` نفسها ارتفاعها 38px (`py-2.5` + `text-label`) — تحت 44px.
  مش من بنود Phase 1؛ اتسجّلت لـ **Phase 2 (DM-06)**.
- `admin-leads` فيها 55 مخالفة `color-contrast` و2 `select-name` — بنود قديمة
  من الـ audit الأصلي (توكن `text-outline`)، مش من نطاق الفيز دي.

### التحقق
- `npx tsc -b --noEmit` ✅ · `npm run build` ✅
- `npm run lint` — نفس الـ 14 خطأ القديمة، ولا واحد جديد ✅
- `tests/ui-audit-modals.spec.ts` — 2/2 ناجحين، واتأكدت إنهم بيفشلوا من غير الإصلاح ✅
- تشغيلتين متطابقتين على نفس الكود = نفس الأرقام بالظبط ✅

---

## Phase 2 — اللمس والحواف الآمنة ✅ (2026-08-04)

### الأرقام — كل اللوحات @390-ar، نفس الـ harness في القياسين

| | قبل | بعد |
|---|---|---|
| عناصر تحت 44px | **128** | **20** |
| routes نضيفة تمامًا من ناحية اللمس | 6 من 18 | **10 من 18** |
| `select-name` (critical) | 13 | **4** |
| overflow أفقي جديد | — | **0** |

### 2.1 — أهداف اللمس (DM-06)

اتصلحت على مستوى الـ shell الأول (أعلى مضاعف — بتظهر في كل تاب):
الهامبرجر (36×42 → 44)، اللوجو (36×36 → 44)، تسجيل الخروج (48×40 → 44)،
و`SearchInput` (40 → 44) اللي بيظهر في كل شاشة list في اللوحتين **والموقع العام**.

وبعدين على مستوى الصفحات: شرايح الفلترة (32)، selects الفلترة `field-input !py-2`
(42)، أزرار الشات (28)، إخفاء/إظهار الرسالة (16)، أزرار كروت المشاريع (38–42)،
أزرار الموافقات والعروض (38)، نجمة تمييز المشروع (38)، تابات `CompanyEditor` (38)،
وselects + حذف الـ waitlist في `WaitlistManager` (28/38).

**DM-06b اتقفل صح المرة دي:** في Phase 1 الـ 13 `select-name` اختفوا من الموبايل
لأنهم اتخبّوا ورا `hidden lg:block` — المشكلة فضلت على الديسكتوب. دلوقتي كل select
في `LeadRows` و`WaitlistManager` بياخد `aria-label` باسم صاحب الطلب أو رقمه
(`الحالة — AA-20260803-8TUQ`)، فبقى ليه اسم على كل المقاسات.

### 2.2 — الحواف الآمنة (DM-04)

`--safe-top` / `--safe-bottom` في `:root`، و`.dashboard-topbar-safe` /
`.dashboard-bottom-safe` جنب `.bottom-nav-safe` الموجودة. اتطبّقوا على التوب-بار،
الـ drawer (من فوق ومن تحت)، حاوية المحتوى، وشريط حفظ الإعدادات.

المتغيّرات مش رفاهية — هي اللي بتخلّي التست ممكن أصلاً (شوف قرار Phase 0 بخصوص
إن Chromium مش بيعرف يعمل emulation للـ insets).

### 🔴 اكتشاف أثناء الشغل: شريط حفظ الإعدادات مكنش sticky من الأساس

تست DM-04 فشل بفارق **-214px**، وطلع إن السبب مش الـ safe area خالص.

`DashboardShell` كان فيه `<main className="flex-1 overflow-auto">`. قِسناها:
`main.scrollHeight === main.clientHeight` — يعني **الـ main مبيعملش scroll أبدًا**،
الـ document هو اللي بيعمل scroll. بس `overflow: auto` لوحدها بتخلّي العنصر
"أقرب scrolling ancestor" لأي `position: sticky` جوّاه. النتيجة: شريط الحفظ كان
مثبّت على حاوية مبتتحركش — يعني **مش sticky خالص**، والأدمن كان لازم ينزل لآخر
صفحة طولها ~2100px عشان يوصل لزرار الحفظ.

الكومنت في `SettingsTab.tsx` بيقول "always reachable, bottom-right" — ده كان
بيوصف سلوك مش بيحصل من ساعة ما اتكتب.

الحل: شيلنا `overflow-auto` من `main`. `min-w-0` هي اللي بتمنع الـ flex blowout
فعلاً؛ الـ overflow مكنش بيعمل حاجة غير إنه بيكسر الـ sticky. التست بقى أخضر،
ومفيش أي overflow أفقي جديد على أي route.

### تعديل على الـ assertion — checkbox جوّا label

`ChangeRequestsTab` checkbox عرضه 16px، وده **صح**: الهدف تحت WCAG 2.5.5 هو
الـ `<label>` اللي لافّاه، مش المربع نفسه — وتكبير المربع كان هيبقى تراجع بصري
مش إصلاح. الـ assertion اتعدّلت تستثني input جوّا label مقاسه ≥44px، وبكده
الإصلاح الصح (نكبّر الـ label) بيعدّي والإصلاح الغلط (نكبّر المربع) مش مطلوب.
`ReviewsTab` كان عنده نفس الحالة بس الـ label كان 38px — اتكبّر.

### اللي فاضل (20 عنصر) — اتأجّل بوعي

منتشرين على 8 routes بحد أقصى 4 لكل واحد: لينكات نصية جوّة (`a.text-label ...`
بارتفاع 17px)، وكام زرار داخل modals. الأهم منهم اتصلح؛ الباقي ذيل طويل.

**تنويه على الثبات:** `admin-settings` قرا 0 في تشغيلة و4 في اللي بعدها من غير أي
تغيير كود بينهم. إصلاح الـ DOM-stability بتاع Phase 1 ظبّط الأغلبية بس مش 100% —
التابات اللي جواها sub-tabs لسه بتتذبذب بـ ±4 عناصر. يتحسب هامش خطأ في أي مقارنة.

**مخالفات axe الباقية:** 206 عقدة `color-contrast` — دي بند توكن `text-outline`
القديم الموثّق في `UI-UX-AUDIT.md` (Phase 2 بتاعه)، مش من نطاق الشغل ده، والرقم
كبر لأن محتوى أكتر بقى بيتقاس مش لأن حاجة اتكسرت.

### التحقق
- `npx tsc -b --noEmit` ✅ · `npm run build` ✅
- 4 تستات في `ui-audit-modals.spec.ts` (DM-04 ×2، DM-09، DM-10) ناجحين ✅
- تست DM-04 فشل قبل إصلاح الـ sticky ونجح بعده ✅
- مفيش overflow أفقي جديد على أي من الـ 18 route ✅

---

## Phase 3 — تحويل لوحة المزوّد لـ routes ✅ (2026-08-04)

### اللي اتعمل

| البند | التغيير |
|---|---|
| **DM-02** | `ProviderLayout.tsx` (على وزن `AdminLayout.tsx`) + 10 route حقيقي تحت `/provider` + `ProviderIndexRedirect` بيحافظ على `?tab=` القديم |
| **DM-12** | كل تاب bundle لوحده — `ProviderDashboard.tsx` (1042 سطر) اتشال، `ProviderLayout.tsx` الجديد **6.1 كيلوبايت** |
| **DM-13** | `sw.js` بيقارن بالـ pathname الجذري (`/provider`) مش الـ URL كامل، وبيبعت `postMessage` للنافذة المفتوحة بدل ما يفتح نافذة تانية |

### البنية
- `pages/provider/nav.ts` — قايمة التابات + `isProviderTab` guard
- `pages/provider/context.ts` — `useProvider()` بيدّي كل تاب: `company`, `leads`, `agg`, `stats`, `pricingAllowed` (مقصود إنه صغير — أي حاجة تتحط هنا بتتحمّل مع الـ layout نفسه، يعني بترجع نفس مشكلة الـ bundle الواحد)
- `pages/provider/useProviderLeadActions.ts` — الميوتيشنز المشتركة بين Overview وLeads
- `pages/provider/useProviderCharts.ts` — مشتق بيانات الرسوم، مستورد بس من Overview وAnalytics (عشان مكتبة الـ charts متحمّلش في التابات التانية)
- `pages/provider/LeadRows.tsx` — صف الليد بتاع الديسكتوب، مشترك بين Overview وLeads
- `pages/provider/tabs/*.tsx` — 10 ملفات، واحد لكل تاب

### التحقق (`tests/ui-audit-modals.spec.ts` — تلات تستات DM-02 جداد)
- الرجوع بالمتصفح بينقل بين التابات مش بيطلّع بره اللوحة ✅
- الـ refresh على تاب بيفضل عليه (مش بيرجع Overview) ✅
- `?tab=messages` القديم (متضمّن في payload الإشعارات فعليًا من السيرفر) لسه بيوصل ✅

### 🔴 3 مشاكل حقيقية اكتشفناها والفيز مكانتش بتدوّر عليها

القاسم المشترك بين التلاتة: الـ harness بقى أوثق (DOM-stability من Phase 1 +
تشغيلات متكرّرة تحت ضغط الـ parallel workers)، فوصل لحالات المحتوى الحقيقي
لأول مرة بثبات — مش الفيز دي اللي كسرتهم.

**1. زرار حفظ الإعدادات مكنش sticky من الأساس (DM-04 revisited).**
موصوف بالتفصيل في قسم Phase 2 فوق — اكتُشف هنا لما تست DM-04 فشل بفارق -214px.
`overflow-auto` على `<main>` كانت بتخلّيه "أقرب scrolling ancestor" لعنصر
مبيتحرّكش أصلاً (الـ document هو اللي بيعمل scroll). اتشالت.

**2. `ProfileEditor.tsx` — 13-16 حقل فورم من غير اسم متاح (axe critical).**
كل `<label>` كان sibling للـ `<input>`/`<textarea>` بتاعه من غير `htmlFor`/`id` —
عمرها ما كانت مترابطة برمجيًا. المكوّن ده **مالوش أي علاقة بـ Phase 3** — نُقل
حرفيًا زي ما هو لـ `ProfilePage.tsx` — بس البند مكنش بيظهر ثابت قبل كده لأن
axe كان بيمسك الصفحة أحيانًا وهي لسه بتحمّل البيانات (فورم فاضي = مفيش عناصر
تتاخد عليها). الحل: `id` فريد لكل حقل (`profile-${key}`) + `htmlFor` مطابق
على كل الـ 16 label (15 حقل + note).

**3. زرار حذف مشروع في `ProjectsPage.tsx` أيقونة بس من غير `aria-label`.**
نفس الحكاية — اتنقل حرفيًا من الملف القديم، الأيقونة عندها `aria-hidden`
والزرار نفسه من غير اسم. اتضاف `aria-label`.

### إصلاح واحد سببه Phase 2 فعلاً — overflow حقيقي على `admin-changes`

`admin-changes` بيعرض `ChangeRequestsTab` اللي بيركّب `ProjectApprovals` جواه
(موافقات المشاريع مدمجة في نفس شاشة "طلبات التعديل"). صف كل مشروع فيه صورة 80px
+ لحد 4 أزرار (عرض/موافقة/رفض/حذف) في `flex gap-2` من غير `wrap`. على 390px
المساحة المتاحة للأزرار ≈278px، والأربعة مع بعض ≈345px — **overflow أفقي حقيقي**،
وطلع لليسار مش لليمين لأننا في RTL (الـ assertion الأصلية كانت بتفحص `right`
بس — اتزودت عشان تفحص `left` كمان، وده اللي كشف المشكلة أصلاً).

السبب الأرجح: زيادة `min-h-[44px]` على زرارين في Phase 2 (DM-06) زوّدت
العرض الكلي لحد ما عدّى الحيّز المتاح — كان "ضيق بس شغّال" قبل كده. الحل:
`flex-wrap` على صف الأزرار (بيحافظ على الـ 44px، الأزرار بتلف بدل ما تخرج
بره الشاشة). بينما كنت هناك: كمّلت أهداف اللمس الناقصة على نفس الصف
(موافقة، رفض) اللي الـ sed بتاع Phase 2 فاتها لأن الكلاس كان مختلف شوية.

### تحسين دائم في الـ harness — كشف overflow في RTL
assertion "no horizontal overflow" الأصلية كانت بتفحص `scrollWidth` بس من
غير ما تحدّد **مين** العنصر المسبّب. زودتها بخطوة تشخيصية: لو `scrollWidth`
تعدّى الـ `clientWidth`، تطبع كل عنصر بره الحدود — **من الاتجاهين** (`right`
زيادة **أو** `left` سالب). دي اللي مسكت مشكلة `admin-changes`: أول فحص
بيدوّر على `right` بس رجع فاضي رغم إن الصفحة فعلًا عندها overflow، لأن
العناصر كانت بتخرج من الشمال (طبيعي في RTL). محفوظة في الـ suite بشكل دائم.

### بنود اتسجّلت ومتصلحتش — برّه نطاق الفيز دي

**DM-20 (جديد) — `LField`/`TextField` label association مكسورة على مستوى
النظام كله.** نفس مشكلة `ProfileEditor` (label sibling من غير `htmlFor`)
بس في `admin/components/ModalShell.tsx`'s `LField` — الغلاف المشترك
لعشرات حقول الإدخال عبر `CompanyEditor`, `TeamTab`, `CategoryEditor`,
`ChangeRequestsTab` وغيرهم. ظهرت بس على `/admin/settings` (الصفحة الوحيدة
اللي بتعرض فورم زي ده من غير ما يحتاج فتح modal الأول). إصلاحها الصح محتاج
تمرير `id`/`htmlFor` فريد على كل الاستخدامات — عشرات المواقع، مش حاجة تتعمل
جوّا فيز روتنج. تستحق فيز a11y منفصلة.

`color-contrast` (91 عقدة) لسه بند `text-outline` القديم من `UI-UX-AUDIT.md`
الأصلي — نفس القرار من Phase 2، برّه النطاق.

### الأرقام النهائية — كل اللوحات @390-ar

| | Phase 2 (نهائي) | Phase 3 (نهائي) |
|---|---|---|
| عناصر تحت 44px | 20 | **17** |
| routes نضيفة تمامًا من اللمس | 8 من 18 | **10 من 18** |
| axe critical (`select-name`, `button-name`) | 6 | **0** |
| overflow أفقي | 0 | **0** (بعد إصلاح `admin-changes`) |
| حجم `ProviderDashboard` bundle | 65.9 كيلوبايت (ملف واحد) | **6.1 كيلوبايت** (`ProviderLayout`) + 10 chunks لوحدهم |

### التحقق
- `npx tsc -b --noEmit` ✅ · `npm run build` ✅ (rebuild نضيف، `dist/` كانت فيها
  ملفات قديمة من تشغيلات سابقة أول مرة — لازم `rm -rf dist` قبل أي قياس حقيقي)
- `npm run lint` — نفس الـ 14 خطأ القديمة، صفر جديد ✅
- 9 تستات في `ui-audit-modals.spec.ts` (DM-02 ×3, DM-04 ×2, DM-09, DM-10) —
  فشلة واحدة flaky بسبب race في worker parallelism اتأكّد إنها مش regression
  (تشغيلتين نضاف بعدها 9/9) ✅
- مفيش overflow جديد على أي route، بعد إصلاح `admin-changes` ✅

---

## Phase 4 — الحاجات اللي بتخلّيها "تطبيق" ✅ (2026-08-04)

### اللي اتعمل

| البند | التغيير | الملفات |
|---|---|---|
| **DM-05** | الشات بقى push-navigation: تحت `lg:` (أدمن) / `md:` (مزوّد) الليستة والتريد أبدًا مش الاتنين ظاهرين مع بعض | `admin/ChatTab.tsx`, `components/ProviderChat.tsx` |
| **DM-05** | المحادثة المختارة بقت `?c=<id>` في الـ URL بدل local state | نفس الملفين |
| **DM-05** | زرار رجوع في رأس التريد + زرار الرجوع بتاع المتصفح بيقفل التريد | نفس الملفين |
| **DM-07** | `BottomNav` بقى عام (list من items بدل مصفوفة ثابتة + `useSaved` مدمج جواه) | `components/BottomNav.tsx` |
| **DM-07** | شريط سفلي 4 تابات للوحتين: أدمن (نظرة عامة/الطلبات/المحادثات/طلبات التعديل)، مزوّد (نظرة عامة/الطلبات/الرسايل/الإتاحة) | `AdminLayout.tsx`, `ProviderLayout.tsx` |
| **DM-07** | `DashboardShell` بقى بياخد `bottomNav?` prop + كلاس `dashboard-has-bottom-nav` بيوسّع `.dashboard-bottom-safe` تلقائيًا لأي منطقة (منها شريط حفظ الإعدادات) من غير prop drilling | `DashboardShell.tsx`, `index.css` |

### القرار: `?c=` مش route param متداخل

الخطة كانت بتقترح `/admin/chat/:id` كـ route حقيقي. اخترت `useSearchParams`
(`?c=<id>`) بدالها لسببين: (1) السيرفر بيبعت إشعارات الشات لـ `/admin?tab=chat`
و`/provider?tab=messages` من غير id محدد أصلاً — يعني الـ deep-link الحقيقي
الوحيد الموجود دلوقتي هو على مستوى التاب مش المحادثة، فمفيش حاجة عملية بتستفيد
من route متداخل. (2) الـ search param بيدّي نفس الفايدة (URL-addressable +
زرار المتصفح بيقفل) من غير ما يحتاج تعديل بنية main.tsx's route children.

**تفصيل التنفيذ:** الاختيار بيعمل `push` (history entry جديدة)، وزرار الرجوع
في الـ UI بيعمل `navigate(-1)` — يعني نفس سلوك زرار المتصفح بالظبط، مش
`replace` بيضيف entry تانية. استثناء واحد: لو حد وصل لصفحة فيها `?c=` من غير
ما يختارها من جوّه التطبيق (deep link مستقبلي)، `navigate(-1)` كان هيطلّعه
برّه التطبيق — فيه ref (`selectedByUsRef`) بيتتبّع ده ويرجع لـ `replace`
عادي في الحالة دي.

### التحقق (12 تست جديد في `ui-audit-modals.spec.ts`)

**DM-05 (6 تستات، أدمن + مزوّد):** فتح محادثة على الموبايل بيملا الشاشة
ويخفي الليستة، زرار الرجوع بيقفلها، زرار المتصفح بيقفلها بردو، الديسكتوب
(1366px) لسه عمودين مهما كان فيه محادثة مختارة ولا لأ.

**اتأكدت إن التست بيمسك المشكلة مش بس بينجح:** رجّعت شرط الـ `hidden lg:block`
في `ChatTab.tsx` مؤقتًا (يعني رجّعت السلوك القديم اللي الاتنين ظاهرين مع
بعض)، والتست فشل بالرسالة الصح (`expect(locator).toBeHidden() failed` على
الليستة)، وبعدين رجّعت الإصلاح ونجح.

**DM-07 (6 تستات، أدمن + مزوّد):** الشريط بيظهر بـ 4 تابات بالظبط ومختفي على
الديسكتوب، badge عدد الطلبات مطابق لنفس الرقم في السايدبار، الشريط مش بيغطي
زرار حفظ الإعدادات، والموقع العام لسه شغّال زي ما هو (4 تابات، بادج المحفوظات).

**اتأكدت إن تست "مش بيغطي زرار الحفظ" بيمسك مشكلة حقيقية:** عطّلت الـ media
query بتاعة `.dashboard-has-bottom-nav .dashboard-bottom-safe` مؤقتًا
(`max-width: 767px` → `max-width: 1px`)، والتست فشل صح، وبعدين رجّعتها ونجح.

### الأرقام — كل اللوحات @390-ar، نفس الـ harness

| | Phase 3 (نهائي) | Phase 4 (نهائي) |
|---|---|---|
| عناصر تحت 44px | 17 | **17** (ثابت) |
| overflow أفقي جديد | 0 | **0** |
| axe serious/critical (كل الأنواع) | — | 78 (كله `color-contrast` القديم + `label` DM-20، صفر نوع جديد) |

مفيش رجوع لأي رقم — الفيز دي navigation/UX بحتة، مش المفروض تأثّر على
touch/overflow/axe أصلاً، والقياس بيأكّد كده.

### تنويه دقة: badge الـ bottom nav وترتيب DOM

تست "badge يطابق السايدبار" قارن بالأول النص الكامل (`innerText`) وفشل رغم
إن الرقمين متطابقين — السبب: `BottomNav.tsx` بيرسم icon→badge→label بينما
`SidebarNav.tsx` بيرسم icon→label→badge (ترتيب DOM مختلف، بصريًا كل واحد شكله
صح في مكانه). التست اتعدّل يقارن الرقم بس (regex `\d+`) مش النص الكامل —
تصحيح في التست، مش في الكود.

### اللي اتأجّل
- `SidebarNav`'s badge order vs `BottomNav`'s — فرق بصري بسيط بس مش نفس
  الترتيب بالظبط. مش عيب وظيفي، برّه نطاق الفيز.
- الـ `?c=` لو الأدمن غيّر الفلترة (بحث/شركة) بعد ما يفتح محادثة — الليستة
  اللي وراء التريد ممكن متبقاش شايفة نفس المحادثة لو الفلتر اتغيّر. حافة نادرة
  (نفس السلوك كان موجود قبل الفيز دي أصلاً) — مش رجوع، برضه مش من نطاق الفيز.

### التحقق
- `npx tsc -b --noEmit` ✅ · `npm run build` ✅
- `npm run lint` — نفس الـ 14 خطأ القديمة، صفر جديد ✅
- 20/20 تست في `ui-audit-modals.spec.ts` ناجحين في تشغيلة واحدة (صفر flakiness) ✅
- مفيش رجوع في touch targets، overflow، أو نوع axe جديد على الـ 18 route ✅

---

## Phase 5 — اللمسات الأخيرة ✅ (2026-08-05)

### اللي اتعمل

| البند | التغيير | الملفات |
|---|---|---|
| **DM-08** | كارت الشركة: `flex-col sm:flex-row` + ستاك الأزرار `flex-row flex-wrap sm:flex-col` + سطر الإحصائيات `flex-wrap` | `admin/tabs/CompaniesPage.tsx` |
| **DM-11** | قيم أعمدة `BarChart` ظاهرة دايمًا تحت `md:` بدل `opacity-0` حتى الـ hover | `components/Charts.tsx` |
| **DM-11** | 3 حالات `title=` بتحمل معلومة فريدة (تاريخ إعادة الفتح، سبب قفل الحذف، شارة "من إدارة العاصمة") بقت نص ظاهر أو `aria-label` | `admin/tabs/CompaniesPage.tsx`, `components/BusyWindowsEditor.tsx`, `provider/tabs/ReviewsPage.tsx` |
| **DM-14** | `vector-effect="non-scaling-stroke"` على كل عنصر مرسوم بخط في `Sparkline`/`AreaLineChart` | `components/Charts.tsx` |
| **DM-14** | تسميات الشهور في `BarChart`: واحد من كل اتنين تحت `sm:` | `components/Charts.tsx` |
| **DM-15** | الـ drawer بيتقفل بالسحب (touch-drag)، بيتابع الإصبع لحظيًا، ويرجع لمكانه لو السحب مكنش كفاية | `components/DashboardShell.tsx` |
| **DM-16** | زرار تحديث في التوب-بار للوحتين — بيعمل remount حقيقي للتاب الحالي | `components/DashboardRefreshButton.tsx` (جديد), `AdminLayout.tsx`, `ProviderLayout.tsx` |

### قرار: DM-14 اتحل بطريقة مختلفة عن اللي مكتوب في الخطة

الخطة كانت بتقترح تغيير `preserveAspectRatio="none"` لـ `"xMidYMid meet"`. جرّبت
الحساب الفعلي الأول: الـ `viewBox` نسبته 600:220 (≈2.7:1)، لكن الحاوية الحقيقية
بتتراوح من ≈1.6:1 على موبايل 390px لـ ≈3:1 على الديسكتوب — يعني `meet` كان
هيعمل letterbox عمودي على الموبايل (الرسم البياني هيصغّر لجزء من ارتفاع الكارت
ويسيب فراغ فوق وتحت)، وده أسوأ بصريًا من المشكلة الأصلية على بالظبط الجهاز اللي
المشروع كله بيركّز عليه.

المشكلة الحقيقية اللي التقرير وصفها ("سُمك خط مختلف") سببها إن `preserveAspectRatio=
"none"` بيعمل scale مختلف على المحورين، فسُمك الخط (`strokeWidth`) بيتمطّط بشكل
غير متساوٍ. الحل الصح: `vector-effect="non-scaling-stroke"` على كل عنصر بيتاخد
بـ stroke — بيخلي سُمك الخط ثابت بالبكسل الحقيقي بغض النظر عن الـ scale، من غير
ما نلمس الـ full-bleed responsive fill المقصود. "الميل المختلف" نفسه (مش السُمك)
طبيعي ومتوقّع لأي رسم بياني fluid-width — كل مكتبات الرسوم البيانية بتعمل كده،
مش عيب.

### تنويه: علامة الدائرة عند الـ hover لسه فيها تشوّه بسيط

`vector-effect="non-scaling-stroke"` بيثبّت سُمك الخط بس، مش شكل الـ fill —
دائرة الـ marker (نصف قطر 5px) لسه ممكن تبان بيضاوية شوية تحت scale غير متساوي.
قرار واعي: العنصر ده desktop-only (يظهر بس مع الـ hover، اللي مفيهوش لمس أصلاً)
والتشوّه بسيط جدًا (viewBox 2.7:1 قريب من نسبة الديسكتوب الفعلية ≈3:1) — مش
يستاهل تعقيد إضافي (رسم ellipse معكوس الـ scale يدويًا) في فيز "لمسات أخيرة".

### 🔴 باگ حقيقي اتكشف واتصلح: Rules of Hooks violation في `ProviderLayout`

أول محاولة لـ DM-16، حطّيت `useState(0)` بتاع الـ refresh key **بعد** الـ early
returns بتوع "لسه بيحمّل" و"مفيش شركة" — يعني الـ hook ده بيتنادى في بعض
الـ renders (لما فيه شركة) ومش في غيرها (لما لسه بيحمّل)، وده بالظبط اللي
React's Rules of Hooks بتمنعه. النتيجة: **كراش فوري على `/provider`** —
"Rendered more hooks than during the previous render" — مسكته بسكربت
Playwright قائم بذاته لما `auth.setup.ts`'s provider login فشل في العثور على
`#main`. الحل: نقلت الـ `useState` لفوق، جنب باقي الـ `useState` calls الأولانية
قبل أي early return.

**درس مهم:** `npx tsc -b --noEmit` **مانفعش** يمسك المشكلة دي — إنها crash وقت
التشغيل بس، مش خطأ نوع. لازم تشغيل فعلي (سكربت مستقل أو Playwright) بعد أي
تعديل على layout بيحتوي early returns.

### تنويه: بيئة التشغيل النهاردة كانت مش مستقرة

تشغيلات الـ suite الكاملة فشلت أكتر من مرة بأخطاء مالهاش علاقة بالكود:
`ERR_INSUFFICIENT_RESOURCES`، و worker process crash بكود Windows fastfail.
اتأكدت إنها مش حقيقية بـ: (1) سكربت Playwright مستقل بيشتغل صح ويرجّع 200 من
`/auth/login`، (2) تشغيل نفس الـ suite بـ `--workers=1` بدل الافتراضي عدّى
23/23 من غير أي فشل. السبب الأرجح: كذا سكربت probe مستقل شغّلته النهاردة فتح
متصفحات chromium إضافية فوق اللي الـ dev tooling أصلاً شغّاله، وده ضغط على
موارد الجهاز. مفيش أي تغيير في الكود اتعمل بسبب ده — كله كان تشخيص بيئة، مش
إصلاح باگ.

### 🟡 باگ تاني اتكشف واتصلح: 2 select من غير اسم في `LeadsPage.tsx`

الـ sweep الكامل بعد كل الإصلاحات طلّع axe critical `select-name x2` جديدة
على `admin-leads` — مش من أي حاجة لمستها في الفيز دي. تحقيق سريع طلّع إنهم
selects الفلترة (الحالة + الشركة) في أعلى شاشة الليدز — مختلفين عن الـ selects
اللي DM-06b صلّحها في Phase 2 (اللي كانت جوّا صفوف الليدز نفسها، مش أعلى الصفحة).
بند صغير (سطرين `aria-label`)، اتصلح فورًا زي `DM-06b` بالظبط.

### الأرقام النهائية — كل اللوحات @390-ar (مقارنة بـ Phase 3's نهائي، المرجع النضيف)

| | Phase 3/4 (نهائي، نضيف) | Phase 5 (نهائي) |
|---|---|---|
| عناصر تحت 44px | 17 | **20*** |
| overflow أفقي جديد | 0 | **0** |
| axe critical (`select-name`) | 0 | **0** (بعد إصلاح LeadsPage) |
| axe critical (`button-name`) | 0 | **0** |

\* الزيادة (3 عناصر، على `admin-companies`/`admin-services`/`admin-overview`)
اتفحصت وطلعت **مش قابلة للتكرار** — شغّلت نفس الـ route مرتين على التوالي
وماظهرتش تاني. نفس فئة "تفاوت التوقيت" الموثّقة من Phase 1 — مش رجوع حقيقي،
والعناصر التلاتة دي أصلاً مش في أي ملف اتلمس في الفيز دي.

### اختبار حقيقي لكل بند — نفس الانضباط من الفيزات اللي فاتت
- **DM-15:** رجّعت شرط الإغلاق (`fraction > 0.3` → `0`) مؤقتًا، التست فشل صح،
  رجّعته ونجح.
- **DM-16:** التست بيتحقق من 3 حاجات مش بس إن الزرار موجود: (1) أيقونة الدوران
  بتظهر فورًا، (2) طلب شبكة حقيقي لنفس الـ endpoint بيتبعت تاني، (3) رسالة
  "تم التحديث" بتوصل لقارئ الشاشة. مش تست ديكوري.

### اللي اتأجّل
- دائرة الـ hover marker في `AreaLineChart` (تشوّه بسيط، desktop-only، موثّق فوق).
- 232 عقدة `color-contrast` — نفس بند `text-outline` القديم من الـ audit
  الأصلي، برّه النطاق زي كل فيز فاتت.
- `DM-20` (`LField` label association) — لسه مفتوح، موثّق في Phase 3، برّه
  نطاق فيز اللمسات الأخيرة.

### التحقق
- `npx tsc -b --noEmit` ✅ · `npm run build` ✅
- `npm run lint` — نفس الـ 14 خطأ القديمة، صفر جديد ✅
- 23/23 تست في `ui-audit-modals.spec.ts` ناجحين (`--workers=1` بسبب ضغط
  الموارد المؤقت اليوم — شوف التنويه فوق) ✅
- مفيش overflow أفقي جديد، مفيش axe critical جديد، بعد إصلاح الـ 2 select
  الناقصين في `LeadsPage.tsx` ✅

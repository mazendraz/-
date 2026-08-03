# برومبت التنفيذ — إصلاح تقرير الـ UI/UX Audit على مراحل

> **طريقة الاستخدام:** ابدأ بـ "التعليمات العامة" مرة واحدة، وبعدين انسخ **فيز واحدة بس** في كل مرة.
> ماتديش الـ agent أكتر من فيز في نفس الوقت. كل فيز ليها معايير قبول لازم تتحقق قبل ما تروح للي بعدها.
> المرجع الكامل لكل مشكلة: [`UI-UX-AUDIT.md`](UI-UX-AUDIT.md)

---

## ⚙️ التعليمات العامة (انسخها مع أول فيز، وكرّرها في بداية كل جلسة جديدة)

```
إنت Senior Frontend Architect + Accessibility Engineer شغال على مشروع "العاصمة" (Al Assema).

## السياق
- الريبو: monorepo فيه `api/` (Next.js + Prisma) و `app/` (Vite + React 18 + React Router 6 + Tailwind 3.4.13).
- شغلك كله في `app/` بس. ماتلمسش `api/` إلا لو الفيز طلبت كده صراحةً.
- في تقرير audit كامل في `UI-UX-AUDIT.md` فيه 156 مشكلة بأرقام سطور وأدلة.
  اقراه (أو اقرا الجزء الخاص بالفيز اللي شغال عليها) قبل ما تبدأ أي تعديل.
- اللغة الافتراضية للموقع **عربي RTL**. أي حاجة تصلحها لازم تتأكد إنها مظبوطة بالعربي الأول،
  وبعدين بالإنجليزي.

## قواعد ثابتة — ماتكسرهاش
1. **الرفع:** `npm run ship -- "وصف التعديل"` من جذر المشروع. بس. مفيش `rebase`، مفيش
   `push --force`، مفيش branches جديدة، مفيش merge — إلا لو مازن طلب صراحةً. برانش واحد ثابت.
2. **قاعدة البيانات:** ماتشغلش `seed` ولا `db:setup` ولا `prisma migrate reset` نهائيًا في الشغل ده.
   الفيزات دي كلها frontend، مالهاش أي علاقة بالداتا.
3. **OneDrive:** الريبو متزامن مع OneDrive. لو ظهر `index file corrupt` أو `index.lock`:
   `rm -f .git/index.lock` ثم `git reset`. بعد أي عملية git اعمل `git status` وتأكد إن النتيجة
   زي المتوقع قبل ما تكمّل.
4. **نطاق الفيز:** نفّذ اللي في الفيز الحالية **بس**. لو لقيت مشكلة تانية، سجّلها في
   `FIX-NOTES.md` وكمّل — ماتصلحهاش دلوقتي.
5. **ماتغيّرش سلوك شغّال:** ده refactor بصري و a11y. لو تعديل هيغيّر منطق business logic،
   وقّف واسأل الأول.
6. **حافظ على الحاجات الكويسة:** بلوك `prefers-reduced-motion` في `index.css:565-610`،
   والكومنتات اللي بتشرح "ليه" — ماتحذفهاش وماتقللهاش. لو نقلت كود، انقل الكومنت معاه.

## طريقة الشغل في كل فيز
1. اقرا قسم الفيز كامل + المراجع اللي فيه من `UI-UX-AUDIT.md`.
2. اعمل خطة مختصرة بالملفات اللي هتتلمس، واعرضها عليا قبل التنفيذ.
3. نفّذ.
4. شغّل `cd app && npx tsc -b --noEmit` و `npm run build` — لازم يعدّوا من غير أخطاء.
5. اختبر يدويًا (أو بـ Playwright) حسب "معايير القبول" بتاعة الفيز، **بالعربي وبالإنجليزي**،
   على 390px و768px و1366px.
6. اعمل ملخص بالـ before/after للمشاكل اللي اتقفلت (بالـ IDs من التقرير).
7. ارفع بـ `npm run ship -- "..."` بالرسالة المكتوبة في آخر الفيز.
```

---

## 🧪 PHASE 0 — شبكة الأمان (نص يوم)

> من غير الفيز دي، كل الإصلاحات الجاية هتترجع تاني من غير ما حد ياخد باله.
> ده أهم استثمار في الشغل كله.

```
## الهدف
نبني حاجز آلي يمنع رجوع أي مشكلة من اللي في التقرير — قبل ما نصلح أي حاجة.

## المهام

### 0.1 — Baseline snapshots
- شغّل `npm run dev:app` وخد screenshots لكل route على 390 / 768 / 1366 بالعربي والإنجليزي.
- خزّنهم في `app/tests/__baseline__/` عشان نقارن بيهم بعد كل فيز.
- الـ routes: `/`, `/services`, `/services/:category`, `/companies`, `/companies/:slug`,
  `/start`, `/saved`, `/requests`, `/messages`, `/request`, `/terms`, `/privacy`,
  route غير موجود (404), `/admin`, `/provider`.

### 0.2 — Playwright suite
`@playwright/test` متسطّب بالفعل ومش مستخدم. اعمل `app/tests/ui-audit.spec.ts` يعمل
لكل route × {390, 768, 1366} × {ar, en}:

1. **Overflow:** `expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(clientWidth + 1)`
2. **Axe:** ضيف `@axe-core/playwright` وخلّي التست يفشل على أي violation درجتها serious أو critical.
3. **Touch targets:** كل `a, button, [role=button], input, select` مساحته >= 44×44px
   (استثني اللي `display:none`).
4. **Contrast:** axe بيغطيها، بس ضيف assertion صريح إن مفيش نص أصغر من 12px.
5. **Screenshot diff** مقابل الـ baseline.

### 0.3 — الحارس الأهم: Tailwind opacity guard
اكتب سكربت `app/scripts/check-tailwind-opacity.mjs`:
- يعمل build للـ CSS.
- يستخرج كل الكلاسات اللي على شكل `{utility}-{color}/{number}` من `src/**/*.tsx`.
- لكل واحدة، يتأكد إنها موجودة فعلًا في الـ CSS المولّد.
- يفشل بـ exit code 1 ويطبع قائمة اللي مش موجود.
اربطه في `package.json` كـ `"check:css"` وضيفه لأمر الـ build.

> ده الحارس اللي كان هيمسك مشكلة DS-01 (أخطر مشكلة في التقرير كلها) من أول يوم.

### 0.4 — ESLint rules
ضيف `eslint-plugin-tailwindcss` وفعّل:
- `no-contradicting-classname` (يمسك `text-body-md ... text-sm` — راجع TYPO-02)
- قاعدة `no-restricted-syntax` تمنع في الـ JSX:
  `text-left`, `text-right`, `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-0`, `right-0`, `border-l`, `border-r`
  مع رسالة: "استخدم logical properties: text-start, ms-*, me-*, ps-*, pe-*, start-0, end-0, border-s, border-e"

## معايير القبول
- [ ] `npm run check:css` بيفشل دلوقتي ويطبع الـ 42 كلاس بتوع DS-01 (ده إثبات إنه شغال).
- [ ] `npx playwright test` بيشتغل ويطلع تقرير فيه الـ failures المتوقعة (overflow على
      `/saved` و`/requests` و`/messages`، ومخالفات axe).
- [ ] `npx eslint app/src` بيطلع الـ ~50 مخالفة اتجاه فيزيائي.
- [ ] الـ baseline screenshots محفوظة.

## مهم
الفيز دي **مش المفروض** تصلّح أي حاجة. لو التستات نجحت كلها يبقى في غلط في التستات نفسها.
المطلوب إنها **تفشل بشكل صحيح**.

## الرفع
npm run ship -- "test: add UI audit safety net (playwright + axe + tailwind opacity guard + eslint rtl rules)"
```

---

## 🔴 PHASE 1 — إيقاف النزيف (نص يوم، ميكانيكي بالكامل)

```
## الهدف
إصلاح المشاكل اللي بتخلي واجهات كاملة مكسورة أو شفافة. كلها تعديلات ميكانيكية آمنة.
المرجع: UI-UX-AUDIT.md §3 و§5 و§6 و§7.

## المهام بالترتيب

### 1.1 — DS-01 (🔴 الأخطر): كلاسات Tailwind مش بتولّد CSS
Tailwind 3.4 مش بيولّد modifiers خارج الـ scale (0,5,10,15…100).
عندك 42 استخدام لـ `/6 /8 /12 /14 /18 /68 /72 /96 /97` — كلها مش موجودة في الـ CSS.

**الحل المفضّل** (بيخلي الكود زي ما هو):
في `app/tailwind.config.js` تحت `theme.extend` ضيف:
```js
opacity: { 6:'0.06', 8:'0.08', 12:'0.12', 14:'0.14', 18:'0.18', 68:'0.68', 72:'0.72', 96:'0.96', 97:'0.97' }
```
شغّل `npm run check:css` وتأكد إنه بقى بيعدّي. لو فضل في كلاسات ناقصة، ضيف قيمها.

**النتيجة المتوقعة (اتأكد منها بعينك):**
- `BottomNav.tsx:19` — الـ bottom nav على الموبايل يبقى ليه خلفية بيضا (دلوقتي شفاف تمامًا).
- `CompanyProfile.tsx:128` — الـ sticky CTA bar يبقى ليه خلفية.
- `Home.tsx:326,340,354` — الـ scrim الأسود يظهر تحت النص الأبيض على صور المشاريع.
- `TopNav.tsx:104,107` — لينك الـ nav النشط يبقى ليه خلفية.
- `SearchOverlay.tsx:155` — النتيجة المختارة بالكيبورد يبقى ليها highlight.
- `ConversationListItem.tsx:52` — المحادثة المفتوحة في الأدمن يبقى ليها highlight.

### 1.2 — RTL-01 (🔴): الـ drawer بيفتح من الناحية الغلط في العربي
`admin/index.tsx:200` و `ProviderDashboard.tsx:267` فيهم:
`className="drawer-left absolute top-0 left-0 ..."`
الـ CSS بيعكس **الأنيميشن** في RTL بس مش **الموضع**، فالـ drawer بيروح ناحية غلط.
`TopNav.tsx:257` عامل الصح — قلّده بالظبط:
`left-0 rtl:left-auto rtl:right-0`

### 1.3 — RESP-01 (🟠): تلات صفحات فيها scroll أفقي على الموبايل
`PersonalTabs.tsx:27` — `inline-flex` من غير حد أقصى ولا scroll.
غيّرها لـ: `flex max-w-full overflow-x-auto scrollbar-hide`
(نفس الباترن المستخدم صح في `Companies.tsx:177`).
ده بيصلّح `/saved` و`/requests` و`/messages` — وكمان بيرجّع الـ status filter chips
في `/requests` اللي كانت بره الشاشة خالص.

### 1.4 — RTL-02 / RTL-03 / RTL-04 / ADM-01: الاتجاهات الفيزيائية
Find & replace في `app/src/**/*.tsx` بس (مش في `index.css`):
| من | لـ | الملفات |
|---|---|---|
| `text-left` | `text-start` | GuidedStart:79,107 · LeadsTab:37,61,94 · ReviewsTab:183 · ChangeRequestsTab:128 · OverviewTab:154 · ProjectApprovals:84 · ProviderDashboard:304 |
| `ml-auto` | `ms-auto` | ProviderDashboard:291,431,1018 · admin/index:269 · TeamTab:268 · CompanyEditor:260 · ReviewsTab:248 · Charts:285 |
| `border-r` | `border-e` | admin/index:192 · ProviderDashboard:256 |
| `-ml-1` | `-ms-1` | TopNav:198 · admin/index:212 · ProviderDashboard:281 |
| `-mr-1.5` | `-me-1.5` | MyRequests:384 |
| `ml-0.5` | `ms-0.5` | ModalShell:18 |
| `pr-2` / `ml-1.5` | `pe-2` / `ms-1.5` | Charts:212,312 |
| `ml-1` | `ms-1` | ReviewsTab:266 · CompanyEditor:105 |
| `text-right` | `text-end` | Charts:286 |

### 1.5 — RTL-05: علامة التاب النشط في الـ provider sidebar
`ProviderDashboard.tsx:1014`: `left-0 ... rounded-r-full` → `start-0 ... rounded-e-full`
(النسخة الصح موجودة في `SidebarBody.tsx:43` ومعاها كومنت بيشرح ليه).

### 1.6 — RTL-06: سهم الـ select بيغطي النص في العربي
في `index.css:515-520` استبدل بلوك `select.field-input` بـ:
```css
select.field-input {
  padding-inline-end: 44px;
  background-repeat: no-repeat;
  background-position: right 14px center;
}
[dir="rtl"] select.field-input { background-position: left 14px center; }
```

### 1.7 — NAV-01 / NAV-02: 7 قيم مختلفة لتعويض ارتفاع الهيدر
الهيدر `fixed` بارتفاع 64px موبايل / 76px ديسكتوب، و`<main>` مفيهاش padding،
فكل صفحة بتعوّض لوحدها (من 48px لحد **4px** في `/request` و404).

الحل:
1. في `index.css` ضيف: `:root { --nav-h: 64px; } @media (min-width:768px){ :root { --nav-h: 76px; } }`
2. في `RootLayout.tsx:79` غيّر `<main>` لـ:
   `className="flex-grow page-enter pb-14 md:pb-0 pt-[calc(var(--nav-h)+2rem)]"`
3. **احذف** الـ padding من الصفحات دي: `Services.tsx:35` (pt-28), `ServiceCategory.tsx:58` (pt-28),
   `Companies.tsx:123` (pt-24 md:pt-28), `LegalPage.tsx:32` (pt-24), `GuidedStart.tsx:47`,
   `MyRequests.tsx:69`, `Saved.tsx:23`, `Messages.tsx:109` (pt-20 md:pt-24),
   `RequestForm.tsx:169,534,566` (pt-20), `NotFound.tsx:10` (pt-20).
4. `Companies.tsx:142` — الـ sticky filter bar: `top-[60px] md:top-[76px]` → `top-[var(--nav-h)]`
   (الـ 60px كان غلط أصلًا، الهيدر 64px، فكان في شريط 4px بيبان من ورا).
5. `CompanyProfile.tsx:129` و `index.css:620-627` — بيكرروا ارتفاع الـ bottom nav (3.5rem) في تلات
   أماكن. ضيف `--bottom-nav-h: 3.5rem` واستخدمه في التلاتة.

### 1.8 — UX-02 / UX-03: فلتر "متاح دلوقتي" بيفضل شغال بعد الـ Reset
`Companies.tsx:111-116` — `clearAll()` مش بيرجّع `availableOnly`.
`Companies.tsx:108` — `activeCount` مش بيحسبه، فمفيش chip بيظهر يقول إنه شغال.
صلّح الاتنين. وكمان badge الفلاتر في `Companies.tsx:191-195` لازم يعدّ الـ category
والـ availableOnly كمان.

## معايير القبول
- [ ] `npm run check:css` بيعدّي (صفر كلاسات ناقصة).
- [ ] `npx eslint app/src` بيعدّي (صفر مخالفات اتجاه).
- [ ] الـ overflow tests في Playwright بقت خضرا على `/saved` و`/requests` و`/messages`
      في اللغتين على 390px.
- [ ] **بعينك على 390px بالعربي:** الـ bottom nav ليه خلفية بيضا صلبة، والمحتوى مش
      باين من وراه.
- [ ] **بعينك على 390px بالعربي:** افتح `/admin` واضغط الهامبرجر — الـ drawer بيدخل
      من **اليمين**.
- [ ] كل الصفحات ليها نفس المسافة بالظبط بين الهيدر وأول عنوان.
- [ ] `/request` على 1366px: العنوان مش لازق في الـ nav.
- [ ] الـ screenshot diffs مراجَعة، وكل اختلاف مقصود.

## الرفع
npm run ship -- "fix(ui): critical rendering + RTL fixes — tailwind opacity scale, drawer direction, mobile overflow, logical properties, unified nav offset"
```

---

## ♿ PHASE 2 — أرضية الـ Accessibility (٢–٣ أيام)

```
## الهدف
نخلي التطبيق قابل للاستخدام بالكيبورد وقارئ الشاشة. المرجع: UI-UX-AUDIT.md §4.

## المهام بالترتيب (الترتيب مهم — 2.1 شرط لـ 2.2)

### 2.1 — A11Y-02 (🔴): الـ focus trap مش شغال أصلًا
`hooks/useDialogA11y.ts` بيرجّع الـ focus عند الإغلاق، بس **عمره ما بينقل الـ focus جوه
الديالوج عند الفتح**. و`trapTab` هو `onKeyDown` على الـ panel — يعني مش بيشتغل إلا لو الـ focus
جوه أصلًا، وهو مش بيدخل. فالـ trap شكلي بالكامل.

عدّل الهوك عشان يعمل عند الفتح:
1. يحفظ العنصر اللي كان عليه الـ focus.
2. ينقل الـ focus لأول عنصر قابل للتركيز جوه، أو للـ panel نفسه بـ `tabIndex={-1}`.
3. يحط `inert` (مع fallback `aria-hidden="true"`) على `#root` أو الـ app shell.
4. عند الإغلاق: يشيل الـ inert ويرجّع الـ focus.

> فكّر جديًا في استبدال الـ trap اليدوي بـ `<dialog>` + `showModal()` — بيديك
> trap و Escape و backdrop و inert مجانًا في كل المتصفحات الحالية.

### 2.2 — A11Y-01 (🔴): ModalShell مالهاش أي دلالات ديالوج
`pages/admin/components/ModalShell.tsx` — مفيش `role`، مفيش `aria-modal`، مفيش
`aria-labelledby`، مفيش focus trap، مفيش Escape، مفيش scroll lock، مفيش backdrop dismiss.
دي الـ modal بتاعة **كل** محررات الأدمن.

اربطها بالهوك المصلَّح من 2.1، وضيف:
`role="dialog" aria-modal="true" aria-labelledby={titleId}` + قفل `body` overflow +
إغلاق بالضغط على الخلفية + زرار إغلاق 44px.

### 2.3 — A11Y-03 / A11Y-04: ديالوجات من غير اسم ومن غير إدارة focus
- ضيف `aria-labelledby` أو `aria-label` لـ: `TopNav:249`, `Companies:269`,
  `MyRequests:371`, `admin/index:198`, `ProviderDashboard:265`.
  (`Home:563` و`SearchOverlay:103` عاملينها صح — قلّدهم.)
- `MyRequests.tsx:371` مش بيستخدم `useDialogA11y` خالص — اربطه.

### 2.4 — A11Y-05 (🔴) / A11Y-06: أزرار الحذف من غير اسم
`pages/admin/components/confirm.tsx:18-22` — لما `big` تبقى false، محتوى الزرار الوحيد
هو أيقونة. **زرار الحذف في كل الأدمن من غير اسم مقروء.**
- ضيف دايمًا: `aria-label={`${t(locale,'admin_delete')} ${label}`}`
- استبدل باترن الـ "armed" بديالوج تأكيد حقيقي للأفعال المدمّرة: يسمّي العنصر، يوضّح
  النتيجة، الـ focus على **Cancel** افتراضيًا، Escape بيلغي.
  (الباترن الحالي بيستبدل الزرار في مكانه = layout shift في لحظة قرار مدمّر.)

### 2.5 — A11Y-07: Skip link
ضيف skip link مخفي-لحد-التركيز كأول عنصر في `RootLayout` و`admin/index` و`ProviderDashboard`،
ويشاور على `<main id="main">`. (WCAG 2.4.1 — Level A).

### 2.6 — A11Y-08 / A11Y-09: labels و live regions
- `SearchInput.tsx:20-27` — ضيف `aria-label={ph}` على الـ input و`aria-hidden="true"`
  على أيقونة العدسة.
- لفّ كل عدّاد نتائج في `role="status" aria-live="polite" aria-atomic="true"`:
  `Companies.tsx:206`, `admin/index.tsx:269,302,393`, `Services`, `Saved`.
  > ملاحظة: `ChatThread.tsx:190` عامل ده صح بالفعل — خده كمرجع.

### 2.7 — A11Y-11 / A11Y-12 / A11Y-13: أهداف اللمس، الأحجام، التباين
- حد أدنى **44×44px** لكل عنصر تفاعلي. لو الشكل لازم يفضل صغير، كبّر منطقة الضغط
  بـ padding أو `::after` مش بتكبير الأيقونة.
  الأهم: `SaveButton.tsx:48` (36px → `w-11 h-11`), روابط الفوتر (19px → ضيف `py-2`),
  `confirm.tsx:19` (~32px), `ModalShell.tsx:7` (40px), `TopNav.tsx:178` (32px),
  أزرار صفوف الأدمن `admin/index.tsx:338-375` (~26px), `Companies.tsx:361` (19px).
- حد أدنى **12px** لأي نص. الأهم: `BottomNav.tsx:45` (10px → 11-12px مع تصغير الأيقونة),
  `TopNav.tsx:239` (9px), `Home.tsx:160` (10px).
- `BottomNav.tsx:29`: `text-outline/70` (تباين 2.3:1 ❌) → `text-outline` أو
  `text-on-surface-variant`. ماتخففش لون متوسط أصلًا بـ opacity.
- نفس المبدأ في `Services:58`, `Companies:237`, `CompanyProfile:389`, `SearchInput:25`.

### 2.8 — A11Y-10: اللون مش الدليل الوحيد على الحالة
`TopNav.tsx:101-108` و`BottomNav.tsx:27-29` — التاب النشط بيتميّز باللون بس.
React Router بيحط `aria-current="page"` تلقائيًا على `NavLink` — نسّق
`[aria-current="page"]` مباشرةً وضيف دليل غير لوني (أيقونة مليانة / شريط تحت).

### 2.9 — A11Y-17: أيقونات Material بتتقري بصوت عالي
اعمل كمبوننت `<Icon name label />` بيحط دايمًا `aria-hidden="true"` و`translate="no"`،
واعمل codemod لكل `<span className="material-symbols-outlined">` في المشروع (مئات).
> فايدة إضافية: بتوحّد أحجام الأيقونات في مكان واحد.

### 2.10 — A11Y-18: الشارتات من غير بديل نصي
`Charts.tsx` — تلات `<svg>` من غير `role="img"` ولا `aria-label` ولا `<title>`.
ضيف `role="img"` + `aria-label` يلخّص السلسلة + `<table>` مخفية بصريًا بنفس الداتا.
وضيف تمييز غير لوني لشرايح الـ donut.

### 2.11 — A11Y-19: مفاتيح الـ toggle
`ProviderDashboard.tsx:615-617` و`AvailabilityControl.tsx:83`:
`after:left-0.5` + `peer-checked:after:translate-x-4` → استخدم `start` وضيف
`rtl:peer-checked:after:-translate-x-4`. وضيف `role="switch" aria-checked` و`<label for>` صريح.

### 2.12 — FORM-01 / FORM-02: أخطاء الفورم
- `role="alert"` على رسالة الخطأ، `aria-invalid` + `aria-describedby` على الحقل.
- انقل الـ focus لأول حقل غلط بعد submit فاشل.
- حوّل من خطأ واحد على مستوى الصفحة لأخطاء على مستوى الحقل (`Home.tsx:612`,
  `RequestForm.tsx:484-487`) + ملخص في الأعلى بروابط لكل خطأ.

## معايير القبول
- [ ] axe بيعدّي بصفر violations من درجة serious/critical على كل route × viewport × لغة.
- [ ] **اختبار كيبورد يدوي:** من أول تحميل الصفحة، Tab واحد بيوصلك للـ skip link.
      افتح أي modal أدمن → الـ focus جوه، Tab بيلف جواها بس، Escape بيقفل،
      والـ focus بيرجع للزرار اللي فتحها.
- [ ] كل زرار أيقونة عنده اسم مقروء (افحص بـ accessibility tree في DevTools).
- [ ] كل العناصر التفاعلية >= 44×44px (تست Playwright أخضر).
- [ ] مفيش نص أصغر من 12px.
- [ ] غيّر فلتر في `/companies` وقارئ الشاشة بينطق عدد النتائج الجديد.

## الرفع
npm run ship -- "fix(a11y): dialog focus management, accessible names, skip links, live regions, touch targets, contrast"
```

---

## 🎨 PHASE 3 — نظام التصميم (٣–٥ أيام)

```
## الهدف
نخلي التوكنز هي مصدر الحقيقة الوحيد بدل 1,097 قيمة يدوية. المرجع: §3 و§8.

## المهام

### 3.1 — RTL-10 (🟠 مهمة جدًا): العناوين العربية بتقع على خط النظام
`index.css:643` بيحدد Cairo للـ body، بس كل عنوان عليه `font-display` /
`font-headline-*` اللي كلها بتروح لـ **Plus Jakarta Sans** — وده **مفيهوش حروف عربية**.
وبما إن الكلاسات دي specificity أعلى من الـ body، **كل عنوان عربي في المنتج بيتعرض
بخط النظام الافتراضي، ومختلف من ويندوز لماك.**

في `tailwind.config.js`:
```js
display: ['Plus Jakarta Sans', 'Cairo', 'sans-serif'],
sans:    ['Inter', 'Cairo', 'sans-serif'],
```
كده الحروف اللاتينية بتيجي من الأولاني والعربية بتنزل لـ Cairo.
وكمان: `index.html:24` بيحمّل خط **Alexandria** بـ 5 أوزان وهو مش مستخدم في أي مكان —
إما تستخدمه للعناوين العربية بشكل مقصود، أو تشيله (بيوفّر 5 ملفات خط في كل تحميل).

### 3.2 — TYPO-04: uppercase و tracking بيكسّروا العربي
`letter-spacing` **بيفصل الحروف العربية اللي المفروض تكون متصلة** — بيطلع كلمات مقطّعة.
و`uppercase` مالوش أي معنى في العربي.
غلّفهم بـ `ltr:` في: `Home.tsx:160,491` (11px + 0.1em tracking تحت الهيرو مباشرةً — أسوأ حالة),
`Footer:137`, `TopNav:290,305`, `CompanyProfile:361,374`, `Companies:282,294,309`.
> الأفضل: شيل المعالجة دي خالص واعتمد على الوزن واللون للتسلسل.

### 3.3 — TYPO-01 / DS-03 / TYPO-03: سلّم الخطوط
- ثبّت سلّم من 7 درجات في `theme.fontSize` بـ line-height و tracking و weight مدمجين.
- اعمل codemod للـ 1,097 استخدام لـ `text-[NNpx]` لأقرب توكن.
  (الأسوأ: CompanyProfile 79 · ProviderDashboard 69 · Home 64 · OfferingsEditor 52 · MyRequests 51)
- احذف الـ 7 أسماء الزيادة من `fontFamily` (`font-body-md` وإخواتها) — كلها aliases
  لنفس خطين، وبتدي وهم إن في 9 خطوط.
- فعّل قاعدة ESLint تمنع `text-[…px]`.

### 3.4 — TYPO-02: كلاسات متعارضة على نفس العنصر
`Footer.tsx:45,48,137,150` و`Services.tsx:99` فيهم توكن + قيمة يدوية مع بعض،
فالتانية بتكسب بصمت (`text-body-md ... text-sm` = 16px بتبقى 14px).
شيل الزيادة — يا توكن يا قيمة.

### 3.5 — DS-04 / DS-05 / DS-06 / DS-07: باقي التوكنز
- **الأنصاف الأقطار:** الصفحة الرئيسية لوحدها فيها 5 قيم. حدد سلّم:
  `sm 8px` (chips/badges) · `md 12px` (inputs/buttons) · `lg 16px` (cards) · `xl 24px` (sheets/modals) · `full`.
  واحذف الـ overrides في `tailwind.config.js:56-61` (كلها بتعيد تعريف قيم Tailwind الافتراضية = no-op).
- **الظلال:** 3 أنظمة متوازية. وحّدهم في سلّم من 4 درجات + قاعدة hover واحدة.
  (`soft-bloom` و`shadow-soft` و`soft-shadow` تلات أسماء لنفس الحاجة تقريبًا.)
- **المسافات:** ارتفاع الأقسام بيمشي 40/56 → 56/80 → 56/112px من غير قاعدة. استخدم
  توكنز `stack-*` الموجودة أصلًا. ووحّد padding الداشبوردين (`p-4 md:p-6` في الأدمن
  مقابل `p-6` في البروفايدر).
- **الألوان:** 29 قيمة hex + ألوان Tailwind الجاهزة (`amber-*`, `green-*`, `gray-*`).
  ضيف توكنز دلالية: `warning` / `success` / `info` + الـ containers بتاعتهم.
  استثناء مقصود: `CrashScreen.tsx` لازم يفضل zero-dependency — وثّق ده في الملف نفسه.
- احذف `.input-premium` (يتيم) ودمج `.modal-input` في `.field-input` كـ size variant.

### 3.6 — PERF-01: صفر صور بتحجز مساحتها
كل الصور من غير `width`/`height` (Home 22/22, Companies 10/10, Services 8/8).
كل صورة = layout shift. ضيف أبعاد (أو كلاس `aspect-ratio`) لكل `<img>` وجوه `LazyImage`.
> الأبعاد معروفة أصلًا — الكروت مستخدمة `h-44` و`h-48` و`h-64`.

### 3.7 — CMP-01 / CMP-02 / CMP-03: حالات التحميل
- `Skeleton.tsx:7-28` شكله مختلف عن `CompanyCard` الحقيقي (فيه زرارين مش موجودين
  في الكارت، وناقصه اللوجو المتداخل وصف النجوم) → الجريد بينطّ لما الداتا توصل.
  خلّي الاسكيليتون يتولّد من نفس layout الكارت.
- افصل `<Loading>` عن `<Empty>`. دلوقتي الأدمن بيعرض أيقونة "مفيش نتايج" مع كلمة
  "بيدوّر..." (`admin/index.tsx:276,309,398`).
- ورّي حالة تحميل عند **إعادة الجلب** مش بس أول مرة: `opacity-60 pointer-events-none`
  + `aria-busy` على منطقة النتايج طول ما `loading` شغالة.
  (دلوقتي بتغيّر فلتر وتفضل شايف النتايج القديمة من غير أي إشارة — ده أشهر سبب
  لبلاغات "الفلتر مش شغال".)

## معايير القبول
- [ ] **بالعربي:** كل العناوين بخط Cairo (أو الخط العربي اللي اخترته) — مش خط النظام.
      اتأكد بـ DevTools → Computed → font-family على `<h1>` و`<h2>`.
- [ ] **بالعربي:** التسميات تحت الهيرو في الصفحة الرئيسية بتبان ككلمات متصلة مش حروف مقطّعة.
- [ ] عدد أحجام الخط المستخدمة فعليًا في الـ DOM <= 8 لكل صفحة (كان 13 في الرئيسية).
- [ ] عدد أنصاف الأقطار <= 5، وعدد قيم الظل <= 4.
- [ ] `grep -r "text-\[" app/src` بيرجّع نتيجة قريبة من الصفر.
- [ ] CLS في Lighthouse < 0.1 على `/` و`/companies`.
- [ ] الـ screenshot diffs مراجَعة بند بند.

## الرفع
npm run ship -- "refactor(ui): design tokens — type scale, arabic font stack, radii, elevation, spacing, semantic colors, image dimensions"
```

---

## 🏗️ PHASE 4 — المعمار والـ UX (أسبوع–أسبوعين)

```
## الهدف
نشيل التكرار ونصلّح مشاكل التدفق. المرجع: §11 و§18.

## المهام

### 4.1 — CODE-01 / CODE-02: نسختين متطابقتين اتفرّقوا
`admin/components/SidebarBody.tsx` و`ProviderDashboard.tsx:1000-1030` نفس الكمبوننت
منسوخ بالإيد — وبالفعل اتفرّقوا:

| الحاجة | الأدمن | البروفايدر |
|---|---|---|
| علامة التاب النشط | `start-0` `rounded-e-full` ✅ | `left-0` `rounded-r-full` ❌ |
| محاذاة الـ badge | `ms-auto` ✅ | `ml-auto` ❌ |
| سهم الرجوع | ناقصه `rtl-flip` ❌ | حرف `←` حرفي ❌ |

نفس الحكاية في الـ shell (`admin/index.tsx:189-245` مقابل `ProviderDashboard.tsx:253-297`):
padding مختلف، عرض drawer مختلف، وbug الـ RTL-01 في النسختين.

استخرج `<DashboardShell>` + `<SidebarNav>` واحد يستخدمه الاتنين. بيحذف ~120 سطر مكرر.
> `ChatThread` هو النموذج الصح — كمبوننت واحد بيستخدمه التلات شاشات شات.

### 4.2 — NAV-06: حالة التابات مش في الـ URL
`admin/index.tsx:56-59` بيقرا `?tab=` مرة واحدة عند التحميل بس.
النتيجة: **زرار Back في المتصفح بيخرجك من الداشبورد كله**، ومفيش تاب ينفع يتبعت كلينك،
والـ refresh بيرجّعك للـ Overview وسط شغلك.

حوّل لـ nested routes حقيقية (`/admin/leads`, `/admin/companies`, …) بـ `<Outlet />`.
> ده بيحل **PERF-05** كمان: دلوقتي كل الـ 12 تاب + الشارتات + كل المحررات في chunk واحد.
> مع الـ routes تقدر تعمل `lazy()` لكل تاب.

### 4.3 — CMP-06 / CMP-05: كمبوننتات موحّدة
- `<Modal variant="center|sheet|fullscreen">` واحد بالـ a11y مدمج، يستخدمه العام والأدمن.
  (دلوقتي 5 نسخ يدوية بـ backdrop opacity و z-index و radius مختلفين.)
- `<EmptyState {icon,title,body,action}>` واحد. دايرة الأيقونة مكتوبة بالإيد في 6 أماكن —
  وكلها كانت مكسورة بنفس الـ bug (DS-01).

### 4.4 — CMP-12: نظام Toast
مفيش أي toast في المشروع. النجاح والفشل بيتعرضوا كنص inline بـ ~20 استايل مختلف.
النتيجة: أي نتيجة بره الشاشة **بتضيع تمامًا** (مثال: `admin/index.tsx:362` بيحط الخطأ
جوه الصف اللي ممكن يكون مش ظاهر).
اعمل toast region واحدة (`role="status"` للنجاح، `role="alert"` للأخطاء) + زرار **Undo**.

### 4.5 — UX-06: كل التعديلات fire-and-forget
`admin/index.tsx:143-156` — مفيش pending state ولا `.catch` ولا rollback.
الطلب اللي بيفشل بيتبلع بالكامل والواجهة بتفضل على القيمة القديمة من غير أي تفسير.
> لاحظ إن `admin/index.tsx:341` (toggle الإتاحة) هو المكان الوحيد اللي بيتعامل مع الفشل —
> يعني المشكلة معروفة واتصلحت في حتة واحدة بس.
اعمل helper واحد شبه `useMutation`: optimistic update + rollback + error toast.

### 4.6 — UX-01 / UX-04: فلتر بيكدب على المستخدم
`Companies.tsx:50,89,105` — `availableOnly` بيتطبّق جوه memo بتاع **وضع الديمو** بس.
في وضع الـ API `list = companySearch.data`، يعني الفلتر **عمره ما بيشتغل** — بس الزرار
بيتلوّن كإنه اشتغل.
يا تطبّقه server-side، يا تخفيه/تعطّله لما `isApiConfigured()` مع توضيح.
وكمان ضيفه للفلاتر على الديسكتوب (دلوقتي موجود في الـ sheet بتاع الموبايل بس).

### 4.7 — UX-05: محتوى الهيرو بيبدأ مخفي
`Home.tsx:85-116` — الـ `<h1>` والوصف والزرارين كلهم `.fade-up` (`opacity:0`) لحد ما
IntersectionObserver يشتغل، وبعدين transition 750ms.
- الـ LCP بيتأخر لحد 750ms لمجرد الزينة (والـ h1 هو غالبًا عنصر الـ LCP).
- لو الـ JS فشل أو اتأخر، **الهيرو بيفضل فاضي للأبد**.
خلّي محتوى الهيرو ظاهر افتراضيًا. `.fade-up` للمحتوى اللي **تحت** الطية بس.

### 4.8 — CMP-09 / CMP-10 / UX-08 / UX-09
- `Companies.tsx:273` — في drag handle بس مفيش drag. يا تنفّذه يا تشيله
  (affordance كاذبة أسوأ من مفيش).
- تابات حقيقية بالـ ARIA pattern (roving tabindex + أسهم) في `CompanyProfile:276`
  و`CompanyEditor`. أما `PersonalTabs` فهو تنقّل بين routes → المفروض `<nav>` بـ `aria-current`.
- تأكيد على toggle الإتاحة في الأدمن (بيغيّر **الموقع العام** بضغطة على زرار 26px
  جنب زرار Delete).
- حارس "تغييرات غير محفوظة" على المحررات و`/request` (`useBlocker` + `beforeunload`).

## معايير القبول
- [ ] `SidebarBody` و`DashboardShell` كمبوننت واحد لكل — مفيش نسخ.
- [ ] Back في المتصفح بينقلك بين تابات الأدمن، ومش بيخرجك من الداشبورد.
- [ ] `/admin/leads` ينفع يتبعت كلينك ويفتح على التاب الصح.
- [ ] حجم الـ chunk الأولي للـ `/admin` أقل بشكل ملحوظ (قارن قبل/بعد).
- [ ] غيّر status لـ lead والنت مقطوع → toast خطأ + رجوع للقيمة القديمة.
- [ ] الهيرو بيظهر فورًا حتى مع تعطيل الـ JS.
- [ ] LCP في Lighthouse أحسن من الـ baseline على `/`.

## الرفع
npm run ship -- "refactor(ui): shared dashboard shell, nested admin/provider routes, unified modal + toast, optimistic mutations"
```

---

## 🌍 PHASE 5 — التدويل والـ SEO (٢–٣ أيام)

```
## الهدف
نخلي النسخة العربية مواطن من الدرجة الأولى. المرجع: §15.

## المهام

### 5.1 — I18N-01 (🟠): كل عناوين الصفحات إنجليزي ثابت
`hooks/usePageMeta.ts` — الـ defaults إنجليزي، وكل النداءات بتبعت إنجليزي:
`"Services | Al Assema"`, `"Verified Companies | Al Assema"`, `"Page Not Found | Al Assema"`.
و`index.html` بيبعت نفس النصوص في `<title>` و`og:*` و`twitter:*` وهو معلن `lang="ar"`.

العربي هو **اللغة الافتراضية**. يعني تاب المتصفح والبوكماركس والهيستوري وكل معاينة
لينك على واتساب أو فيسبوك — كلها إنجليزي. وكمان `twitter:card` نوعه
`summary_large_image` من **غير `og:image`** فالمعاينة بتطلع فاضية.

- انقل كل العناوين والأوصاف لـ `lib/i18n`.
- ضيف `og:locale` و`og:url` و`og:image` و`canonical` و`hreflang` للـ ar/en.
- `usePageMeta.ts:30-32` بيرجّع الـ title بس عند التنظيف — الوصف والـ og بيفضلوا
  من الصفحة اللي فاتت. رجّع كل التاجات.

### 5.2 — I18N-05: الجمع في العربي
العربي عنده **6 صيغ جمع** (zero, one, two, few, many, other).
الكود عامل `total === 1 ? singular : plural` — يعني "2 شركات" غلط، لازم صيغة المثنى.
**كل عدّاد في المنتج غلط نحويًا بالعربي عند قيم معيّنة.**
استخدم `Intl.PluralRules(locale)` وغيّر شكل قاموس الترجمة.
الأماكن: `Companies:208`, `Pagination:41`, `admin/index:269`.

### 5.3 — I18N-04: الأرقام والتواريخ
الأعداد بتتعرض كأرقام JS خام من غير `Intl.NumberFormat`.
اعمل `formatNumber(locale, n)` واستخدمه في كل مكان. وقرر بشكل مقصود:
أرقام عربية-هندية (٠١٢٣) ولا لاتينية — المهم تكون قاعدة واحدة.
> `formatReopenDate` بياخد `locale` أصلًا — يعني النية موجودة، بس ما اتطبقتش على الأرقام.

### 5.4 — CMP-15: 4 نصوص إنجليزية ثابتة في الواجهة
`CompanyProfile:101`, `Home:552`, `Companies:357` (`label = "Remove filter"`),
`useServerSearch:122`. انقلهم لـ `lib/i18n`.
> المستخدم العربي بيشوف رسالة خطأ إنجليزي في اللحظة اللي محتاج فيها يفهم إيه اللي حصل.
ضيف قاعدة lint تمنع string literals في مواضع النص في الـ JSX.

### 5.5 — I18N-06: اللغة مش في الـ URL
اللغة في `localStorage` بس. يعني صفحة عربي **ماينفعش تتبعت كصفحة عربي**، ومحركات
البحث ماتقدرش تفهرس غير لغة واحدة لكل URL — فنص المحتوى مخفي عن البحث.
استخدم بادئات مسار (`/ar/…`, `/en/…`) أو `?lang=` + `hreflang`.

### 5.6 — I18N-07 / RTL-11 / RTL-12 / RTL-13 / RTL-14: تنضيف
- `TopNav:184,336` — `<span lang="en">English</span>` عشان قارئ الشاشة ماينطقهاش بالعربي.
- `admin/index:218` — شيل `capitalize` (بيتغلّب على نية المترجم في الإنجليزي، وno-op بالعربي).
- `ProviderDashboard:211` — بدّل حرف `←` بأيقونة `arrow_back` مع `rtl-flip`.
- `SidebarBody:68` — ضيف `rtl-flip` لسهم الرجوع.
- `index.css:635-637` و`657-659` — نفس قاعدة `[dir="rtl"] .rtl-flip` مكررة حرفيًا. احذف واحدة.

### 5.7 — NAV-07 / UX-15: لينكات الـ hash مكسورة
`/#about` و`/#reviews` و`/#contact` مستخدمين في الفوتر (على **كل** صفحة) وفي الـ drawer.
React Router مش بيعمل scroll للـ hash، و`<ScrollRestoration />` بيرجّع مكان التمرير.
يعني **الوسيلة الوحيدة للتواصل في المنتج مش شغالة من 12 route من أصل 13**.
اعمل صفحات `/about` و`/contact` حقيقية (أفضل — قابلة للفهرسة وللمشاركة).

## معايير القبول
- [ ] افتح أي صفحة بالعربي → عنوان التاب عربي.
- [ ] شارك لينك على واتساب → المعاينة عربي وفيها صورة.
- [ ] العدادات صح نحويًا عند 0 و1 و2 و3 و11 و100 بالعربي.
- [ ] `/contact` صفحة حقيقية شغالة من أي route.
- [ ] Lighthouse SEO >= 95.

## الرفع
npm run ship -- "feat(i18n): localized metadata, Intl plural rules + number formatting, locale in URL, real about/contact routes"
```

---

## ⚡ PHASE 6 — الأداء واللمسات الأخيرة (٢–٣ أيام)

```
## الهدف
نقفل مشاكل الأداء البصري وباقي البنود. المرجع: §16 و§17.

## المهام

### 6.1 — PERF-03: الـ TopNav بيعيد حساب gradient كل frame
`TopNav.tsx:37-60,86-98` — `scrollProgress` في React state بيتحدث كل rAF tick على أول
80px، فبيعيد render الـ TopNav وينتج inline style فيه **backgroundImage من 3 طبقات**
+ boxShadow من جزئين + borderBottom — على عنصر عليه `backdrop-filter: blur(28px) saturate(190%)`.
تغيير `background-image` بيجبر repaint لعنصر بعرض الشاشة كله وعليه blur كبير = أغلى
عملية رسم ممكنة. ده أرجح سبب الـ jank على أندرويد المتوسط في الصفحة الرئيسية.

الحل: حرّك القيمة بـ CSS custom property واحدة عن طريق `ref.current.style.setProperty`
(من غير أي React re-render)، وحرّك `opacity` لطبقتين معرّفتين مسبقًا بدل ما تعيد بناء
نص الـ gradient.

### 6.2 — PERF-04: 8 عناصر بـ backdrop-filter في نفس الوقت
على صفحة الشركة في الموبايل: الـ top nav والـ CTA bar وسلة الطلب والـ bottom nav
كلهم بيعملوا blur في نفس الوقت فوق صفحة مليانة صور وبتتمرر.
> ملاحظة: تلاتة منهم كانوا شفافين أصلًا بسبب DS-01، يعني الـ blur كان بيتحسب من غير أي فايدة.
قلّلهم لاتنين كحد أقصى؛ الـ bottom nav والـ CTA bar ياخدوا خلفية `rgba` صلبة.

### 6.3 — CP-03: تلات أشرطة ثابتة تحت في الموبايل
مع فتح السلة، آخر ~180px من شاشة 844px بيبقوا chrome (أكتر من 20% من الشاشة).
ادمج الـ CTA bar وسلة الطلب في شريط سياقي واحد.

### 6.4 — ANIM-03 / ANIM-04 / ANIM-05 / ANIM-08
- `Services.tsx:64` — `delay = i * 60` من غير سقف: الكارت الـ12 بيستنى 660ms.
  حطّ سقف زي `Companies.tsx:248` اللي عامل `Math.min(i,6)*60`.
- `hooks/useCountUp.ts` — أنيميشن JS، فـ `prefers-reduced-motion` ماتقدرش توصله.
  اقرا `matchMedia` في الهوك واقفز للقيمة النهائية على طول.
- `transition-all` على ~45 عنصر → عدّدها: `transition-colors` / `transition-transform` / `transition-shadow`.
- `index.css:27-29` — `scroll-behavior: smooth` عام ومش متعطّل في بلوك الـ reduced-motion.
  ضيف `html { scroll-behavior: auto }` جواه.
- وحّد المدد في 3 توكنز: `fast 120ms` / `base 200ms` / `slow 350ms` (دلوقتي 7 مدد مختلفة).
- وحّد مسافة الرفع عند الـ hover (دلوقتي 2px و4px و5px و6px).

### 6.5 — PERF-06 / PERF-07
- `RootLayout.tsx:25-42` بيعمل prefetch لـ 4 chunks حتى لمستخدم نزل على `/terms`.
  اربطه بـ `navigator.connection.saveData` و`effectiveType`، أو خليه على hover.
- `RootLayout.tsx:79` — `<main key={pathname}>` بيعمل remount للشجرة كلها كل تنقّل
  عشان الأنيميشن بس. يعني كل الـ state والطلبات الجارية بتتلغي وكل `useEffect` بيعيد
  الشغل. استخدم toggle لكلاس CSS بدل تغيير الـ `key`.

### 6.6 — RESP-02 / RESP-03 / RESP-04: باقي الاستجابة
- **التابلت (768–1023px) نطاق مهمَل.** خلّي الـ md تابلت بشكل صريح: فضّل الـ filter sheet
  وكروت الـ leads للموبايل لحد `lg:`؛ وضيف تخطيطات `sm:` بعمودين عشان القفزة تبقى
  1→2→3 مش 1→3.
  (أسوأ حالة: جدول leads بـ6 أعمدة في ~470px جنب sidebar عرضه 256px على آيباد.)
- `Home.tsx:72` — `h-screen` على iOS بيقيس أكبر viewport، فالـ scroll cue بتحت الطية.
  استخدم `h-[100svh]` مع fallback.
- `.mobile-scroll` بيخفي الـ scrollbar من غير بديل. ضيف نفس الـ mask-image fade
  المستخدم في الـ marquee (`index.css:406`) + نقاط مؤشرة.

### 6.7 — باقي البنود الصغيرة
راجع في `UI-UX-AUDIT.md` كل البنود المتبقية بدرجة 🔵 Low اللي ما اتغطّتش:
`DS-02` (dark mode ميت) · `HOME-04/05/06/07/12` · `SRV-06/07` · `CO-01/02/03/05` ·
`CP-05/06/07/10` · `GS-03/04/05` · `SAV-04/05` · `LEG-01/03` · `NF-03/05` ·
`ERR-01/03` · `ST-01/02` · `SO-02/03` · `ADM-05..09/16/24/25/27/28` ·
`PRV-08/09/11/13/15` · `CODE-06/08` · `NAV-03/04/05/08/09/10/11` · `UX-07/10..14`.

> `NAV-03` (مفيش تسجيل دخول عام) و`UX-14` (الطلب بيضيع مع مسح بيانات المتصفح)
> قرارات منتج مش تنفيذ — ناقشهم مع مازن قبل ما تنفّذ.

## معايير القبول
- [ ] Lighthouse Performance >= 90 على `/` موبايل (قارن بالـ baseline).
- [ ] مفيش long tasks > 50ms أثناء التمرير على `/` (سجّل profile في DevTools).
- [ ] شغّل الجهاز على reduced-motion → مفيش عدادات بتتحرك ومفيش smooth scroll.
- [ ] على 768px: `/companies` و`/admin` مش مزحومين وأهداف اللمس سليمة.
- [ ] كل تستات Playwright خضرا على كل route × viewport × لغة.

## الرفع
npm run ship -- "perf(ui): composited nav transition, fewer backdrop filters, motion tokens, tablet breakpoint, remaining polish"
```

---

## ✅ الإغلاق النهائي

```
بعد الفيز السادسة:

1. شغّل الجولة الكاملة: `npm run check:css && npx eslint app/src && npx tsc -b --noEmit
   && npm run build && npx playwright test`
2. قارن كل الـ screenshots بالـ baseline بتاع Phase 0 وراجع كل اختلاف.
3. حدّث `UI-UX-AUDIT.md`: علّم كل بند اتقفل بـ ✅ مع رقم الـ commit.
4. اعمل تقرير نهائي فيه:
   - كام بند اتقفل من كل درجة
   - أي بند اتأجل ومعاه السبب
   - أرقام Lighthouse قبل/بعد (Performance / A11y / SEO / Best Practices)
   - عدد مخالفات axe قبل/بعد
5. أي حاجة سجلتها في `FIX-NOTES.md` أثناء الشغل — راجعها مع مازن.

npm run ship -- "chore: close UI/UX audit — final verification report"
```

---

## 📌 ملخص سريع للفيزات

| # | الفيز | المدة | ليه بالترتيب ده |
|---|---|---|---|
| 0 | شبكة الأمان | ½ يوم | من غيرها كل الإصلاحات هترجع تاني |
| 1 | إيقاف النزيف | ½ يوم | ميكانيكي بالكامل، بيصلّح واجهات مكسورة فعليًا |
| 2 | Accessibility | ٢–٣ أيام | 2.1 شرط لـ 2.2؛ لازم قبل أي refactor للكمبوننتات |
| 3 | نظام التصميم | ٣–٥ أيام | التوكنز لازم تستقر قبل استخراج الكمبوننتات |
| 4 | المعمار والـ UX | أسبوع–أسبوعين | الاستخراج أسهل بعد ما التوكنز والـ a11y استقروا |
| 5 | التدويل والـ SEO | ٢–٣ أيام | مستقلة، ممكن تتنفذ بالتوازي مع 4 |
| 6 | الأداء واللمسات | ٢–٣ أيام | آخر حاجة — قياس الأداء مالوش معنى على كود بيتغيّر |

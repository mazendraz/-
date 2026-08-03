# المرحلة 10 — تحديث بصري لمسار الطلب (Requests flow)

> ريفاكتور بصري/UX فقط. صفر migration، صفر تغيير في منطق الحساب أو الـ API.
> الاتجاه المختار: **أ — هادئ واثق** (تطوير للهوية الحالية، نفس الألوان بس
> أنضف وأهدى) من المعاينة اللي شافها مازن.

## 0. الملفات المتأثرة (اتقروا كلهم كاملين الأول)

- `app/src/components/RequestItemPicker.tsx` — الملف الأساسي، ده اللي كانت
  فيه الصورة اللي بعتها مازن.
- `app/src/components/RequestBar.tsx` — الشريط العائم، قريب من الشكل
  المطلوب أصلًا، لمسات بسيطة بس.
- `app/src/pages/RequestForm.tsx` — الفورم نفسه، فيه ٤ صناديق تنبيه (busy/
  prefill/trust/error) كل واحد بألوان مختلفة عشوائية.
- `app/src/pages/MyRequests.tsx` — `LeadRequestCard` هنا فعلًا قريب من
  الاتجاه المطلوب (rounded-2xl shadow-bloom card-lift) — استخدمه كمرجع
  للاتساق، القسم اللي بيعرض `lead.items` جواه محتاج نفس لمسة الأرقام.

## 1. باج حقيقي لازم يتصلح (مش تحسين، باج)

في `RequestItemPicker.tsx` سطر 72:

```tsx
className="mt-0.5 w-4 h-4 flex-shrink-0 accent-[color:var(--color-primary,#8a6a4f)]"
```

`--color-primary` مش متعرّف في أي مكان في الكود (مفيش تعريف ليه في
index.css ولا tailwind.config.js) — يعني الـ checkbox بيرجع دايمًا
لـ fallback `#8a6a4f` (بني) بدل اللون الأساسي الحقيقي `#005578` (تيل
أزرق من tailwind.config.js). لازم يتصلح كجزء من الاستبدال في القسم 2
(هيتم استبدال الـ checkbox بالكامل بمكوّن مخصص، فالباج ده بيتحل تلقائيًا،
بس لازم يتوثق في الـ commit إنه كان باج).

## 2. RequestItemPicker.tsx — إعادة تصميم صف الاختيار

### 2.1 استبدال الـ checkbox الأصلي بمؤشر اختيار دائري مخصص

بدل `<input type="checkbox">` الأصلي، ابني زرار دائري (مش checkbox حقيقي
عشان نتحكم في الشكل، بس خليه button مع role وaria-pressed أو checkbox
مموّه بصريًا — المهم يفضل قابل للوصول بلوحة المفاتيح وقارئ الشاشة):

```tsx
<button
  type="button"
  role="checkbox"
  aria-checked={isSelected}
  onClick={() => toggle(offering)}
  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors touch-press
    ${isSelected ? "bg-primary border-primary" : "border-outline-variant/50 bg-surface-container-lowest"}`}
>
  {isSelected && (
    <span className="material-symbols-outlined text-on-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
      check
    </span>
  )}
</button>
```

٢٤×٢٤px بصريًا لكن لازم `min-w-[44px] min-h-[44px]` فعليًا على اللمس على
الموبايل (ممكن تحطها كـ padding حوالين الزرار مش على الزرار نفسه عشان
الشكل يفضل صغير بصريًا بس منطقة اللمس كبيرة — `<span className="p-2.5 -m-2.5">` حوالين الزرار). الـ `<label>` القديم يتحول لـ `<div>` عادي
(مش label) عشان مفيش input جواه دلوقتي، والـ onClick ينتقل لكل الصف مش بس
للزرار (سهولة أكبر في اللمس على الموبايل).

### 2.2 رفع الـ radius للصف نفسه

`rounded-xl` (سطر 63) → `rounded-2xl` عشان يتماشى مع باقي الكروت في
الموقع (MyRequests بيستخدم rounded-2xl). خلي `border` سطره الحالي
`border-primary/40 bg-primary/5` للمُختار كما هو — دي فعلًا متسقة مع
النظام، متتغيّرش.

### 2.3 عداد الكمية (qty stepper) — أزرار أكبر للمس

الوضع الحالي (سطور 95-113): أزرار `px-2 py-1` (~28px ارتفاع فعلي) —
صغيرة جدًا للمس على الموبايل. التغيير:

```tsx
<div className="flex items-center rounded-full border border-outline-variant/30 overflow-hidden bg-surface-container-lowest">
  <button
    type="button"
    onClick={() => patch(offering.id, { qty: Math.max(1, item.qty - 1) })}
    className="w-9 h-9 flex items-center justify-center text-primary font-bold hover:bg-surface-container transition-colors touch-press"
    aria-label={t(locale, "offer_decrease")}
  >−</button>
  <input
    type="number" min={1} value={item.qty}
    onChange={(e) => patch(offering.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
    className="w-11 text-center text-[14px] font-bold border-0 focus:outline-none bg-transparent"
  />
  <button
    type="button"
    onClick={() => patch(offering.id, { qty: item.qty + 1 })}
    className="w-9 h-9 flex items-center justify-center text-primary font-bold hover:bg-surface-container transition-colors touch-press"
    aria-label={t(locale, "offer_increase")}
  >+</button>
</div>
```

`rounded-lg` القديم بقى `rounded-full` (pill) — بيدي إحساس أنعم ومتسق مع
شكل الأزرار التانية في الموقع (زرار "استمرار" في RequestBar.tsx بالفعل
`rounded-xl`، فالـ stepper كـ pill بيديله تباين بصري لطيف بدل ما كل حاجة
تبقى نفس الشكل بالظبط).

### 2.4 الموبايل: فصل صف الكمية/الخيار عن بعض تحت ٣٧٥px

الوضع الحالي `flex flex-wrap items-center gap-3` (سطر 90) بيخلي الـ qty
والـ tier select يتزنقوا جنب بعض على الشاشات الضيقة. التغيير: خليه
`flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3` — على
الموبايل كل عنصر ياخد سطر لوحده، من ٦٤٠px (sm) لفوق يرجعوا جنب بعض.

### 2.5 صندوق الإجمالي (estimate box)

الوضع الحالي (سطر 144): `rounded-xl bg-surface-container p-4` — صندوق
رمادي مسطح. التغيير: حط حد علوي بلون primary وارفع حجم الرقم عشان
يبقى أول حاجة العين تقف عندها:

```tsx
<div className="rounded-2xl bg-surface-container border-t-[3px] border-primary p-4 space-y-1.5">
  <div className="flex items-center justify-between gap-2">
    <span className="text-[13px] font-bold text-outline">{t(locale, "offer_estimated_total")}</span>
    <span className="font-display font-black text-[20px] text-primary">
      {formatEstimate(result, locale)}
    </span>
  </div>
  {/* باقي الصندوق زي ما هو */}
</div>
```

(رفعنا حجم الرقم من `17px` لـ `20px` ولونه من `text-on-surface` لـ
`text-primary` عشان يبقى بارز — الرقم ده أهم حاجة في الصندوق ده.)

## 3. RequestBar.tsx — لمسات بسيطة

الشريط العائم قريب من الاتجاه المطلوب أصلًا. التغييرات الوحيدة:
- `rounded-2xl` (سطر 52) يفضل زي ما هو — متسق بالفعل.
- مفيش تغيير مطلوب هنا غير التأكد إن أي تغيير في القسم 2 (لون/حجم زرار)
  منعكس لو فيه أي مكوّن مشترك بينهم — مفيش حاليًا، فالملف ده يتسيب زي ما
  هو تقريبًا. لو حابب لمسة واحدة: زوّد الظل شوية ليتماشى مع الكروت
  التانية: `shadow-[0_8px_28px_-8px_rgba(0,0,0,0.18)]` (سطر 52) →
  `shadow-bloom` (استخدم الـ token الموجود بدل قيمة مكتوبة يدويًا).

## 4. RequestForm.tsx — توحيد صناديق التنبيه

في الفورم دلوقتي ٤ صناديق تنبيه بتصاميم مختلفة تمامًا (سطور 211، 230،
246، 411 — busy=amber، prefill=green، trust=primary/6، error=error). كل
واحد فيه نفس البنية (أيقونة + نص) بس ألوان وspacing مختلفة شوية. اعمل
مكوّن واحد مشترك:

```tsx
function Notice({ variant, icon, children, action }: {
  variant: "info" | "success" | "warning" | "error";
  icon: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const styles = {
    info:    "bg-primary/6 border-primary/18 text-primary",
    success: "bg-green-50 border-green-200 text-green-700",
    warning: "bg-amber-50 border-amber-200 text-amber-600",
    error:   "bg-error/8 border-error/25 text-error",
  }[variant];
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-3.5 mb-4 ${styles}`}>
      <span className="material-symbols-outlined text-[20px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}
```

استبدل الأربع صناديق (busy notice، prefill notice، trust bar، submit
error) باستخدام `Notice` — النص والمنطق الداخلي لكل واحد يفضل زي ما هو
بالظبط، بس الحاوية توحّدت. **مايتغيرش أي نص ولا أي منطق شرطي، بس الـ
wrapper.**

## 5. MyRequests.tsx — توحيد عرض أرقام البنود

قسم `lead.items` (سطور 174-225) بيستخدم أرقام بخط `text-[15px]`
للإجمالي — واحد بس عايزين نتأكد إنه بنفس حجم/لون الرقم الجديد في
`RequestItemPicker` (القسم 2.5 فوق: `20px` primary). ارفعه لنفس القيمة
عشان لما العميل يشوف نفس الرقم في مكانين (وقت الاختيار، وبعدين في صفحة
طلباتي) يبقى بنفس الوزن البصري بالظبط — مش شرط يكون نفس الحجم حرفيًا لو
سياق الكارت مختلف، بس خليه واضح إنه أهم رقم في الكارت (primary + font-black).

## 6. i18n

مفيش نصوص جديدة مطلوبة في القسم ده (كل الكلاسات اللي اتغيرت بصرية بحتة،
مفيش string جديد). لو أضفت أي aria-label أو نص جديد، لازم يدخل
`app/src/lib/i18n.ts` بالعربي والإنجليزي زي باقي المفاتيح — ممنوع نص
عربي/إنجليزي مباشر (ternary) في الكومبوننت.

## 7. RTL

كل الكلاسات المستخدمة فوق logical properties بالفعل (`ps-7`،
`flex items-center gap-X`، مفيش `mr-`/`ml-`/`left-`/`right-` جديدة). قبل
الـ ship، افتح الصفحة بالعربي وتأكد إن اتجاه الـ stepper (−/+) والـ
checkbox في المكان الصح (يمين/شمال حسب RTL) وإن مفيش تراكب.

## 8. تشيك ليست القسم 6 (من README.md) + معيار الجودة (phase-8 قسم 0)

بالإضافة للتشيك ليست القياسي، اختبر تحديدًا:
- كل التغييرات دي على شاشة ٣٧٥px (موبايل) — مفيش أي تراكب أو نص مقطوع.
- الـ checkbox الجديد شغال بلوحة المفاتيح (Tab + Enter/Space) مش بس بالماوس.
- الباج بتاع `--color-primary` اختفى فعلًا (افتح devtools وشوف الـ computed
  color بتاع المؤشر وهو مُختار — لازم يكون `#005578` مش `#8a6a4f`).
- صفحة MyRequests والفورم وكارت الشركة (RequestBar) كلهم شكلهم متسق مع
  بعض بعد التغيير — مش شكل منفصل لكل صفحة.
- عربي وإنجليزي، ديسكتوب وموبايل، صفر console errors.

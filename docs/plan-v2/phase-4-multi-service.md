# المرحلة 4 — Feature C · العميل يختار أكتر من خدمة

> **اقرأ [`README.md`](README.md) الأول** — فيه القرارات المتفق عليها والقواعد
> العامة وتشيك ليست الـ ship.

| | |
|---|---|
| **الاعتمادية** | [المرحلة 3](phase-3-offerings.md) — البنود بتشاور على `Offering` |
| **migration** | ✅ واحدة — `LeadItem` + حقول `Lead` + علاقة `items` على `Offering` |
| **ship** | واحد |
| **الرجوع** | ارجع الكود → `RequestForm` يرجع للخدمة الواحدة. `LeadItem` يفضل للطلبات القديمة |

---

محتاجة Feature B.

### الهدف
الطلب يبقى فيه أكتر من بند من نفس الشركة، بكميات، مع إجمالي تقديري وخصم باقة.

### قاعدة البيانات
```prisma
model LeadItem {
  id            String       @id @default(uuid())
  leadId        String
  offeringId    String?      // null لو العرض اتحذف بعدين
  nameSnapshot  String       // اسم العرض وقت الطلب
  tierLabel     String?
  qty           Int          @default(1)
  pricingModel  PricingModel // نسخة وقت الطلب
  unitPriceMin  Int?
  unitPriceMax  Int?
  lineMin       Int?         // qty * unitPriceMin
  lineMax       Int?

  lead     Lead      @relation(fields: [leadId], references: [id], onDelete: Cascade)
  offering Offering? @relation(fields: [offeringId], references: [id], onDelete: SetNull)

  @@index([leadId])
}
```
> ⚠ **الطرف التاني من العلاقة بيتضاف هنا كمان، مش في المرحلة 3.** ضيف
> `items LeadItem[]` في `model Offering` جوه **نفس** migration المرحلة دي.
> Prisma بيطلب الطرفين موجودين في نفس الوقت.

وفي `model Lead` ضيف:
```prisma
  items           LeadItem[]
  estimatedMin    Int?
  estimatedMax    Int?
  discountPercent Int?      @default(0)
  hasOnInspection Boolean   @default(false)
```

> **قاعدة مهمة:** الأسعار **بتتصوّر (snapshot)** لحظة الطلب. لو البروفيدر غيّر
> سعره بعدين، الطلبات القديمة ما تتغيّرش. ده شرط أساسي للثقة والمحاسبة.

### حساب السعر — دالة واحدة مشتركة
اكتبها مرة في `api/src/lib/services/pricing.ts` وكرّرها بنفس المنطق في
`app/src/lib/pricing.ts` (للمعاينة الحيّة)، **والباك إند هو المرجع النهائي**:

```
// 1) استبعد بنود المعاينة من الحساب صراحةً — مش بالاعتماد على إن أسعارها null
priced   = items.filter(i => i.pricingModel !== "ON_INSPECTION")
inspect  = items.filter(i => i.pricingModel === "ON_INSPECTION")

// 2) الأسطر (لبنود priced فقط — كل الأسعار دي مضمون إنها أرقام)
lineMin  = qty × (tier?.priceMin ?? offering.priceMin)
lineMax  = qty × (tier?.priceMax ?? offering.priceMax ?? offering.priceMin)

subtotalMin = Σ lineMin      subtotalMax = Σ lineMax

// 3) عتبة الخصم على عدد البنود الكلي، والخصم على المبلغ المسعّر بس
rule  = أعلى BundleRule منشور ونشط بحيث minItems <= items.length
total = subtotal × (1 - rule.discountPercent/100)

hasOnInspection = inspect.length > 0
```
> 🟡 **قرار الخصم مع بنود المعاينة:** العتبة (`minItems`) بتتحسب على **كل**
> البنود المختارة، لكن الخصم بينطبق على **المبلغ المسعّر بس**. يعني عميل
> اختار ٣ بنود اتنين منهم "بعد المعاينة" بيوصل للعتبة وبياخد ١٥% على البند
> المسعّر الوحيد. اعرض ده صريح في الملخص:
> `خصم الباقة ١٥٪ (على البنود المسعّرة)`.

> 🟡 **لو كل البنود `ON_INSPECTION`:** مفيش إجمالي خالص — اعرض
> "السعر يتحدد بعد المعاينة" بدل `0 – 0 ج`. ده تست إجباري.

البنود بـ `ON_INSPECTION` بيظهر تحت الإجمالي: **"+ بنود تتحدد بعد المعاينة"**.

> 🟡 **منع الـ drift بين النسختين:** ملف حالات مشترك في **جذر الريبو**:
> `pricing-cases.json` (مصفوفة `{ name, input, expected }`)، وتستين
> بيقرأوه — واحد في `api` وواحد في `app`.
>
> **اقراه بـ `fs.readFileSync` وقت التست، مش بـ `import`:**
> ```ts
> const cases = JSON.parse(
>   readFileSync(new URL("../../../../pricing-cases.json", import.meta.url), "utf8"),
> );
> ```
> كده مش محتاج `tsconfig` paths ولا إعداد vitest إضافي ولا
> `server.fs.allow` في Vite — لأنه بيتقرا وقت التشغيل من Node، مش بيتحزم
> في البandle. سطرين في كل طرف وخلاص.
>
> ⚠ **ده دَيْن تقني مقصود.** الحل الأنضف موديول مشترك حقيقي (workspace
> package)، بس ده بيغيّر شكل الـ monorepo كله. الاختيار الحالي مقبول
> بشرط إنك عارف إنه دَيْن: منطق مكرر مرتين + ملف حالات بيمنع الانحراف.
> لو الحسابات عقّدت أكتر من كده بعدين، ارجع لمازن عشان تحوّلها لـ package.

### الفرونت إند
- **سلة لكل شركة** في `app/src/lib/cart.ts` — تخزين في localStorage
  (`al-assema-cart-<companySlug>`)، بنفس نمط `useSaved.ts`. تتمسح بعد إرسال الطلب.
- `CompanyProfile.tsx` — زر "أضف للطلب" على كل كرت عرض + شريط سفلي عائم
  "٣ خدمات · تقديري 45,000 – 60,000 ج · متابعة".
  > الكلاس `.compare-bar-offset` موجود في `index.css:620` (بيرفع الشريط فوق
  > الـ bottom nav ومنطقة الأمان في iOS) بس **مفيش مكوّن `CompareBar`** في
  > المشروع — اعمل `app/src/components/RequestBar.tsx` جديد واستعمل الكلاس ده.
- `RequestForm.tsx` — بدل الـ `<select>` الواحد (سطر ~278) اعرض:
  - قائمة العروض بـ checkbox + عدّاد كمية + اختيار الشريحة.
  - صندوق ملخص حيّ فيه البنود، الخصم، والإجمالي التقديري.
  - حقل `budget` الحالي **يفضل موجود** كـ "ميزانيتك التقريبية" — مفيد لما كل
    البنود بعد المعاينة.
- `MyRequests.tsx` + تفاصيل الطلب — اعرض البنود والإجمالي التقديري.
- **التوافق الخلفي:** خلي `Lead.service` يتملّى بأسماء البنود مفصولة بفاصلة
  عشان القوائم والإشعارات والتصدير القديمة تفضل شغالة.

### الاختبار
- بند واحد → نفس نتيجة النظام القديم.
- ٣ بنود مع قاعدة `minItems: 3, discountPercent: 15` → الخصم اتطبّق مرة واحدة.
- بند `ON_INSPECTION` + بند بسعر → الإجمالي بيعرض الرقم + ملاحظة المعاينة.
- تغيير سعر العرض بعد الطلب → الطلب القديم ثابت.

---


# المرحلة 3 — Feature B · نظام الأسعار (Offerings)

> **اقرأ [`README.md`](README.md) الأول** — فيه القرارات المتفق عليها والقواعد
> العامة وتشيك ليست الـ ship.

| | |
|---|---|
| **الاعتمادية** | 🔴 [المرحلة 2](phase-2-change-requests.md) — **حقيقية مش شكلية**. Feature B مابيعملش نظام موافقة خاص بيه |
| **migration** | ✅ واحدة — `Offering` + `OfferingTier` + `BundleRule` + backfill |
| **ship** | **اتنين** — B1 (باك إند) ثم B2 (واجهات). شوف آخر الملف |
| **الرجوع** | ارجع الكود → الواجهات ترجع تقرا `Company.services` (لسه موجود). العروض تفضل في الداتا |
| **بيعتمد عليها** | [المرحلة 4](phase-4-multi-service.md) |

> ⚠ **المرحلة دي كمان بتوصّل باقي كيانات `ChangeEntity`** (`OFFERING`,
> `OFFERING_TIER`, `BUNDLE_RULE`) اللي المرحلة 2 سابتها راجعة
> `400 ENTITY_NOT_SUPPORTED`.

---

محتاجة بنية الموافقات من Feature A.

### الهدف
كل شركة تعرّف "عروض" (خدمات أو منتجات) لكل واحد سعر واضح: ثابت، رينج، سعر
بالوحدة (م²/باب/غرفة)، أو **"بعد المعاينة"**. مع شرائح كمية للحالات زي
"تشطيب غرفة / غرفتين / تلاتة".

### 🔴 قاعدة النشر — اقرأها قبل ما تكتب أي سكيما

**ممنوع تحط حالة مراجعة على صف الـ Offering نفسه.** لو عملت كده، عرض معتمد
وظاهر للعملاء، أول ما البروفيدر يعدّل سعره بجنيه، الصف يرجع PENDING **ويختفي
من البروفايل العام** لحد ما الأدمن يوافق. ده مش تشديد رقابي — ده حذف مؤقت
للمحتوى بسبب تعديل بسيط، وهيخسّرك عملاء.

**القاعدة الحاكمة — جملة واحدة تحسم كل مسارات الكتابة:**

> **`isPublished = false` → مسودة يملكها البروفيدر → كتابة مباشرة.**
> **`isPublished = true` → محتوى عام → كل تعديل يمر بـ `ChangeRequest`.**

مش استثناء ولا حالة خاصة — ده نموذج draft/published العادي. اللي بيحدد مسار
الكتابة هو **حالة الصف**، مش نوع الـ endpoint. جدول كامل عشان مفيش أي غموض:

| الحالة | `POST` | `PATCH` | `DELETE` | نشر |
|--------|--------|---------|----------|-----|
| مسودة **حرّة** (`isPublished=false`، مفيش PUBLISH معلّق) | بيعمل الصف مباشرة | **كتابة مباشرة على الصف** | **حذف مباشر** | `ChangeRequest{PUBLISH}` |
| مسودة **مقفولة** (`isPublished=false` + PUBLISH معلّق) | — | **409 `PUBLISH_PENDING`** | **409 `PUBLISH_PENDING`** | — (في طلب قايم) |
| منشور (`isPublished=true`) | — | `ChangeRequest{UPDATE}` — الصف ما يتلمسش | `ChangeRequest{DELETE}` | — |

### 🔴 قفل المسودة أثناء مراجعة النشر — من غيره نظام الموافقة بلا معنى

لو المسودة فضلت "كتابة مباشرة" وعليها PUBLISH معلّق، السيناريو ده بيعدّي:
البروفيدر يبعت PUBLISH لعرض نضيف → الطلب يستنى في الطابور → **الصف لسه
مسودة فالكتابة عليه مباشرة** → يغيّر السعر لـ ١ ج أو يحط أي محتوى → الأدمن
يوافق على اللي شافه → اللي اتنشر هو المحتوى الجديد. الأدمن وافق على حاجة
واتنشرت حاجة تانية، وده بيفرّغ الـ feature كلها من هدفها.

**الحل — دفاعان، الاتنين إجباريين:**

1. **القفل:** طالما في `ChangeRequest{PUBLISH, PENDING}` على الصف، أي
   `PATCH`/`DELETE` عليه يرجّع **409** `{ code: "PUBLISH_PENDING" }` برسالة
   واضحة: "طلب النشر تحت المراجعة — الغِ الطلب الأول عشان تعدّل". إلغاء الطلب
   (`DELETE /api/provider/change-requests/:id`) بيفك القفل فورًا. القفل ده
   **مش** بيمس `isActive`/`sortOrder` — دول استثناء فوري في كل الحالات.
2. **إعادة التحقق وقت الموافقة:** طلب الـ PUBLISH بيخزّن في `snapshot` **كل**
   الحقول المنشورة للصف وقت الإرسال (يعني `EDITABLE_FIELDS[entity]` كاملة، مش
   حقل واحد)، و`changes = {}`. وقت الموافقة قارن `snapshot` بالصف الحالي بـ
   `deepEqual`؛ لو مختلف → **ماتنشرش**، رجّع `409 STALE_SNAPSHOT` واعرض
   للأدمن الـ diff وخيار "أنشر المحتوى الحالي".

   الدفاع التاني مش زيادة: القفل ممكن يتخطى بـ race بين فحص القفل والكتابة، و
   `snapshot` هو اللي بيضمن إن اللي اتنشر هو اللي الأدمن شافه فعلًا.

النتائج المقصودة:
- البروفيدر يصلّح غلطة مطبعية في عرض لسه مانزلش من غير ما يستنى حد. منطقي.
- عرض منشور ما يختفيش ولا يتغيّر لحظة واحدة أثناء المراجعة. ده الهدف الأصلي.
- الموافقة على `PUBLISH` = تأكيد `snapshot` مطابق ثم `isPublished = true`.
- الموافقة على `UPDATE` = تطبيق `changes` على الصف داخل transaction.
- الموافقة على `DELETE` = حذف الصف داخل transaction.
- في السيرفس اعمل الفرع ده في **مكان واحد** (`assertWritePath(row)`) عشان
  ما يتكررش في كل endpoint ويتنسى في واحد. نفس الدالة هي اللي بتفحص القفل.
- نفس المنطق بالظبط لـ `OfferingTier` و `BundleRule`.

**تستات إجبارية:** عدّل مسودة عليها PUBLISH معلّق → 409 · الغِ الطلب ثم عدّل →
ينفع · عدّل الصف في الداتابيز مباشرة ثم وافق → `STALE_SNAPSHOT` مش نشر صامت.

**صمّام الأمان:** حذف المنشور محتاج موافقة، بس البروفيدر يقدر يعمل
`isActive = false` **فورًا** (شوف الاستثناء تحت) — فلو في عرض بسعر غلط
بيوصله عملاء، يقدر يخفيه حالًا من غير ما يستنى الأدمن.

### قاعدة البيانات
```prisma
enum OfferingKind { SERVICE PRODUCT }
enum PricingModel { FIXED RANGE PER_UNIT ON_INSPECTION }

// وحدات مضبوطة — مش String حر. "م²" و"متر مربع" و"m2" كنصوص حرة بيكسروا
// مقارنة مرجع الفئة من أساسها.
enum PriceUnit { SQM METER PIECE DOOR WINDOW ROOM APARTMENT HOUR DAY JOB }

model Offering {
  id             String          @id @default(uuid())
  companyId      String
  name           String
  description    String?         @db.Text
  kind           OfferingKind    @default(SERVICE)
  pricingModel   PricingModel    @default(RANGE)
  priceMin       Int?            // بالجنيه المصري، أرقام صحيحة (مفيش قروش)
  priceMax       Int?
  unit           PriceUnit?      // إجباري لما pricingModel = PER_UNIT
  minQty         Int?            // حد أدنى للكمية (مثلاً 50 م²)
  image          String?
  note           String?         // "السعر لا يشمل الخامات"
  sortOrder      Int             @default(0)   // ⚠ استثناء — شوف تحت
  isActive       Boolean         @default(true) // ⚠ استثناء — شوف تحت
  isPublished    Boolean         @default(false) // بيتحول true بأول موافقة أدمن
  migratedFromService String?    // اسم الخدمة القديمة اللي اتولد منها — للترحيل بس
  priceUpdatedAt DateTime?       // لعرض "الأسعار محدّثة في ..."
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  company Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  tiers   OfferingTier[]
  // ⚠ ماتضيفش "items LeadItem[]" هنا في المرحلة دي. موديل LeadItem بيتخلق
  //   في المرحلة 4 (Feature C) — لو كتبته دلوقتي prisma validate هيقع على
  //   علاقة لموديل مش موجود. العلاقة بتتضاف في migration المرحلة 4 على
  //   الطرفين مع بعض.

  @@index([companyId, isPublished, isActive, sortOrder])
  // مفتاح الترحيل — بيخلي سكربت الـ backfill idempotent من غير ما يفرض قيد
  // منتج دائم على أسماء العروض (شوف "ترحيل البيانات القديمة").
  @@unique([companyId, migratedFromService])
}

model OfferingTier {
  id         String @id @default(uuid())
  offeringId String
  label      String  // "غرفة واحدة" · "2–3 غرف" · "شقة كاملة"
  qtyMin     Int?
  qtyMax     Int?
  priceMin   Int?
  priceMax   Int?
  sortOrder  Int     @default(0)

  offering Offering @relation(fields: [offeringId], references: [id], onDelete: Cascade)

  @@index([offeringId, sortOrder])
}

// خصم الباقة — لـ Feature C
model BundleRule {
  id              String   @id @default(uuid())
  companyId       String
  label           String?  // "خصم الباقة الكاملة"
  minItems        Int      // يشتغل لما عدد البنود المختارة >= ده
  discountPercent Int      // 1..50
  isActive        Boolean  @default(true)
  isPublished     Boolean  @default(false) // نفس قاعدة النشر بتاعت Offering
  createdAt       DateTime @default(now())

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId, isActive])
}
```

### شكل العرض للعميل
| النموذج | العرض بالعربي |
|---------|----------------|
| `FIXED` | `12,000 ج` |
| `RANGE` | `12,000 – 18,000 ج` |
| `PER_UNIT` | `من 2,500 ج / م²` |
| `ON_INSPECTION` | `السعر يتحدد بعد المعاينة` (شارة مميزة) |

دالة تنسيق واحدة مشتركة `app/src/lib/pricing.ts → formatPrice(offering, locale)`
تستعملها كل الصفحات. أرقام عربية/إنجليزية حسب اللغة.

### الموافقة والواقعية
- كل تعديل بيمشي في `ChangeRequest` (شوف قاعدة النشر فوق) — العرض المنشور
  يفضل ظاهر طول فترة المراجعة.
- **مساعد الأدمن (مش قيد إلزامي) — لعروض `PER_UNIT` فقط:** في شاشة المراجعة
  اعرض جنب السعر المطلوب **مرجع الفئة** = الوسيط/الأدنى/الأعلى لعروض
  `PER_UNIT` المنشورة في نفس فئة الشركة **وبنفس الـ `PriceUnit` بالظبط**.
  علّم "⚠ بعيد عن متوسط الفئة" لو السعر خارج **‎±60%‎** من الوسيط.
  > 🔴 **ممنوع تعرض المؤشر لـ `FIXED` و `RANGE`.** دول `unit = null`، يعني
  > المقارنة الوحيدة المتاحة ليهم هي "نفس فئة الشركة" — وده بيحط "تشطيب شقة
  > كاملة" و"تركيب باب" في نفس السلة لأن الشركتين تحت فئة واحدة. الوسيط
  > الناتج بيقارن حاجات مالهاش علاقة ببعض، والتحذير هيولّع على أسعار سليمة.
  > `PER_UNIT` + وحدة متطابقة هي الحالة الوحيدة اللي فيها مقارنة ليها معنى
  > (٢٥٠٠ ج/م² مقابل ٢٦٠٠ ج/م² مقارنة حقيقية).
  > لباقي النماذج اعرض "المقارنة متاحة للأسعار بالوحدة بس".
  >
  > لو مازن عايز مؤشر لـ `FIXED`/`RANGE` كمان، ده محتاج تصنيف على `Offering`
  > نفسه (مش على الشركة) — وده **برّه نطاق المرحلة دي**، يترفع لمازن الأول.
  > 🟡 **شرط حجم العينة:** ماتعرضش المرجع ولا التحذير خالص لو عدد العروض
  > المطابِقة (فئة + وحدة) **أقل من ٥**. وسيط محسوب من عرضين مالوش أي معنى
  > إحصائي وهيضلل الأدمن أكتر ما هيساعده. اعرض بدلها "مفيش بيانات كافية
  > للمقارنة".
- **العملة:** الجنيه المصري فقط. مفيش عمود `currency` — إضافته دلوقتي عمود
  ميت، والمقارنات كلها بتفترض عملة واحدة أصلًا. لو احتجنا عملات بعدين تتضاف
  في migration مستقلة مع تعديل كل المقارنات.

### ⚠ استثناء صريح من القرار المتفق عليه رقم ٤

القرار ٤ بيقول "كل حاجة تستنى موافقة الأدمن". **`isActive` و `sortOrder`
مستثنيين** — البروفيدر يغيّرهم فورًا من غير مراجعة، حتى على عرض منشور.

**الاستثناء ده بيسري على التلات كيانات بنفس المنطق، من غير استثناءات تانية:**

| الكيان | الحقول الفورية |
|--------|----------------|
| `Offering` | `isActive` · `sortOrder` |
| `OfferingTier` | `sortOrder` (مفيش `isActive` — الشريحة تتحذف أو تتعدّل) |
| `BundleRule` | `isActive` (مفيش `sortOrder` في الموديل) |

نفس السبب في التلاتة: دول تحكّم تشغيلي وترتيب عرض، مابيغيّروش أي محتوى ولا
سعر. وعشان كده مش موجودين في `EDITABLE_FIELDS` بتاعت Feature A.

السبب: دول تحكّم تشغيلي مش محتوى. لو البروفيدر خلص مخزون أو لقى سعر غلط
بيوصله عملاء، لازم يقدر يخفي العرض **دلوقتي** — استنى الأدمن يومين وهو
بيستقبل طلبات على سعر غلط ده ضرر أكبر من أي مكسب رقابي.

القيود اللي بتخلي الاستثناء آمن:
- `isActive = false` بيخفي بس — **مابيغيّرش أي محتوى ولا سعر**.
- `isActive = true` تاني بترجّع **نفس** المحتوى المعتمد، مش نسخة جديدة.
- `sortOrder` ترتيب عرض وبس.
- الاتنين بيتسجلوا في `AuditLog` عشان تقدر تشوف حد بيخفي ويرجّع كتير.

أي حاجة غير الاتنين دول على صف منشور → `ChangeRequest`. من غير استثناءات
تانية، ولو ظهرت حاجة تبان "بسيطة" ارجع لمازن الأول.
- `priceUpdatedAt` بيتحدّث مع أي تغيير سعر. لو عدّى **90 يوم** اعرض على
  البروفايل "الأسعار محدّثة من X يوم" وبلّغ البروفيدر يراجعها.

### ترحيل البيانات القديمة
`Company.services String[]` موجودة ومستعملة في `CompanyProfile.tsx`،
`RequestForm.tsx`، و `WaitlistModal`. الخطة:
1. سكربت ترحيل (`api/prisma/migrations/.../backfill-offerings.ts` أو مهمة يدوية)
   بينشئ `Offering` واحد لكل نص في `services` بـ
   `pricingModel = ON_INSPECTION`, `isPublished = true`,
   `migratedFromService = <النص الأصلي>`.
   > 🟡 **idempotent عن طريق `migratedFromService` — مش عن طريق الاسم.**
   > `@@unique([companyId, name])` كان هيحل مشكلة السكربت، بس بيفرض قيد منتج
   > **دائم**: الشركة عمرها ما تقدر تعمل عرضين بنفس الاسم (مثلاً "تركيب" تحت
   > بندين مختلفين). ماينفعش تدفع تمن دائم لضرورة مؤقتة.
   > `@@unique([companyId, migratedFromService])` بيدي نفس الضمان بالظبط
   > و`upsert` عليه، من غير ما يقيّد أسماء العروض العادية.
   >
   > 🟡 **`Company.services` ممكن يكون فيها تكرار.** اعمل de-dup صريح
   > (`[...new Set(services)]`) **واطبع تحذير** بكل تكرار لقيته. من غير ده
   > `upsert` هيسقط التكرار بصمت وعدد العروض هيطلع أقل من عدد الخدمات، وما
   > حدش هيلاحظ غير لما البروفيدر يشتكي إن خدمة ناقصة.
   >
   > السكربت يطبع في الآخر: `أُنشئ N · تُخطّي M · تكرارات K`.
   > اختبره على اللوكال بتشغيلتين ورا بعض وتأكد إن النتيجة واحدة.
2. الواجهات تقرأ من `offerings` بدل `services`.
3. **سيب العمود `services`** في السكيما مؤقتًا (fallback) واحذفه في migration
   منفصلة بعد ما كل حاجة تشتغل.

### الـ Endpoints
| الطريقة | المسار |
|---------|--------|
| GET | `/api/companies/:slug` — يرجّع `offerings` المعتمدة النشطة فقط |
| GET/POST | `/api/provider/offerings` — POST بيعمل **مسودة** (`isPublished=false`) |
| PATCH/DELETE | `/api/provider/offerings/:id` — المسار حسب حالة الصف (جدول قاعدة النشر) |
| POST | `/api/provider/offerings/:id/publish` — بيعمل `ChangeRequest{PUBLISH}` |
| PATCH | `/api/provider/offerings/:id/visibility` — `isActive` / `sortOrder` فورًا (الاستثناء) |
| GET/POST/PATCH/DELETE | `/api/provider/offerings/:id/tiers[/:tierId]` — نفس القاعدة |
| GET/POST/PATCH/DELETE | `/api/provider/bundle-rules[/:id]` — نفس القاعدة |
| — | طابور المراجعة = `/api/admin/change-requests?entity=OFFERING` (Feature A) |
| ANY | `/api/admin/companies/:id/offerings` — الأدمن يعدّل مباشرة (منشور فورًا) |

> ⚠ **المرحلة دي كبيرة جدًا على ship واحد** (٣ موديلات + backfill +
> `CompanyProfile` + `ProviderDashboard` + `AdminDashboard`). قسّمها:
> - **B1 — الباك إند:** السكيما + migration + backfill + السيرفس + الـ
>   endpoints + دمج طابور المراجعة في شاشة Feature A. ship.
> - **B2 — الواجهات:** محرر العروض عند البروفيدر + كروت الأسعار على البروفايل
>   العام. ship.

ملفات جديدة: `api/src/lib/services/offerings.service.ts` +
`api/src/lib/validation/offerings.ts`.

### الفرونت إند
- `app/src/lib/offerings.ts` + `app/src/lib/pricing.ts` (تنسيق + حساب).
- `ProviderDashboard.tsx` — تبويب جديد **"الخدمات والأسعار"**: جدول بالعروض،
  محرر modal فيه اختيار النموذج، والشرائح، والوحدة، وصورة، وحالة المراجعة.
- `CompanyProfile.tsx` (سطر ~280) — قسم الخدمات يتحول لكروت فيها الاسم
  والوصف والسعر، مقسومة "خدمات" و"منتجات"، مع زر **"أضف للطلب"**.
- `AdminDashboard.tsx` — طابور مراجعة الأسعار + مؤشر مرجع الفئة.
- فلتر سعر في `Companies.tsx` و `ServiceCategory.tsx` (اختياري، مرحلة تانية).

### الاختبار
- عرض بـ `ON_INSPECTION` ما يقبلش أرقام أسعار (zod refine).
- `RANGE` لازم `priceMin <= priceMax` والاتنين موجودين.
- الشرائح ماتتداخلش في الكميات.
- عرض PENDING ما يظهرش في `/api/companies/:slug` العام.

---


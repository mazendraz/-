# المرحلة 2 — Feature A · البروفيدر يعدّل بروفايله بموافقة الأدمن

> **اقرأ [`README.md`](README.md) الأول** — فيه القرارات المتفق عليها والقواعد
> العامة وتشيك ليست الـ ship.

| | |
|---|---|
| **الاعتمادية** | [المرحلة 0](phase-0-admin-split.md) — شاشة المراجعة قسم جديد في `AdminDashboard` |
| **migration** | ✅ واحدة — `ChangeRequest` + الـ enums + partial unique index |
| **ship** | واحد |
| **الرجوع** | ارجع الكود. جدول `ChangeRequest` يفضل موجود وفاضي، مالوش أي تأثير |
| **بيعتمد عليها** | [المرحلة 3](phase-3-offerings.md) — بتستعمل **نفس** الموديل ونفس شاشة المراجعة |

---

بتبني بنية الموافقات اللي هيستعملها Feature B.

### الهدف
البروفيدر يتحكم في كل بيانات بروفايله، بس أي تعديل يروح طابور مراجعة عند
الأدمن ومايظهرش على الموقع قبل الموافقة.

### قاعدة البيانات

> ⚠ **الموديل ده عام عن قصد.** Feature B (الأسعار) و BundleRule هيستعملوا
> **نفس** الموديل ونفس شاشة المراجعة — مش نظام موافقة تاني. ده اللي بيخلي
> الاعتمادية `A → B` حقيقية، وبيمنع إن يبقى عندك نظامين موافقة بسلوك مختلف
> في نفس المنتج.

```prisma
enum ChangeRequestStatus { PENDING APPROVED REJECTED CANCELLED }
enum ChangeEntity       { COMPANY OFFERING OFFERING_TIER BUNDLE_RULE }
// مفيش CREATE: الصف بيتعمل دايمًا كمسودة (isPublished=false) الأول، فالـ id
// موجود قبل أي طلب. PUBLISH = انشر المسودة دي لأول مرة.
enum ChangeOperation    { PUBLISH UPDATE DELETE }

model ChangeRequest {
  id            String              @id @default(uuid())
  companyId     String              // دايمًا الشركة المالكة — عشان الفلترة والصلاحيات
  entity        ChangeEntity
  entityId      String              // إجباري. للـ COMPANY = companyId نفسه
  operation     ChangeOperation     @default(UPDATE)
  submittedById String              // User.id بتاع البروفيدر
  changes       Json                // الحقول المتغيرة بس: { field: newValue }
  snapshot      Json                // قيم نفس الحقول وقت الإرسال (للـ diff وكشف التعارض)
  note          String?             // رسالة البروفيدر للأدمن
  status        ChangeRequestStatus @default(PENDING)
  reviewedById  String?
  reviewedAt    DateTime?
  reviewNote    String?             // سبب الرفض — بيظهر للبروفيدر
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([status, createdAt])
  @@index([companyId, status])
  @@index([entity, entityId, status])
}
```
ضيف `changeRequests ChangeRequest[]` في `model Company`.

> 📛 **التسمية موحّدة على `changeRequest` في كل حتة** — الموديل عام لكل
> الكيانات مش للبروفايل بس، فأي اسم فيه `profile` غلط دلاليًا وهيلخبط. الأسماء
> المعتمدة: `api/src/lib/services/changeRequests.service.ts` ·
> `api/src/lib/validation/changeRequests.ts` ·
> `/api/provider/change-requests` · `/api/admin/change-requests` ·
> `app/src/lib/changeRequests.ts`. **مفيش** `profileRequests` ولا
> `profile-requests` في أي مكان.

> ⏱ **الكيانات اللي لسه ماتخلقتش (مهم للمرحلة 2).** `ChangeEntity` بيتخلق
> بقيمه الأربعة كاملة في migration المرحلة دي — قيم الـ enum في Postgres
> مجرد labels، فمفيش تكلفة ولا حاجة تستنى. اللي **مايتعملش** دلوقتي هو
> الـ dispatch: خريطة الكيان → موديل Prisma فيها `COMPANY` بس، وأي طلب على
> `OFFERING`/`OFFERING_TIER`/`BUNDLE_RULE` يرجّع `400 ENTITY_NOT_SUPPORTED`
> لحد المرحلة 3. نفس الكلام على `EDITABLE_FIELDS`: القوائم التلاتة مكتوبة
> تحت للمرجع، بس المرحلة 2 بتفعّل `COMPANY` بس. المرحلة 3 بتوصّل الباقي.

**قواعد:**
- طلب PENDING واحد بس لكل **(entity, entityId)** — مش لكل شركة. يعني البروفيدر
  يقدر يبقى عنده طلب على بروفايله وطلب على سعر خدمة في نفس الوقت، من غير ما
  يلغوا بعض.
  > 🔴 **القاعدة دي محتاجة قيد في قاعدة البيانات مش في الكود بس.** التحقق في
  > السيرفس لوحده معناه إن دبل كليك أو إعادة إرسال بيعملوا طلبين PENDING على
  > نفس الكيان. Prisma مابيعرفش يعبّر عن partial unique index، فاكتبه SQL خام
  > في ملف الـ migration:
  > ```sql
  > CREATE UNIQUE INDEX "change_request_one_pending"
  >   ON "ChangeRequest" (entity, "entityId")
  >   WHERE status = 'PENDING';
  > ```
  > (ده شغّال لأن `entityId` بقى إجباري — لو كان nullable كان Postgres هيعتبر
  > كل NULL مختلف والقيد مايشتغلش.) امسك خطأ التفرّد في السيرفس وحوّله لرسالة
  > مفهومة بدل 500.
- 🔴 **دمج مش استبدال.** لو في طلب PENDING على نفس الكيان وبعت تعديل جديد،
  الطلب الجديد بيبدأ من `changes` بتاع الطلب القديم ويعمل merge فوقه، والقديم
  يتحوّل `CANCELLED`.
  > ⚠ **الترتيب جوه الـ transaction مش اختياري: ألغِ القديم *ثم* أدخل الجديد.**
  > الـ partial unique index شرطه `status = 'PENDING'`، فلو أدخلت الجديد الأول
  > هتاخد unique violation على **كل** تعديل تاني — يعني الدمج ما يشتغلش خالص.
  > الترتيب الصح جوه `prisma.$transaction`:
  > ```ts
  > // 1) اقرأ الطلب المعلّق (لو موجود) — SELECT ... FOR UPDATE عبر الـ tx
  > // 2) UPDATE القديم → status = CANCELLED
  > // 3) INSERT الجديد بـ changes = { ...old.changes, ...new.changes }
  > ```
  > و`snapshot` بتاع الجديد بيتاخد من **القيم الحالية للصف**، مش من snapshot
  > القديم — عشان كشف التعارض يقيس من آخر لحظة فعلية.
  **ممنوع** استبدال أعمى — سيناريو "عدّل `phone` وبعت،
  بعدين عدّل `about` وبعت" لازم ينتهي بطلب فيه الاتنين، مش بضياع `phone` بصمت.
  في الـ UI اعرض للبروفيدر بوضوح: "طلبك المعلّق فيه ٣ تعديلات — التعديل ده
  هيتضاف ليهم".
- 🔴 **الطلب المعلّق لازم يموت مع الكيان بتاعه.** `ChangeRequest.entityId` مجرد
  نص — مفيش FK يشاور على الصف، فحذف الصف مابينضّفش الطلب. السيناريو: مسودة
  عليها PUBLISH معلّق، البروفيدر يحذفها حذف مباشر (مسموح)، الطلب يفضل PENDING
  بـ `entityId` مايشاورش على حاجة، الأدمن يفتح الطابور ويوافق → 500.
  **القاعدة:** أي حذف لصف كيان — مباشر (مسودة) أو بموافقة `DELETE` — بيلغي كل
  طلباته المعلّقة (`status = CANCELLED`, `reviewNote = "الكيان اتحذف"`) جوه
  **نفس** الـ transaction. وكمان: شاشة مراجعة الأدمن لازم تتعامل مع كيان
  مش موجود برسالة واضحة بدل ما ترمي. (حذف الشركة نفسها مغطّى بالـ Cascade
  على `companyId` — الناقص هو الكيانات التانية.)
  تست: امسح مسودة عليها PUBLISH معلّق → الطلب بقى CANCELLED والطابور فاضي.
- ⚠ **حد الموافقة الجزئية:** `fields[]` بتشتغل على مستوى الحقل كله. يعني
  `gallery` (مصفوفة صور) إما تتقبل كلها أو ترفض كلها — ماينفعش ترفض صورة
  واحدة. لو ده مهم لمازن، الحل هو تحويل `gallery` لموديل صفوف منفصل، وده
  **برّه نطاق المرحلة دي**. اكتبها كقيد معروف في الـ UI.

### 🔴 قوائم الحقول المسموحة — لكل كيان، مش للشركة بس

الموافقة معناها `prisma[entity].update({ data: changes })` و `changes` جاية من
البروفيدر. من غير allowlist **لكل كيان** ده mass-assignment: البروفيدر يبعت
`{ isPublished: true }` أو `{ companyId: "<شركة تانية>" }` ويعدّي.
المفارقة إن ده يحصل في الـ feature اللي وظيفتها الحماية.

```ts
// api/src/lib/services/changeRequests.service.ts
export const EDITABLE_FIELDS: Record<ChangeEntity, readonly string[]> = {
  COMPANY: [
    "name", "tagline", "about", "logo", "cover", "gallery",
    "phone", "whatsapp", "email", "location",
    "yearsExperience", "responseTime", "badges",
    "metaTitle", "metaDescription",
  ],
  OFFERING: [
    "name", "description", "kind", "pricingModel",
    "priceMin", "priceMax", "unit", "minQty", "image", "note",
  ],
  OFFERING_TIER: ["label", "qtyMin", "qtyMax", "priceMin", "priceMax"],
  BUNDLE_RULE: ["label", "minItems", "discountPercent"],
} as const;
```
> **`sortOrder` مش في `OFFERING_TIER` عن قصد** — هو ترتيب عرض زي `sortOrder`
> بتاع `Offering` بالظبط، فياخد نفس الاستثناء الفوري (شوف Feature B). ماكانش
> ليه معنى إن ترتيب العرض فوري وترتيب الشريحة يستنى الأدمن يومين.
- أي مفتاح في `changes` برّه قائمة كيانه → `ValidationError` **وقت الإرسال**،
  ومرة تانية **وقت الموافقة** (دفاع مزدوج — الطلب ممكن يكون اتخزّن قبل ما
  تتشدّد القائمة).
- **ممنوع نهائيًا** في كل الكيانات: `id`, `companyId`, `isPublished`,
  `createdAt`, `updatedAt`, `priceUpdatedAt`, وأي مفتاح علاقة.
- ممنوع كمان على `COMPANY`: `slug`, `categoryId`, `status`, `featured`,
  `verified`, `rating`, `reviewCount`, `ratingOverridden`, `completedProjects`,
  `verifiedSince`.
- اكتب تست بيبعت كل مفتاح ممنوع واحد واحد ويتأكد إنه بيترفض.

> `services` مش في القائمة عن قصد — هيتنقل لـ Offerings في Feature B.

### الـ Endpoints
| الطريقة | المسار | الوصف |
|---------|--------|-------|
| GET | `/api/provider/profile` | بيانات الشركة الحالية + الطلبات المعلّقة |
| POST | `/api/provider/change-requests` | إنشاء/دمج طلب معلّق |
| DELETE | `/api/provider/change-requests/:id` | البروفيدر يلغي طلبه |
| GET | `/api/admin/change-requests?entity=&status=PENDING&page=` | قائمة مقسّمة صفحات |
| GET | `/api/admin/change-requests/:id` | تفاصيل + diff |
| PATCH | `/api/admin/change-requests/:id` | `{ action: "approve"\|"reject", reviewNote?, fields?: string[] }` |

`fields` اختيارية → **موافقة جزئية** (يوافق على بعض الحقول ويرفض الباقي).

### منطق الخدمة
- **الرفع:** البروفيدر بيرفع الصور عبر `/api/provider/upload` الموجود، وبيحط
  الـ URL الناتج في `changes`. الصورة موجودة في التخزين قبل الموافقة — عادي.
- **الموافقة:** داخل transaction واحدة → طبّق الحقول على `Company` +
  `status = APPROVED` + سجّل في `AuditLog`
  (`action: "company.profile_change.approve"`) + بلّغ البروفيدر عبر
  `notifications.service` (push + telegram).
- **الرفض:** خزّن `reviewNote` وبلّغ البروفيدر.
- **كشف التعارض:** لو قيمة الحقل في `snapshot` مختلفة عن قيمته الحالية وقت
  المراجعة يبقى الأدمن غيّره بنفسه بعد الإرسال → علّم الحقل في الـ UI بـ
  "⚠ اتغيّر بعد الإرسال" وخلي الأدمن يقرر.
  > 🔴 **استعمل مقارنة عميقة، مش `!==`.** `gallery` و `badges` مصفوفات
  > (`String[]` في السكيما). `["a"] !== ["a"]` بيرجّع `true` دايمًا لأن
  > المقارنة بالمرجع — يعني كل مراجعة فيها معرض صور هتتعلّم "اتغيّر بعد
  > الإرسال" وهي ما اتغيرتش. الأدمن هيتعوّد يتجاهل التحذير خلال أسبوع،
  > وساعتها التحذير بقى ضوضاء بدل حماية وفقد قيمته خالص.
  > اكتب `deepEqual` صغيرة في `api/src/lib/utils/` (أو استعمل
  > `node:util.isDeepStrictEqual`) واعمل تست على مصفوفة بنفس المحتوى.
- بعد الموافقة نادِ `refreshCatalogFromApi()` في الفرونت (نفس نمط
  `availability.ts`).

### الفرونت إند
- `app/src/lib/changeRequests.ts` — موديول جديد بنمط `siteReviews.ts`.
- `app/src/pages/ProviderDashboard.tsx` — تبويب `profile` (سطر ~408) يتحوّل من
  عرض للقراءة فقط إلى **فورم كامل**:
  - بانر فوق: "طلبك تحت المراجعة" / "اتقبل" / "اترفض — السبب: ..." مع زر إلغاء.
  - وهو معلّق: الحقول تفضل قابلة للتعديل بس الحفظ بيستبدل الطلب.
  - عرض جنب كل حقل متغيّر: القيمة الحالية vs. الجديدة.
  - **احذف** النص "Profile information is managed by the Al Assema admin team"
    (سطر ~444).
- `app/src/pages/AdminDashboard.tsx` — قسم جديد "طلبات التعديل" مع badge بعدد
  المعلّق، وعرض diff جنب بعض (قبل / بعد) مع صور مصغّرة للصور، وأزرار
  موافقة/رفض/موافقة جزئية.

### الاختبار
- البروفيدر يبعت تعديل → البروفايل العام **ما يتغيرش**.
- الأدمن يوافق → يتغيّر + يظهر سطر في `AuditLog`.
- البروفيدر يحاول يبعت `verified: true` → 400.
- طلبين ورا بعض → واحد PENDING بس.

---


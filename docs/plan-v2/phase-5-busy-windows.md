# المرحلة 5 — Feature F · فترات الانشغال المجدولة

> **اقرأ [`README.md`](README.md) الأول** — فيه القرارات المتفق عليها والقواعد
> العامة وتشيك ليست الـ ship.

| | |
|---|---|
| **الاعتمادية** | مفيش — مستقلة تمامًا، تقدر تقدّمها لو حبيت |
| **migration** | ✅ واحدة — `BusyWindow` |
| **ship** | واحد |
| **الرجوع** | ارجع الكود → `isEffectivelyBusy` ترجع لـ `busy/busyUntil` بس |

---

الموجود حاليًا (`busy`, `busyUntil`, `busyNote`, قائمة الانتظار،
`AvailabilityControl.tsx`) شغّال — دي إضافة فوقه مش استبدال.

### قاعدة البيانات
```prisma
model BusyWindow {
  id             String    @id @default(uuid())
  companyId      String
  startsAt       DateTime
  endsAt         DateTime?          // null = مفتوح لحد ما يتلغي يدويًا
  note           String?            // "إجازة" · "مشروع كبير"
  createdByAdmin Boolean   @default(false)  // البروفيدر ما يقدرش يحذفها
  createdById    String?
  createdAt      DateTime  @default(now())

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId, startsAt])
}
```

### منطق "مشغول فعليًا"
وسّع `isEffectivelyBusy` في `api/src/lib/utils/serialize.ts:38`. توقيعها حاليًا
`(c: Pick<Company, "busy" | "busyUntil">)` ومستعملة في `serializeCompany`
(سطر ~182) — غيّرها لـ `(c, windows: BusyWindow[])`.
> 🟠 **بارامتر إجباري، من غير `= []`.** الديفولت الفاضي مش "بيخلي
> الاستدعاءات القديمة شغالة" — بيخليها **غلط بصمت**: أي مسار نسي يمرّر
> الفترات هيعرض شركة مشغولة على إنها متاحة، والعميل يبعت طلب لحد مش فاضي.
> خليه إجباري وسيب TypeScript يمسكلك كل الاستدعاءات وقت الـ build. غلطة
> صريحة أحسن من غلطة صامتة.
```
مشغول = (busy && (busyUntil == null || busyUntil > now))     // اليدوي الحالي
      || أي BusyWindow حيث startsAt <= now && (endsAt == null || endsAt > now)
```
**من غير cron** — كل حاجة بتتحسب وقت القراءة، زي التصميم الحالي بالظبط.

حقول جديدة في `ApiCompany` (الاتنين apiTypes):
```ts
nextAvailableAt?: number | null;   // نهاية الانشغال الحالي
upcomingBusyFrom?: number | null;  // أقرب فترة جاية (لعرض "مشغول من ٥ أغسطس")
busyReason?: string | null;
```
**مين بيجيب الـ windows؟** `serializeCompany` بتتنادى لكل شركة في
`GET /api/companies` (الواجهة بتطلب `pageSize=100`) — ده أسخن endpoint في
المشروع، فممنوع أي استعلام لكل شركة (N+1).

**الطريقة:** استعلام واحد إضافي للصفحة كلها، وتجميع في الذاكرة:
```ts
const now = new Date();
const windows = await prisma.busyWindow.findMany({
  where: {
    companyId: { in: companies.map((c) => c.id) },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],   // الجارية + الجاية بس
  },
  orderBy: { startsAt: "asc" },
});
const byCompany = Map<companyId, BusyWindow[]>;        // تجميع في الذاكرة
companies.map((c) => serializeCompany(c, byCompany.get(c.id) ?? []));
```
استعلام واحد ثابت مهما كان عدد الشركات، وبيجيب الفترات المستقبلية بس
(الفترات المنتهية ما لهاش أي لزوم). للشركة الواحدة (`/api/companies/:slug`)
`include` عادي بنفس شرط الـ `where` كفاية.

### الـ Endpoints
| الطريقة | المسار |
|---------|--------|
| GET/POST | `/api/provider/busy-windows` |
| PATCH/DELETE | `/api/provider/busy-windows/:id` (يرفض 403 لو `createdByAdmin`) |
| GET/POST | `/api/admin/companies/:id/busy-windows` |
| PATCH/DELETE | `/api/admin/companies/:id/busy-windows/:windowId` |

تحقق: `endsAt > startsAt`، `startsAt` مش في الماضي البعيد، ومنع التداخل
(overlap) بين الفترات لنفس الشركة.

> 🟠 **الفترة المفتوحة (`endsAt = null`) بتتعارض مع منع التداخل.** فترة مفتوحة
> واحدة معناها تداخل مع أي فترة جاية للأبد → البروفيدر ما يقدرش يجدول أي حاجة
> تاني. القاعدة الصريحة:
> - **فترة مفتوحة واحدة كحد أقصى** لكل شركة.
> - إنشاء فترة مفتوحة جديدة بيقفل القديمة (`endsAt = now`) بدل ما يرفض.
> - فحص التداخل بيتعامل مع `endsAt = null` كأنها `infinity`، وبيتخطّى
>   المقارنة مع الفترة المفتوحة القائمة لأنها هتتقفل.
> اكتب تست لكل حالة من التلاتة.

### الفرونت إند
- `app/src/lib/availability.ts` — ضيف دوال الفترات لنفس الموديول.
- `AvailabilityControl.tsx` — تحته قائمة "فترات مجدولة": كل صف تاريخ من/إلى +
  ملاحظة + تعديل/حذف، وزر "جدولة فترة". الفترات اللي عملها الأدمن تظهر بقفل.
- `CompanyProfile.tsx` — **شكل هادي مش مضايق**: شارة صغيرة جنب اسم الشركة
  `مشغول · يرجع ١٢ أغسطس` أو `متاح · بيرد خلال ساعتين`. لو مشغول، زر
  "انضم لقائمة الانتظار" (موجود) بدل "اطلب الخدمة". ولو في فترة جاية قريبة
  اعرض تلميح `مشغول من ٥ أغسطس` من غير ما تمنع الطلب.
- `Companies.tsx` / `ServiceCategory.tsx` — نقطة ملوّنة صغيرة على الكرت + فلتر
  "المتاحين دلوقتي".

### الاختبار
- فترة بدأت وما انتهتش → الشركة مشغولة، والـ CTA اتغير.
- عدّى وقت `endsAt` → الشركة رجعت متاحة **من غير أي job**.
- البروفيدر يحاول يحذف فترة أدمن → 403.
- فترات متداخلة → 400.

---


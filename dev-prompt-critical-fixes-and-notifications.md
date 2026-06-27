# برومبت للـ Fullstack Developer — Critical Fixes + Order Notifications

ده برومبت كامل جاهز تبعته للـ developer زي ما هو (أو تحطه في أداة AI coding agent). مقسّم Phase 1 (كريتيكال، لازم الأول) و Phase 2 (إشعارات الأوردر). كل بند فيه: المشكلة، الملفات المتأثرة، التفاصيل التقنية، ومعيار القبول (Acceptance) اللي بنتأكد بيه إن الإصلاح خلص فعلاً.

---

## Phase 1 — إصلاحات كريتيكال (قبل أي حاجة تانية)

### 1.1 — "Report a problem" مش بيوصل للأدمن خالص (الأخطر في المشروع)

**المشكلة:** `FeedbackModal` في `app/src/pages/CompanyProfile.tsx` بينده `addFeedback()` من `app/src/lib/feedback.ts`، والدالة دي بتكتب في `localStorage` فقط — مفيش أي `apiPost` ولا endpoint اسمه `feedback` في الباك إند خالص. يعني أي زائر يبعت شكوى/سؤال عن شركة، الرسالة بتفضل حبيسة في متصفحه بس، وتبويب "Feedback & Reports" في `/admin` (جزء من `AdminReviewsTab` في `AdminDashboard.tsx`) هيفضل فاضي تقريبًا في الإنتاج لأنه مش متربوط بمصدر حقيقي. ده عكس Site Reviews والـ Verified Reviews اللي شغالين صحيح بالـ API — يعني الـ pattern موجود في الكود، بس مطبّق غلط هنا.

**المطلوب (مطابقة لنفس pattern بتاع `site-reviews`/`leads`):**

1. **Schema** — في `api/prisma/schema.prisma` ضيف:
   ```prisma
   enum FeedbackType {
     PROBLEM
     SUGGESTION
     INQUIRY
   }

   model Feedback {
     id        String       @id @default(uuid())
     companyId String
     type      FeedbackType @default(PROBLEM)
     name      String?
     phone     String?
     message   String       @db.Text
     isRead    Boolean      @default(false)
     createdAt DateTime     @default(now())

     company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

     @@index([companyId])
     @@index([isRead])
     @@index([createdAt])
   }
   ```
   وضيف `feedbacks Feedback[]` في `model Company`. بعدها `npx prisma migrate dev --name add_feedback`.

2. **Validation** — `api/src/lib/validation/feedback.ts` (جديد):
   ```ts
   export const createFeedbackSchema = z.object({
     companySlug: z.string().trim().min(1),
     type: z.enum(["problem", "suggestion", "inquiry"]),
     name: sanitizedOptionalText(150),
     phone: z.string().trim().max(30).optional(),
     message: sanitizedOptionalText(2000), // required — تأكد إنها min(1) فعليًا
   });
   ```

3. **Service** — `api/src/lib/services/feedback.service.ts` (جديد): `create(payload)` (يحل `companyId` من `companySlug`، يرمي `NotFoundError` لو الشركة مش موجودة)، `listAll()`، `markRead(id, isRead)`، `remove(id)` — نفس بالظبط شكل `siteReviews.service.ts`.

4. **Routes:**
   - `POST /api/feedback` (عام) — اعمله بنفس شكل `api/src/app/api/leads/route.ts` بالظبط: `rateLimit` بالـ IP، honeypot field اسمه `website`، `verifyCaptcha`، parse بـ `createFeedbackSchema`.
   - `GET /api/admin/feedback` (`adminOnly`) — `listAll()`.
   - `PATCH /api/admin/feedback/[id]` (`adminOnly`) — تحديث `isRead`.
   - `DELETE /api/admin/feedback/[id]` (`adminOnly`) — حذف.

5. **Frontend** — `app/src/lib/feedback.ts`: اعمل rewrite كامل يطابق `app/src/lib/siteReviews.ts`:
   - `addFeedback()` يبقى `async`، وعند `isApiConfigured()` يبعت `apiPost("/feedback", {...})` ويرمي الإيرور لو فشل (مش fake success).
   - `hydrateFeedbackFromApi()` تتنده من جلسة الأدمن (`GET /admin/feedback`).
   - `markFeedbackRead` / `deleteFeedback` تتحول optimistic + `apiPatch`/`apiDelete` + reconcile-on-failure زي `setSiteReviewVisible`/`deleteSiteReview`.

6. **`CompanyProfile.tsx` → `FeedbackModal.handleSubmit`**: لازم يبقى `async`، يـ `await addFeedback(...)` جوه `try/catch`، ويعرض رسالة خطأ حقيقية لو فشل الإرسال (مش يفترض النجاح زي دلوقتي).

**Acceptance:** افتح صفحة شركة في متصفح تجريبي (incognito) منفصل تمامًا عن متصفح الأدمن، ابعت "Report a problem"، وتأكد إنها تظهر فورًا في `/admin` → Reviews → Feedback & Reports من غير أي مشاركة localStorage بين المتصفحين.

---

### 1.2 — أدوات Settings في `/admin` بتكتب على localStorage حتى في الإنتاج

**المشكلة:** في `SettingsTab` (`AdminDashboard.tsx`, تقريبًا سطر 1050-1096) أزرار "Load demo leads"، "Clear all leads"، "Export/Import JSON"، "Reset Catalog" — كل واحدة فيهم بترجع لدوال (`loadDemoLeads` في `app/src/lib/demo.ts`, `clearAllLeads` في `app/src/lib/requests.ts`, `resetCatalog`/`importCatalog` في `app/src/lib/catalog.ts`) بتكتب على `localStorage` **مباشرة من غير أي شرط `isApiConfigured()`**. في الإنتاج (لما `VITE_API_URL` مظبوط)، الأدمن لو دوس "Load demo leads" هيتحقن 48 lead وهمي في الكاش المحلي مختلط مع الحقيقي بدون أي علامة تميّزه، و"Clear all leads"/"Reset Catalog" هيبانوا نجحوا لكن الأثر بيتمسح أول ما الداتا تتحدّث من السيرفر (لأنها مش لمست الداتابيز الحقيقية أصلاً).

**المطلوب:** في `SettingsTab`، لف الكروت التلاتة دول ("Demo Data" / "Catalog Backup" / "Reset Catalog") بشرط:
```ts
if (!isApiConfigured()) {
  // اعرض الكروت زي ما هي دلوقتي (مفيدة في demo mode)
}
```
ولو `isApiConfigured()` تروح، اعرض بدلها سطر بسيط: "أدوات الديمو دي شغالة بس في وضع العرض التجريبي (من غير API) — في الإنتاج البيانات ده مصدرها الداتابيز الحقيقي."

**Acceptance:** على بناء فيه `VITE_API_URL` مظبوط، تبويب Settings ما يعرضش الكروت التلاتة دول (أو يعرضها معطّلة مع الرسالة)؛ في وضع الديمو المحلي (من غير `VITE_API_URL`) لازم يفضلوا شغالين زي ما هما.

---

### 1.3 — حقول "Rating" و "Reviews" في تعديل الشركة بتتجاهَل من السيرفر بصمت

**المشكلة:** في `CompanyEditor` (`AdminDashboard.tsx`, سطر 499-500) فيه حقلين `<input type="number">` لـ Rating و Reviews معمولين `bind` على `draft.rating`/`draft.reviewCount`، وبيتبعتوا فعليًا جوه `updateCompany(company.id, draft)`. لكن `upsertCompanySchema`/`updateCompanySchema` في `api/src/lib/validation/companies.ts` ما فيهومش حقل `rating` أو `reviewCount` خالص — يعني Zod بتشيلهم بصمت قبل ما يوصلوا للداتابيز. القيمة الحقيقية بتُحسب أوتوماتيك من جدول `Review` عن طريق `recompute()` في `reviews.service.ts`. النتيجة: الأدمن يحس إنه عدّل رقم وحفظه، بس التعديل ملوش أي تأثير خالص.

**المطلوب:** شيل الحقلين القابلين للتعديل دول من `CompanyEditor`، وعرّضهم كـ **read-only** بدل كده، مع تلميح صغير: "بيُحسب أوتوماتيك من تقييمات العملاء الحقيقية." (لو فيه حاجة فعلية محتاجة تتعدل يدوي زي قيمة ابتدائية لشركة جديدة بدون تقييمات، اتكلموا الأول قبل ما نضيفها كحقل حقيقي في الـ schema.)

**Acceptance:** فتح تعديل شركة، حقل Rating/Reviews يظهر للقراءة فقط بدون إمكانية كتابة، ومفيش أي زر "Save" يبعت قيم لـ rating/reviewCount.

---

### 1.4 — (Bonus، أولوية أقل) فورم "تابع طلبك" من جهاز تاني

**المشكلة:** تتبّع الطلب (`MyRequests.tsx`) بيعتمد بالكامل على `localStorage` لمعرفة "طلباتي". الـ endpoint العام `/api/leads/track?ref=&phone=` موجود وشغال (`trackByRefAndPhone` في `leads.service.ts`)، بس مفيش أي فورم في الفرونت إند بيستخدمه يدوي — يعني عميل غيّر متصفح أو مسح الداتا خسر القدرة يتابع طلبه للأبد.

**المطلوب:** فورم بسيط (ولو جوه `MyRequests.tsx` نفسها كـ "Track a request from another device") فيه حقلين: رقم المرجع + رقم التليفون، يندّي `trackLead`/الـ endpoint، ولو نجح يضيف الـ lead لقايمة "My Requests" المحلية (`rememberMyRequest`).

**Acceptance:** من متصفح تاني (من غير localStorage الأصلي)، أدخل ref+phone صحيحين، ويظهر الطلب في "My Requests".

---

## Phase 2 — إشعار عند أوردر جديد (Admin + Provider)

### الوضع الحالي (للسياق)
البروفيدر دلوقتي بياخد إيميل أوتوماتيك مع كل lead جديد (`notifyNewLead` في `notifications.service.ts`, بتتنده من `leads.service.ts` سطر 87). **الأدمن مفيش له أي إشعار خالص حاليًا** — لازم يفتح `/admin` يدوي ويشوف. ده الفجوة الحقيقية المطلوب نقفلها.

### 2.1 — إيميل للأدمن (نفس فلسفة fail-open بتاعة البروفيدر)

**المطلوب:**
1. في `api/src/lib/services/leads.service.ts` → `create()`: بعد استدعاء `notifyNewLead(...)` (سطر 87)، ضيف استدعاء جديد لإشعار كل الأدمنز:
   ```ts
   const admins = await prisma.user.findMany({
     where: { role: "ADMIN", isActive: true },
     select: { email: true },
   });
   void notifyAdmins(serialized, company.name, admins.map(a => a.email));
   ```
2. في `notifications.service.ts` ضيف `buildAdminAlertEmail()` و `notifyAdmins(lead, companyName, adminEmails)` — نفس شكل `buildNewLeadEmail`/`notifyNewLead` بالظبط (fail-open، ما يرميش error، يبعت إيميل واحد منفصل لكل أدمن أو batch واحد بـ `to` متعدد لو Resend بيدعمها).
3. العنوان مثلاً: `New lead — {companyName} — {refNumber}`.

**ليه عن طريق جدول `User` ومش env var ثابت؟** لأنه أتوماتيك يتابع نفس قايمة الأدمنز الموجودة في تبويب Team — مفيش حاجة تتحدّث لو زاد/قلّ عدد الأدمنز.

**Acceptance:** قدّم lead جديد (من فورم الطلب)، وتأكد إن إيميل بيوصل لكل مستخدم `ADMIN` فعّال، بالتوازي مع إيميل البروفيدر الموجود.

### 2.2 — (اختياري، تحسين تجربة) العداد في الشريط الجانبي يتحدث لوحده

**الوضع الحالي:** فيه بادچ عداد "New leads" جنب تبويب Leads في الشريط الجانبي (`SidebarBody`، بيتحسب من `newCount`)، بس بيتحدث بس لما تعمل refresh يدوي أو تتنقل بين الصفحات — مفيش polling.

**المطلوب (لو الوقت سمح):** `setInterval` بسيط (كل 30-60 ثانية) في `AdminDashboard.tsx`/`ProviderDashboard.tsx` يندّي `hydrateLeadsFromApi()` تلقائي طول ما الداشبورد مفتوح، وممكن تضيف toast صغير أو صوت تنبيه لو العدد زاد. ده بيخلي الأدمن/البروفيدر يلاحظوا أوردر جديد من غير ما يحتاجوا يعملوا refresh بنفسهم — وده الجزء اللي يخلي الموضوع "أسهل علينا" فعليًا بدل ما يبقى إيميل بس.

**Acceptance:** سيب الداشبورد مفتوح، خلي حد يبعت lead جديد من تاب تاني، وتأكد إن العداد بيزيد من غير ريفرش يدوي خلال ≤ 60 ثانية.

---

## ملاحظات عامة للتنفيذ
- شغّل `npx prisma migrate dev --name add_feedback` محليًا الأول، وبعدين `npx prisma migrate deploy` في الإنتاج (زي أي migration تانية).
- بعد الـ Phase 1، حدّث `api/.env.example` لو ضفت أي متغير بيئة جديد (مش متوقع في الخطة دي لأن استخدمنا جدول `User` الموجود بدل env var).
- رتّب التنفيذ: 1.1 → 1.2 → 1.3 → 2.1 (أولوية)، وبعدين 1.4 → 2.2 لو فيه وقت.

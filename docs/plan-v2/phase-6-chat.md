# المرحلة 6 — Feature E · الشات بين العميل والبروفيدر

> **اقرأ [`README.md`](README.md) الأول** — فيه القرارات المتفق عليها والقواعد
> العامة وتشيك ليست الـ ship.

| | |
|---|---|
| **الاعتمادية** | مفيش — مستقلة، بس **الأكبر** فاعملها آخر حاجة وبمفردها |
| **migration** | ✅ واحدة — `Conversation` + `Message` + `MessageSender` |
| **ship** | واحد |
| **الرجوع** | ارجع الكود. المحادثات تفضل محفوظة |

---

الأكبر. اعملها آخر حاجة وبمفردها.

### الهدف
محادثة مربوطة بكل طلب. العميل يدخلها **من غير تسجيل** برقم الطلب +
`trackingToken` (نفس بوابة التتبع الحالية). الأدمن يقرأ كل المحادثات ويقدر يتدخل.

### قاعدة البيانات
```prisma
enum MessageSender { CUSTOMER PROVIDER ADMIN }

model Conversation {
  id             String    @id @default(uuid())
  leadId         String    @unique
  companyId      String
  lastMessageAt  DateTime?
  customerUnread Int       @default(0)
  providerUnread Int       @default(0)
  closed         Boolean   @default(false)
  createdAt      DateTime  @default(now())

  lead     Lead      @relation(fields: [leadId], references: [id], onDelete: Cascade)
  company  Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  messages Message[]

  @@index([companyId, lastMessageAt])
  @@index([lastMessageAt])
}

model Message {
  id             String        @id @default(uuid())
  conversationId String
  sender         MessageSender
  senderUserId   String?       // للبروفيدر/الأدمن
  body           String        @db.Text
  attachment     String?       // URL من upload.service
  hidden         Boolean       @default(false)  // إخفاء إداري
  createdAt      DateTime      @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}
```
المحادثة بتتعمل **تلقائيًا** مع إنشاء الـ Lead (في `leads.service.ts`).

> 🔴 **الطلبات الموجودة قبل المرحلة دي مالهاش محادثات — لازم `getOrCreate`.**
> ربط الإنشاء بـ `leads.service.ts` بس معناه إن كل عميل عنده طلب قديم هيفتح
> الشات ويلاقي 404. وده مش عدد صغير — ده **كل** الطلبات لحد يوم النشر.
>
> **الحل:** مفيش backfill migration. اعمل
> `getOrCreateConversation(leadId)` في `chat.service.ts` وخلّي **كل** مسارات
> القراءة (العميل، البروفيدر، الأدمن) تعدّي عليها. الصف بيتخلق أول مرة حد
> يفتح المحادثة فعلًا، فمفيش صفوف فاضية لطلبات محدش هيكلّم فيها.
> `leadId` عليه `@unique` فالـ `upsert` آمن ضد التزامن.
>
> قايمة محادثات البروفيدر (`GET /api/provider/chat`) بتقرا من `Conversation`،
> يعني الطلبات القديمة مش هتظهر فيها قبل ما تتفتح. ده مقبول: البروفيدر بيوصلها
> من صفحة الطلبات، والقايمة دي للمحادثات النشطة.
>
> تست: طلب اتعمل قبل الـ migration → فتح الشات بيشتغل ومابيرجّعش 404.

### الصلاحيات — أهم جزء
1. **العميل:** ملف مساعد جديد `api/src/lib/middleware/customerGuard.ts` بيحل
   الـ lead من `?ref=<refNumber>` + هيدر `X-Lead-Token: <trackingToken>`.
   **التوكن في الهيدر من أول سطر** — مش في الـ query (شوف القاعدة الحمرا تحت).
   **ماتكتبش المنطق من الأول** — استعمل الدوال الموجودة في
   `api/src/lib/services/leads.service.ts`: `leadSecretMatches()` (مقارنة
   ثابتة الزمن + fallback لآخر أرقام التليفون للطلبات القديمة) و
   `trackByRefAndSecret()`. ولو الرقم غلط أو التوكن غلط → **نفس الـ 404**
   بالظبط، عشان ما نكشفش أنهي أرقام طلبات موجودة (نفس تعليق الأمان الموجود
   في الملف).
2. **البروفيدر:** `providerOnly` + تأكيد `conversation.companyId === user.companyId`.
3. **الأدمن:** `adminOnly` — يقرأ الكل، ويقدر يبعت كـ `ADMIN` (بيظهر للطرفين
   بعلامة "إدارة العاصمة")، ويقدر يخفي رسالة.

### الـ Endpoints
| الطريقة | المسار | مين |
|---------|--------|-----|
| GET | `/api/chat?ref=&after=` · التوكن في هيدر `X-Lead-Token` | العميل |
| POST | `/api/chat?ref=` · التوكن في هيدر `X-Lead-Token` | العميل |
| GET | `/api/provider/chat` | قائمة محادثات البروفيدر |
| GET/POST | `/api/provider/chat/:conversationId[?after=]` | البروفيدر |
| GET | `/api/admin/chat?companyId=&q=&page=` | الأدمن — كل المحادثات |
| GET/POST | `/api/admin/chat/:conversationId` | الأدمن — قراءة + تدخل |
| PATCH | `/api/admin/chat/:conversationId/messages/:messageId` | `{ hidden: true }` |
| PATCH | `/api/admin/chat/:conversationId` | `{ closed: true }` |

**النقل:** polling بسيط. `?after=<epoch ms>` يرجّع الجديد بس. كل **8 ثواني** وقت
ما التبويب ظاهر، ويقف مع `document.hidden` (استعمل `visibilitychange`).
SSE/WebSocket مرحلة تانية لو الحمل زاد — **ماتعملهاش دلوقتي**.

> 🟡 **الحمل حقيقي.** كل عميل مفتوح عنده الشات + كل بروفيدر = طلب كل ٨ ثواني
> على VPS واحد. التخفيف بالترتيب الصح:
> 1. **الـ backoff هو التخفيف الحقيقي:** ٨ ثواني وقت النشاط، يزيد لـ ٣٠ ثانية
>    بعد دقيقتين سكوت، ويرجع ٨ فور أي إرسال. ده اللي بيقلل عدد الطلبات فعلًا.
> 2. `ETag` من `lastMessageAt` + رد **304**. تصحيح: ده **مابيوفرش الاستعلام** —
>    لازم تستعلم الـ `Conversation` الأول عشان تحسب الـ ETag. اللي بيتوفر هو
>    استعلام الرسايل + النقل، وده مكسب معقول بس مش هو الحل الأساسي.
> 3. `rateLimit` على الـ GET كمان، مش على الـ POST بس.

> 🔴 **التوكن في هيدر `X-Lead-Token` — مش في الـ query string.**
> ده **مش** نفس تعرّض بوابة التتبع الحالية زي ما ممكن يبان: التتبع بيسجّل
> التوكن في لوجات Caddy **مرة واحدة**؛ شات بيعمل poll كل ٨ ثواني بيسجّله
> **مئات المرات لكل محادثة**. الفرق تضخيم حقيقي في مساحة التعرّض — دورة
> اللوجات، النسخ الاحتياطية، وأي حد عنده صلاحية قراءة اللوج.
> التكلفة سطرين وقت ما تكتب `customerGuard.ts` من الأصل. أرخص بكتير من
> نقله بعد ما يشتغل.

**الحماية:** استعمل `rateLimit.ts` (مثلاً 20 رسالة/دقيقة للعميل)،
`bodyLimit.ts`، و `sanitize.ts` الموجودين. حد أقصى 2000 حرف للرسالة.

**الإشعارات:** `notifications.service.ts` — رسالة جديدة من العميل → push +
telegram للبروفيدر. لا ترسل إشعار لكل رسالة: اعمل تجميع (debounce) 60 ثانية.

### الفرونت إند
- `app/src/lib/chat.ts` — العميل والبروفيدر والأدمن، نفس نمط الموديولات.
- `app/src/components/ChatThread.tsx` — مكوّن مشترك (فقاعات، تاريخ، حالة
  الإرسال، مؤشر "بيكتب" اختياري، تمرير تلقائي، RTL).
- `app/src/pages/MyRequests.tsx` — زر "محادثة" في كل طلب + نقطة حمراء للرسائل
  غير المقروءة. **الزر بيروح لصفحة شات مستقلة، مش accordion جوه نفس الكارت**
  (شوف "🔴 تصحيح — الشات لازم يبقى صفحة مستقلة" تحت — النسخة الأولى اللي
  اتنفذت كانت inline والمفروض تتصحح).
- `ProviderDashboard.tsx` — تبويب "الرسائل" (قائمة + محادثة).
- `AdminDashboard.tsx` — قسم "المحادثات": بحث بالشركة/رقم الطلب، مؤشرات، فتح
  المحادثة للقراءة + زر "تدخّل كإدارة" + إخفاء رسالة.

### 🔴 تصحيح — الشات لازم يبقى صفحة مستقلة، مش inline

**المشكلة:** النسخة اللي اتنفذت فتحت `ChatThread` كـ accordion صغير
(`h-80`) تحت نفس كارت الطلب في `MyRequests.tsx` — العميل بيدوس "محادثة مع
الشركة" وبتتفتح مساحة صغيرة وسط تفاصيل الطلب. ده مش تجربة محادثة حقيقية —
مفيش تركيز، ومفيش حس إنك "دخلت شات"، والمساحة صغيرة على الموبايل خاصة.

**الحل:** راوت مستقل `/requests/:refNumber/chat` في `app/src/main.tsx`
(lazy-loaded زي باقي الراوتات)، وصفحة جديدة `app/src/pages/RequestChat.tsx`
بتاخد `ChatThread` كامل الشاشة (هيدر فيه اسم الشركة ورقم الطلب + زر رجوع).

**التوكن يتحل من `refNumber` بس، مش من الرابط.** `useMyLeads()`
(`app/src/lib/requests.ts:354`) بيقرا من `localStorage` وبيرجّع الطلبات
بتوكناتها كاملة — هي نفسها اللي `MyRequests.tsx` شغّالة بيها دلوقتي. يعني:
```
1. المستخدم يدوس "محادثة" في MyRequests.tsx → navigate(`/requests/${lead.refNumber}/chat`)
2. RequestChat.tsx بيدوّر على refNumber في نتيجة useMyLeads() (نفس الهوك)
   ويطلع منها { refNumber, trackingToken, phone, companyName }
3. لو الطلب مش موجود في localStorage الجهاز ده (رابط اتبعت لجهاز تاني، أو
   الكاش اتمسح) → صفحة "الطلب مش موجود على الجهاز ده" + زر رجوع لـ /requests
   — من غير أي محاولة تحل التوكن من الـ URL.
```
كده **التوكن ما بيدخلش الـ URL خالص** — لا كـ query ولا كـ path segment —
متسق مع قرار `X-Lead-Token` في الهيدر بتاع بوابة العميل. تحديث الصفحة (F5)
شغّال عادي لأن المصدر `localStorage` مش حالة تنقّل مؤقتة.

**التغييرات:**
- `app/src/main.tsx` — راوت جديد `{ path: "/requests/:refNumber/chat", element: <RequestChat /> }`.
- `app/src/pages/RequestChat.tsx` — صفحة جديدة، مش تعديل في `MyRequests.tsx`.
- `app/src/pages/MyRequests.tsx` — الزر يستبدل بـ `<Link to={...}>` بدل ما
  يفتح/يقفل accordion. احذف حالة `chatting` والعرض الـ inline بالكامل.
- `ChatThread.tsx` نفسه **ما يتغيّرش** — نفس المكوّن، مكان استخدامه بس اتغيّر.

### قرار سياسة (اسأل مازن لو اختلف رأيه)
مافيش حجب لأرقام التليفونات في الرسائل — المنصة أصلًا نموذج lead-generation
والتواصل بره المنصة متوقع.

### الاختبار
- توكن غلط → 404.
- بروفيدر يحاول يفتح محادثة شركة تانية → 403.
- `?after=` يرجّع الجديد بس.
- رسالة مخفية ما تظهرش للعميل ولا البروفيدر، بتفضل ظاهرة للأدمن.
- Rate limit شغّال.

---


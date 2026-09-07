# تقرير فحص تطبيق الموظفين (`mobile/business`) — 2026-09-06

> فحص على محاكي أندرويد حقيقي (`alassema_test`، API 35، 1080×2400 @420dpi)
> مقابل باك إند محلي (`localhost:3000`) وقاعدة بيانات محلية
> (`postgresql://postgres:***@localhost:5433/alassema` — اتأكدت منها قبل أي أمر).
>
> **مفيش سطر كود اتغيّر. مفيش رفع. مفيش `eas`.**
> اللي اتغيّر: `deliverables/_qa-business/` بس + تعديلين مؤقتين على **داتا محلية**
> اترجّعوا لحالتهم الأصلية (تفاصيلهم في القسم «هـ»).

**الأرقام:** 456 ريكوست في `api-server.log` · 83 سكرينشوت في `screens/` ·
~55 شاشة مختلفة · 38 ريكوست رجع 403.

---

## أ. الملخص التنفيذي

التطبيق **أحسن بكتير مما توقعت**. مفيش ولا شاشة واحدة بتعرض داتا وهمية: عملت grep
على `mock|dummy|sample|TODO|placeholder` في `app/` كلها — **صفر نتيجة**، وكل شاشة
بتستورد lib حقيقي وبتنادي endpoint حقيقي. مفيش كراش، مفيش شاشة بيضا، ومفيش أي
حاجة قربت من قاعدة بيانات الإنتاج. الحالات الأربعة (تحميل/فاضي/خطأ/داتا) متطبقة
عبر `ListStates` في **كل** شاشة فيها ليستة من غير استثناء، والبوابات
(`PermissionGate`) موجودة على 10 من 10 شاشات Control Center.

بس فيه تلات حاجات خطيرة:

1. **البروفيدر يقدر يفتح شاشات الأدمن ويشوف `Requires ADMIN role` بالإنجليزي.**
   أكّدتها على **8 شاشات**. الشاشات دي بره مجموعة `(admin)` فمفيش حاجة بتحجبها،
   والسيرفر بيرفض صح (مفيش تسريب داتا) — بس اللي بيظهر رسالة سيرفر خام، وده انتهاك
   مباشر لعقد الشاشات الموثّق في `docs/architecture/business-app/README.md`
   (`403 → ليس لديك صلاحية`).

2. **كل رسائل الخطأ اللي جاية من السيرفر إنجليزية.** عدّيت رسائل الأخطاء في
   `api/src`: **259 رسالة إنجليزية، صفر عربية**. والتطبيق بيعرضها حرفيًا في
   30+ موضع (`err instanceof ApiError ? err.message : "..."`). أول اصطدام لأي
   موظف: باسورد غلط → **"Invalid email or password"**.

3. **مستحيل تبني التطبيق ده نيتف على الجهاز ده.** مش عيب في الكود — مسار الريبو
   `F:\العاصمة` عربي، وسلسلة NDK/CMake بتتعامل معاه بترميز CP1256 فبتفشل. جرّبت
   3 حلول وكلها فشلت (تفاصيل في «هـ»). النتيجة العملية: **الحاجة الوحيدة اللي
   الفحص ده كان المفروض يأكّدها — هجرة `rowStart` — هي بالظبط الحاجة اللي البيئة
   دي مش قادرة تأكّدها.**

**هل جاهز يتعرض على حد؟** آه، لو العرض على أدمن. الشاشات المصقولة (الرئيسية،
الطلبات، الموافقات، Control Center) شكلها احترافي وداتاها حقيقية. **لأ** لو
العرض هيشمل بروفيدر بيتنقل بحرية، أو لو حد هيكتب باسورد غلط قدام الناس.

---

## ب. جدول التغطية

الأعمدة: الشاشة · الدور · ملف السكرين (في `screens/`) · الـ endpoints من اللوج · الربط · ملاحظات

### قبل الدخول

| الشاشة | الدور | السكرين | Endpoints (من اللوج) | الربط | ملاحظات UI |
|---|---|---|---|---|---|
| `sign-in` | — | `signin.png` | — | ✅ | عربي، محاذاة صح، زرار معطّل واضح |
| `sign-in` (باسورد غلط) | — | `signin-wrong-password.png` | `POST /auth/login 401` | ⚠️ | **الرسالة إنجليزية** — P0-2 |
| `index` (توجيه) | كلاهما | — | `GET /auth/me 200` | ✅ | التوجيه حسب الدور شغّال في الاتجاهين |

### بحساب البروفيدر (`e2e-provider@local.test`)

| الشاشة | السكرين | Endpoints | الربط | ملاحظات |
|---|---|---|---|---|
| `(provider)/overview` | `provider-overview.png` | `provider/stats 200`, `provider/leads?pageSize=5 200`, `provider/profile 200` | ✅ | داتا حقيقية (29/13/12 + 14%▲). كارت الشركة فيه **الاسم عربي والتصنيف إنجليزي** — P2-9 |
| `(provider)/leads` | `provider-leads.png` | `provider/leads?page=1&pageSize=20 200` | ✅ | شرائح الفلاتر شغّالة، شارات الحالة بألوان متمايزة |
| `(provider)/messages` | `provider-messages.png` | `provider/chat?page=1&pageSize=20 200` | ✅ | — |
| `(provider)/more` | `provider-more.png` | `notifications/unread-count 200` | ✅ | 4 مجموعات، كل صف ليه وجهة |
| `lead/[id]` | `provider-lead-detail.png` | `provider/leads/{id} 200` | ✅ | — |
| `lead/[id]/complete` | `provider-lead-complete.png` | `provider/leads/{id} 200` | ✅ | أزرار التبديل 40dp — P2-8 |
| `chat/[id]` | `provider-chat.png` | `provider/chat/{id} 200` | ✅ | فقاعات «بتاعتي/بتاعتهم» متفرّقة صح في الكود (`MessageBubble:79-80`) |
| `offerings` | `provider-offerings.png` | `provider/offerings 200` | ✅ | — |
| `offering/[id]` | `provider-offering-detail.png` | `provider/offerings 200` | ✅ | بيجيب القائمة كلها ويدوّر — P1-2 |
| `projects` | `provider-projects.png` | `provider/projects 200` | ✅ | — |
| `availability` | `provider-availability.png` | `provider/busy-windows 200`, `provider/profile 200` | ✅ | — |
| `profile` | `provider-profile.png` | `provider/profile 200` | ✅ | — |
| `analytics` | `provider-analytics.png` | `provider/stats?days=30&months=6&deltaDays=30 200` | ✅ | **أرقام عربية في الشرائح ولاتينية في كل حاجة تانية** — P2-3 |
| `waitlist` | `provider-waitlist.png` | `provider/waitlist?pageSize=100 200` | ✅ | — |
| `bundle-rules` | `provider-bundle-rules.png` | `provider/bundle-rules 200` | ✅ | — |
| `notifications` | `provider-notifications.png` | `notifications 200`, `unread-count 200` | ✅ | — |
| `sessions` | `provider-sessions.png` | `auth/sessions 200` | ✅ | — |
| `search` | `provider-search.png` | — | ⚠️ | مفيش نداء لحد ما تكتب — بس اللي وراه `adminSearch` فهيضرب 403 |
| **`settings/index`** | `provider-settings.png` | `admin/settings` **403** | 🔴 | **P0-1** — «Requires ADMIN role» بالإنجليزي |
| **`settings/notifications`** | `provider-settings-notifs.png` | `admin/notification-settings` **403** | 🔴 | **P0-1** |
| **`categories`** | `provider-categories.png` | `admin/categories` **403** + 5 نداءات طوابير | 🔴 | **P0-1** |
| **`team`** | `provider-team.png` | `admin/users` **403** | 🔴 | **P0-1** |
| **`audit-log`** | `provider-audit-log.png` | `admin/audit-logs` **403** | 🔴 | **P0-1** |
| **`platform-waitlist`** | `provider-platform-waitlist.png` | `admin/waitlist` **403** | 🔴 | **P0-1** |
| **`content/pages`** | `provider-content-pages.png` | `admin/pages` **403** | 🔴 | **P0-1** |
| **`company/[id]`** | `provider-company-detail.png` | `admin/companies?pageSize=100` **403**, `admin/categories` **403** | 🔴 | **P0-1** |

### بحساب الأدمن (`e2e-admin@local.test`)

| الشاشة | السكرين | Endpoints | الربط | ملاحظات |
|---|---|---|---|---|
| `(admin)/overview` | `admin-overview.png` | `admin/stats 200`, `admin/leads?pageSize=5 200`, `admin/maintenance 200` | ✅ | 37/19/13/4-4/6 مطابقة للداتابيز. رسم بياني سليم |
| `(admin)/leads` | `admin-leads.png` | `admin/leads?page=1&pageSize=20 200` | ✅ | — |
| `(admin)/approvals` | `admin-approvals.png` | 5 طوابير كلها 200 | ✅ | **الـ badge = 5 وهو صح** (4 تقييمات + 1 رأي موقع، اتأكدت بالحساب) |
| `(admin)/messages` | `admin-messages.png` | `admin/chat?page=1&pageSize=20 200` | ✅ | — |
| `(admin)/companies` | `admin-companies.png` | `admin/companies?page=1&pageSize=20 200` | ✅ | — |
| `(admin)/more` | `admin-more.png` | `notifications/unread-count 200` | ✅ | «لوحة التحكم» بتظهر/تختفي حسب الصلاحيات فعليًا ✅ |
| `lead/[id]` | `admin-lead-detail.png` | `admin/leads/{id} 200` | ✅ | راوت B6 موجود وشغّال |
| `chat/[id]` | `admin-chat.png` | `admin/chat/{id} 200` | ✅ | — |
| `approvals/review/[id]` | `admin-approval-review.png` | `admin/reviews?status=pending&pageSize=100 200` | ✅ | نفس نمط «هات القائمة ودوّر» — P1-2 |
| `approvals/site-review/[id]` | `admin-approval-sitereview.png` | `admin/site-reviews?pageSize=100 200` | ✅ | شريط إجراءات نضيف |
| `company/[id]` | `admin-company-detail.png` | `admin/companies?pageSize=100 200`, `admin/categories 200` | ✅ | — |
| `company/[id]/offerings` | `admin-company-offerings.png` | `admin/companies/{id}/offerings 200` | ✅ | — |
| `company/[id]/projects` | `admin-company-projects.png` | `admin/companies/{id}/projects 200` | ✅ | — |
| `company/[id]/reviews` | `admin-company-reviews.png` | `admin/companies?pageSize=100 200` | ✅ | التقييمات جاية جوّه كائن الشركة (مش نداء منفصل) — سلوك مقصود وموثّق |
| `company/[id]/availability` | `admin-company-availability.png` | `admin/companies/{id}/busy-windows 200` | ✅ | — |
| `company/[id]/status` | `admin-company-status.png` | `admin/companies?pageSize=100 200` | ✅ | الحالة مشتقّة من كائن الشركة |
| `company/[id]/waitlist` | `admin-company-waitlist.png` | `admin/companies/{id}/waitlist?pageSize=100 200` | ✅ | — |
| `company/new` | `admin-company-new.png` | `admin/categories 200` | ✅ | — |
| `categories` | `admin-categories.png` | `admin/categories 200` | ✅ | أسماء التصنيفات إنجليزية (بس ده سلوك المنتج كله — شوف «د») |
| `team/index` | `admin-team.png` | `admin/users?page=1&pageSize=30 200` | ✅ | **شارة «أدمن» تباينها 3.05:1** — P2-2 |
| `platform-waitlist` | `admin-platform-waitlist.png` | `admin/waitlist?page=1&pageSize=30 200` | ✅ | — |
| `audit-log` | `admin-audit-log.png` | `admin/audit-logs?page=1&pageSize=40 200` | ✅ | — |
| `sessions` | `admin-sessions.png` | `auth/sessions 200` | ✅ | — |
| `content/pages` | `admin-content-pages.png` | `admin/pages 200` | ✅ | — |
| `content/email-templates` | `admin-content-email.png` | `admin/email-templates 200` | ✅ | — |
| `settings/index` | `admin-settings.png` | `admin/settings 200` | ✅ | — |
| `settings/maintenance` | `admin-settings-maintenance.png` | `admin/maintenance 200` | ✅ | — |
| `settings/telegram` | `admin-settings-telegram.png` | `admin/telegram 200` | ✅ | — |
| `notifications` | `admin-notifications.png` | `notifications 200` | ✅ | — |

### Control Center (الأدمن) — الحالتين

| الشاشة | بدون صلاحيات | بكل الصلاحيات | الربط |
|---|---|---|---|
| `control/index` | `admin-control-hub.png` — «مفيش صلاحيات ممنوحة» | `ctrl-hub.png` — 7 وحدات | ✅ |
| `control/overview` | `admin-control-overview.png` — بوابة صح، **بس بعت `desktop/overview` وأخد 403** | `ctrl-overview.png` — داتا كاملة 200 | ✅ / P2-1 |
| `control/operations` | بوابة صح + **2×403** | `ctrl-operations.png` — 200 | ✅ / P2-1 |
| `control/clients` | بوابة صح + **2×403** | `ctrl-clients.png` — 200 | ✅ / P2-1 |
| `control/providers` | بوابة صح + **2×403** | ⬜ | P2-1 |
| `control/pricing` | بوابة صح + **2×403** | ⬜ | P2-1 |
| `control/finance/index` | بوابة صح + **403** | ⬜ | P2-1 |
| `control/finance/cash-flow` | بوابة صح + **403** | ⬜ | P2-1 |
| `control/finance/transactions` | بوابة صح + **403** | ⬜ | P2-1 |
| `control/reports` | بوابة صح، **مفيش نداء** (بيستنى اختيار تقرير) — الوحيدة اللي عاملاها صح | ⬜ | ✅ |

### اختبارات الحواف

| الاختبار | السكرين | النتيجة |
|---|---|---|
| الباك إند مش موصول (أول 12 ثانية) | `edge-backend-down.png` | ⚠️ كارت خطأ بيقول **«Network request failed»** بالإنجليزي |
| الباك إند مش موصول (بعد ~30 ثانية) | `edge-offline-screen.png` | ✅ `OfflineScreen` بيظهر بعربي ممتاز + زرار «حاول تاني» |
| وضع الصيانة — بروفيدر | `edge-maintenance.png` | ✅ الشغل بيكمّل عادي (الموظفين مستثنيين — سلوك مقصود) |
| وضع الصيانة — أدمن | `edge-maintenance-admin-banner.png` | ✅ بانر أحمر واضح: «الموقع في وضع الصيانة الآن» — **واتقفلت بعدها واتأكدت** |
| جلسة منتهية (`pm clear`) | — | ✅ رجع لشاشة الدخول من غير كراش |
| تبديل الأدوار (خروج/دخول ×4) | `after-signout.png` | ✅ التوجيه صح في الاتجاهين |

---

## ج. النتائج مرتبة بالخطورة

### 🔴 P0

#### P0-1 — البروفيدر يوصل لـ8 شاشات أدمن ويشوف رسالة سيرفر خام بالإنجليزي

- **الملف:** `mobile/business/app/settings/index.tsx` (ومعاه `settings/notifications.tsx`، `categories.tsx`، `team/index.tsx`، `audit-log.tsx`، `platform-waitlist.tsx`، `content/pages.tsx`، `company/[id]/index.tsx`) — الشاشات دي كلها **بره** مجموعة `(admin)`، فحماية عضوية المجموعة اللي بيعتمد عليها التصميم مش بتغطّيها.
- **السكرين:** `screens/provider-settings.png` — الشاشة كلها فاضية إلا كارت رمادي مكتوب فيه بالأحمر **`Requires ADMIN role`**.
- **الدليل من `api-server.log`:**
  ```
  GET /api/v1/admin/settings 403
  GET /api/v1/admin/notification-settings 403
  GET /api/v1/admin/categories 403
  GET /api/v1/admin/users?page=1&pageSize=30 403
  GET /api/v1/admin/audit-logs?page=1&pageSize=40 403
  GET /api/v1/admin/waitlist?page=1&pageSize=30 403
  GET /api/v1/admin/pages 403
  GET /api/v1/admin/companies?pageSize=100 403
  ```
- **ملاحظة مهمة:** السيرفر بيرفض صح — **مفيش أي تسريب داتا**. الضرر UX بحت + رسالة إنجليزية خام.
- **الإصلاح المقترح (سطر):** مكوّن `RoleGate` على نمط `PermissionGate` يتلفّ حوالين الشاشات الثمانية، أو تحويل 403 لنص «ليس لديك صلاحية» في `ListStates.ErrorCard`.

#### P0-2 — كل رسائل الأخطاء اللي المستخدم بيشوفها من السيرفر إنجليزية

- **الملف:** `api/src/app/api/auth/login/route.ts:86,91` (`"Invalid email or password"`) و`:45,73` (`"Too many attempts. Try again in ${seconds}s."`) — وعمومًا **259 رسالة إنجليزية مقابل صفر عربية** في `api/src`. الجهة اللي بتعرضها: `mobile/business/app/sign-in.tsx:52` والنمط نفسه متكرر في 30+ شاشة.
- **السكرين:** `screens/signin-wrong-password.png`
- **الدليل:** `POST /api/v1/auth/login 401` + النص الأحمر على الشاشة `Invalid email or password`
- **الإصلاح المقترح (سطر):** خريطة `code → نص عربي` في `packages/mobile-shared/src/api.ts` تُستخدم بدل `err.message` (الأكواد موحّدة أصلًا: `VALIDATION_ERROR`/`UNAUTHORIZED`/`FORBIDDEN`/…).

### 🟠 P1

#### P1-1 — كل شاشات الشركة/الموافقات بتقع صامتة بعد 100 صف

- **الملف:** `mobile/business/lib/adminCompanies.ts:55-58` — `fetchCompanyDetail` بيجيب `pageSize=100` ويدوّر بالـ id. نفس النمط في `lib/approvals.ts` (`pageSize=100`) و`lib/offerings.ts`.
- **الدليل:** `GET /api/v1/admin/companies?pageSize=100 200` بيتنادى على **كل** شاشة شركة (تفاصيل/عروض/تقييمات/توفر/حالة/انتظار).
- **ده مقصود وموثّق في الكود** (تعليق `adminCompanies.ts:35-44`) — بس النتيجة عند الشركة رقم 101 هتبقى «الشركة مش لاقيها» من غير سبب مفهوم.
- **الإصلاح المقترح:** راوت `GET /admin/companies/[id]` حقيقي قبل ما عدد الشركات يقرب من 100.

#### P1-2 — بوابة `control/clients` أوسع من حارس السيرفر

- **الملف:** `mobile/business/app/control/clients.tsx:90` بيقبل `["business:read","analytics:read"]` (أي واحدة تكفي)، لكن `api/src/app/api/admin/clients/route.ts` بيطلب `desktopOnly("business:read")` لوحدها.
- **الدليل (اختبار مباشر بحساب معاه `analytics:read` بس):**
  ```
  200 /admin/clients/overview
  403 /admin/clients?page=1&pageSize=30
  ```
- **النتيجة:** أدمن معاه `analytics:read` بس هيشوف الشاشة بتفتح، الـ KPIs بتحمّل، وقائمة العملاء بتضرب 403.
- **الإصلاح المقترح:** خلّي بوابة الشاشة `"business:read"` لوحدها، أو وسّع الراوت لـ`["business:read","analytics:read"]` زي أخوه `clients/overview`.

#### P1-3 — «Not specified» إنجليزية بتظهر في قوائم الطلبات

- **الملف:** `api/src/lib/services/waitlist.service.ts:378,381`
- **السكرين:** `screens/_probe.png` — طلب `AA-20260825-Z47D` عنوانه «Not specified» وحيّه «Not specified».
- **الإصلاح المقترح:** غيّر الـ fallback للعربي في `waitlist.service.ts` (بيأثر على الويب سايت كمان).

#### P1-4 — دفعة 5 نداءات أدمن (403) بعد تسجيل دخول بروفيدر — **مرتين، مش قادر أعيد إنتاجها بالطلب**

- **الملف:** `mobile/business/app/(admin)/_layout.tsx:78-83` — `useEffect` بينادي `refreshAllQueues()` مربوط بـ`[user]` وبيشتغل قبل ما إعادة التوجيه تفكّ التركيب.
- **الدليل:**
  ```
  GET /api/v1/admin/change-requests?status=PENDING 403
  GET /api/v1/admin/feedback?pageSize=50 403
  GET /api/v1/admin/projects?status=PENDING 403
  GET /api/v1/admin/reviews?status=pending 403
  GET /api/v1/admin/site-reviews?pageSize=50 403
  ```
- **الصدق في التصنيف:** حصلت مرتين (بعد تسجيل دخول بروفيدر، وبعد فتح `categories` ببروفيدر). راقبت 4 دقايق بعدها — **ماتكرّرتش** (يعني الـ interval بيتلغي صح). وفي محاولة إعادة إنتاج متعمّدة تالتة **ماحصلتش**. يعني بتعتمد على حالة الملاحة، مش على كل تسجيل دخول.
- **الإصلاح المقترح:** `if (!isAdmin(user)) return;` جوّه الـ effect قبل `refreshAllQueues()`.

### 🟡 P2

| # | النتيجة | الملف + السطر | الدليل | الإصلاح المقترح |
|---|---|---|---|---|
| P2-1 | 11 ريكوست محرّم من 8 شاشات Control Center وهي **عارضة البوابة صح** — الـ effect مش متحجوب | `app/control/overview.tsx:35`, `app/control/finance/index.tsx:32` (ونفس النمط في 6 شاشات) | 11×403 في اللوج مقابل `admin-control-*.png` اللي كلها بتعرض «مفيش صلاحية» | `if (!hasDesktopPermission(user, …)) return;` في أول الـ effect — `control/reports.tsx` عاملها صح أصلًا |
| P2-2 | شارة «أدمن» تباينها **3.05:1** (تحت حد WCAG AA) | `components/UserRow.tsx:51` (`onSurface #181c1f`) فوق `:48` (`primaryContainer #0b6e99`) | `screens/admin-team.png` | `color: colors.onPrimaryContainer` — زي ما `WaitlistRow.tsx:67` و`(admin)/leads.tsx:256` عاملينها |
| P2-3 | نفس النمط في شرائح تصنيفات فورم الشركة | `components/CompanyForm.tsx:221` (`onSurfaceVariant`) فوق `:219` | — | نفس الإصلاح |
| P2-4 | أرقام عربية في شرائح المدة ولاتينية في كل الأرقام التانية على نفس الشاشة | `components/RangeChips.tsx:20-22` (`٧ أيام`, `٣٠ يوم`, `٩٠ يوم`) مقابل `lib/money.ts:13` اللي بيفرض `ar-EG-u-nu-latn` عمدًا | `screens/provider-analytics.png` — «٣٠ يوم» جنب «29» و«41%» و«09-06» | خلّيها `7 أيام / 30 يوم / 90 يوم` |
| P2-5 | الشيفرون `‹` بيتقلب بالـ bidi ويتعرض `›` (بيشاور ناحية غلط في RTL) | `components/MoreScreen.tsx:82` + كل مكان بيستخدم `‹` كنص | `screens/admin-more.png` | استخدم `<Icon name="chevron_left">` بدل حرف نصّي |
| P2-6 | أول ~30 ثانية بعد سقوط الباك إند بتظهر «Network request failed» إنجليزي | `packages/mobile-shared/src/api.ts:266` | `edge-backend-down.png` مقابل `edge-offline-screen.png` | نص عربي بدل `err.message` للحالة `status === 0` |
| P2-7 | مكوّنان ميتان مش مستخدمين خالص | `components/MaintenanceScreen.tsx`, `components/PlaceholderScreen.tsx` | grep على الريبو كله: صفر مرجع | امسحهم أو استخدم `MaintenanceScreen` فعلًا |
| P2-8 | 6 بطاقات KPI كلها بنفس شارة «جديد» | `components/KpiTile.tsx:68-71` + `app/control/overview.tsx:60-70` | `ctrl-overview.png` | ماتعرضش الشارة لما `deltaPercent` يبقى `null` لكل البطاقات |
| P2-9 | أهداف لمس 40dp (أقل من 44) | `components/ChipBar.tsx:176`, `app/lead/[id]/complete.tsx:321`, `components/ExpandedChart.tsx:104` | — | `minHeight: 44` |
| P2-10 | تناقض داخلي: شاشة واحدة بتفضّل الاسم العربي والباقي لأ | `app/(provider)/overview.tsx:106` (`company.nameAr?.trim() || company.name`) مقابل كل الشاشات التانية | نفس الشركة = «أورا إنتيريورز» في `provider-overview.png` و«Aura Interiors» في `admin-team.png` | قرار واحد يتطبّق في الاتنين |
| P2-11 | مفتاح الرسم البياني بيعرض **آخر نقطة** (0 النهاردة) جنب KPI بيقول 163,711 | `components/SeriesChart.tsx:99` | `ctrl-overview.png` — «الإيرادات: 0 ج» فوق رسم فيه قمم واضحة | اعرض إجمالي الفترة، أو سمّيه «آخر يوم» |
| P2-12 | 401 ضايع على `/provider/stats` لحظة تسجيل الخروج من شاشة `analytics` | `app/analytics.tsx:100` (`admin` بيبقى `false` لما `user` يتمسح) | `GET /api/v1/provider/stats?days=30… 401` بعد `POST /auth/logout 204` | مفيش ضرر — التوكن كان اتمسح أصلًا. `if (!user) return;` في `load` |

---

## د. رأيي في الـ UI ككل

**متسق لدرجة مش متوقعة.** الـ 55 شاشة اللي شوفتها كلها بتستخدم نفس الطبقة:
`ScreenHeader`/`Stack` header، نفس الكروت البيضا على أرضية `#f7f9fd`، نفس شارات
الحالة، نفس `ListStates`. مفيش شاشة واحدة باين إنها اتعملت على عجل — حتى الشاشات
النادرة زي `content/email-templates` و`audit-log` ليها نفس المستوى. ده مش شائع في
تطبيق بـ68 شاشة.

**نقلة الكروت اللي اتعملت النهاردة باينة وفرقت.** الكروت دلوقتي
`surfaceContainerLowest` (أبيض) على أرضية `surface` (`#f7f9fd`)، فالفصل حقيقي
وواضح في كل سكرينشوت. لو كانوا لسه على `surface` كان كل حاجة هتبقى مستطيلات رمادية
بحدود 1px بس.

**الرسوم البيانية أحسن جزء.** `provider-analytics.png` و`ctrl-overview.png` فيهم
محاور، تدرّجات، قمم معلّمة بأرقام، وشرائح مدة — على مستوى منتج مدفوع. ألوان الحالات
الجديدة (`New #1d4ed8`, `Contacted #f59e0b`, `In Progress #9a3412`) متمايزة بوضوح
في `admin-leads.png` — الشارات التلاتة تقدر تفرّقهم من بعيد.

**الشبه بالويب سايت:** الهوية مشتركة (نفس اللوجو، نفس `#005578`، نفس التوكنز من
`@alassema/core`)، بس التطبيق **أنضف** من الداشبورد. والشبه بـ`mobile/client` قوي —
نفس لغة الكروت ونفس أسلوب الحالات الفاضية.

**اللي مضايقني:**
1. **العربي مش مكتمل.** التطبيق عربي 100% في النصوص اللي المطوّر كتبها، وإنجليزي
   100% في اللي جاي من السيرفر: رسائل الأخطاء، «Not specified»، أسماء التصنيفات
   والشركات. النتيجة إن أي شاشة فيها داتا حقيقية بتبقى مزيج. أوضح مثال: كارت واحد
   في `provider-overview.png` مكتوب فيه «أورا إنتيريورز» و«Interior & Finishing»
   فوق بعض.
2. **الشاشات اللي بره المجموعات مالهاش هوية دور.** `settings`, `categories`,
   `team`, `audit-log` شكلها زي أي شاشة تانية للبروفيدر لحد ما تضرب 403. لو كل
   شاشة أدمن كان عليها بوابة زي Control Center، الـ P0 الأولاني مكانش وجد.
3. **الشيفرون `›` بيشاور ناحية غلط في كل صف قائمة في التطبيق** — تفصيلة صغيرة بس
   بتتكرر مئات المرات.

**تقديري:** الشغل ده مستوى «جاهز للإنتاج» في البناء والاتساق، ومستوى «لسه محتاج
تمريرة» في التعريب واكتمال البوابات. الفجوة مش في المجهود — هي في إن حد لسه ما
مشاش في التطبيق **بحساب بروفيدر** وحاول يفتح كل حاجة.

---

## هـ. اللي مقدرتش أفحصه — وليه

### 1. اتجاه الصفوف (`rowStart`) — القيد الأهم

**الحاجة اللي الفحص ده كان أصلًا محتاجها.** الهجرة اللي اتعملت النهاردة (117 صف من
`row-reverse` المكتوب بالإيد لـ`rowStart`) **مش متأكدة بصريًا** — لا في التقرير ده
ولا في أي حتة.

**السبب:** Expo Go بيقول `I18nManager.isRTL === false` والمحرك النيتف RTL فعلًا.
و`rowStart = isRTL === uiIsRTL ? "row" : "row-reverse"` — فبيطلع `"row-reverse"`،
واللي تحت محرك RTL بيرتّب الأبناء **من الشمال لليمين**، يعني بالمقلوب.

**أثبته بقياس مش بتخمين:** في `admin-more.png` عملت `uiautomator dump` — الأيقونة
عند `x=124` (الحافة الشمال) والشيفرون عند `x=976` (الحافة اليمين). في بناء RTL صح
لازم يبقوا معكوسين.

**يعني:** أي حكم على اتجاه صف، جهة أيقونة، جهة شيفرون، أو نقطة بداية شريط شرائح —
**مش موجود في التقرير ده**، لأنه كان هيبقى غلط. كل الملاحظات فوق عن حاجات مستقلة عن
الاتجاه (هندسة، مسافات، ألوان، خطوط، ربط، حالات).

### 2. ليه ماعملتش dev build — والمسار اللي جرّبته

`npx expo run:android` فشل. المشكلة **مسار الريبو العربي `F:\العاصمة`**:

| المحاولة | النتيجة |
|---|---|
| `expo run:android` مباشرة | Gradle مش لاقي `@react-native/gradle-plugin` — بيقرا مخرجات `node --print` بترميز ويندوز الافتراضي فالمسار العربي بيتبوّظ |
| `+ JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8` | عدّى، بس AGP رفض صراحةً: «Your project path contains non-ASCII characters» |
| `+ -Pandroid.overridePathCheck=true` | عدّى، ووصل للـ NDK — وهناك `clang++` فشل: `cannot open file 'F:/<C7><E1><DA><C7><D5><E3><C9>/…/ExpoHeader.pch'` (المسار متكتب بـCP1256) |
| Junction بمسار إنجليزي (`C:\assema`) | فشل — expo-autolinking بيعمل realpath فبيرجع للمسار العربي |
| `subst X:` (مش reparse point) | عدّى الـ NDK بنجاح! بس فشل بعدها: `fs.realpathSync.native` — اللي autolinking بيستخدمه — بيحلّ `X:` لـ`F:\العاصمة` برضه، فGradle اتلخبط بين جذرين |

**الخلاصة:** ويندوز بيرجّع المسار الحقيقي دايمًا، فمفيش حيلة مسارات هتنفع. الحلول
الحقيقية اتنين بس: **(أ)** تفعيل «Use Unicode UTF-8 for worldwide language support»
من إعدادات ويندوز (بيحتاج إعادة تشغيل)، أو **(ب)** نسخة من الريبو على مسار إنجليزي
للبناء بس. الاتنين قرارك إنت — ماعملتش ولا واحد فيهم.

> مجلد `mobile/business/android/` اتولد من الـ prebuild وهو **متجاهَل في git**
> (`mobile/business/.gitignore:41`). الـ prebuild غيّر سطرين في
> `mobile/business/package.json` و**رجّعتهم** بـ`git checkout`. الـ junction والـ
> subst اتشالوا الاتنين.

### 3. شاشات مقدرتش أوصلها

- `approvals/project/[id]`, `approvals/feedback/[id]`, `approvals/change-request/[id]`
  — الطوابير التلاتة دي **فاضية** في الداتا المحلية (0 عناصر)، فمفيش id أفتح بيه.
- `approvals/site-review-settings`, `category/[id]`, `team/[id]`,
  `company/[id]/offering/[offeringId]` — ماوصلتهاش، الوقت خلص.
- `control/providers|pricing|reports` و`finance/cash-flow|transactions/*`
  **بالداتا** — شوفت البوابة بتاعتهم بس (فاحصهم بدون صلاحيات)، وخلّصت الصلاحيات
  على 4 شاشات بس قبل ما المحاكي يقع.
- **تدوير الشاشة والكيبورد** على `company/new` — ماتعملش.
- **الأوفلاين الحقيقي** (`svc data disable`) — المحاكي ده أصلًا مالوش إنترنت
  (`ping 8.8.8.8` = 100% loss)، والتطبيق بيوصل للـAPI عن طريق `adb reverse`.
  عملت المكافئ الصح: شيلت الـ reverse mapping — وده اللي طلّع `OfflineScreen`.

### 4. تغييرات على الداتا المحلية — كلها اترجّعت

| التغيير | الحالة |
|---|---|
| `e2e-admin@local.test` → `desktopPermissions` اتحطّت `['analytics:read']` بعدين الـ8 كلهم | ✅ **رجعت `[]`** (حالتها الأصلية) |
| وضع الصيانة اتفعّل لاختبار البانر | ✅ **اتقفل واتأكدت** (`enabled: false`) |
| Expo Go اتمسحت داتاه واتعاد تثبيته من الكاش | لازم — التطبيق كان اتعلّق، والمحاكي مالوش نت يرجّعه |

عايز ترجّع الصلاحيات عشان تفحص Control Center بنفسك:

```bash
cd api && node -e "const{Client}=require('pg');const fs=require('fs');const c=new Client({connectionString:fs.readFileSync('.env','utf8').match(/^DATABASE_URL=\"?([^\"\n]+)\"?/m)[1]});(async()=>{await c.connect();await c.query('UPDATE \"User\" SET \"desktopPermissions\"=\$1 WHERE email=\$2',[['overview:read','operations:read','business:read','finance:read','finance:write','analytics:read','reports:read','settings:write'],'e2e-admin@local.test']);await c.end();console.log('done')})()"
```

### 5. حالة الريبو

`git status` قبل الفحص وبعده: **نفس الـ115 ملف** بتوع تمريرة الـUI اللي شغال عليها.
`mobile/business/android/` متجاهَل. مفيش commit، مفيش push، مفيش branch.
السكرينات في `deliverables/_qa-business/screens/` — **متضفهاش على git** (المجلد
لسه مش متتبّع بس مش متجاهَل صراحةً في `.gitignore`، و`npm run ship` بيعمل
`git add -A`).

# المرحلة 7 — توحيد الترجمة (i18n)

> اتضافت بعد فحص كامل للترجمة عبر كل الصفحات. **قرار مازن:** لوحة الأدمن
> ولوحة البروفيدر **الاتنين يتعرّبوا**، والنصوص الـ inline تتنقل لـ `i18n.ts`.

### الوضع الحالي

النظام نفسه سليم: **٣٣٤ مفتاح `en` / ٣٣٤ `ar`** — تطابق تام، صفر ناقص، صفر
مكرر. و`StringKey = keyof typeof STRINGS.en` بتخلي أي مفتاح غلط خطأ compile.
المشكلة في التغطية مش في الآلية. تلات أنماط شغالة مع بعض:

| النمط | الملفات |
|-------|---------|
| ✅ `t()` صح | كل الصفحات العامة + `TopNav` `Footer` `SearchOverlay` `StatusScreen` `BottomNav` |
| ⚠ عربي inline بـ `ar ? … : …` | `ChatThread` `RequestItemPicker` `RequestBar` `OfferingsEditor` `BusyWindowsEditor` `ProviderChat` `SiteStatusTab` `OfferingCards` |
| ❌ إنجليزي بس | كل `pages/admin/` + `ProviderDashboard` + `AvailabilityControl` `WaitlistManager` `ProfileEditor` `AuthGate` `Pagination` `SearchInput` `SaveButton` `Captcha` `CatalogError` `TelegramConnect` |

### الحجم — اقسمها، متعملهاش PR واحد

≈**٣١٤ مفتاح جديد** (بيقرّبوا يضاعفوا `i18n.ts` من ٣٣٤ لـ ~٦٥٠). ship واحد
بالحجم ده مستحيل يتراجع. تلات أجزاء، كل واحد ship:

| الجزء | النطاق | مفاتيح ≈ |
|-------|--------|----------|
| **7A** | إصلاحات عامة + الباجات (تحت) + نقل الـ ternary العامة | ~35 |
| **7B** | لوحة البروفيدر + مكوناتها (٩ ملفات) | ~111 |
| **7C** | لوحة الأدمن (١٧ ملف) | ~170 |

ابدأ بـ 7A — أصغر واحد وفيه كل اللي العميل شايفه.

### ✅ الحالة — الأجزاء التلاتة خلصت

| الجزء | الحالة | المفاتيح فعليًا |
|-------|--------|-----------------|
| 7A | ✅ | 334 → 391 |
| 7B | ✅ | 391 → 662 |
| 7C | ✅ | 662 → **1090** (en و ar متطابقين) |

الحارس (`api/src/lib/i18nCoverage.test.ts`) قايمة استثناءاته بقت **`CrashScreen.tsx`
بس**، ودي دايمة. أي ملف جديد يقع في التست → يتترجم، **ماينضافش للاستثناءات**.

**باج معماري اتصلّح في 7C:** `/admin` و `/provider` مسارات أخوات لـ `RootLayout`
مش أولاده، فـ `LocaleProvider` (اللي جوه `RootLayout`) عمره ما كان بيتركّب فوقهم.
قبل المرحلة 7 اللوحتين كانوا إنجليزي ثابت فمحدش لاحظ؛ بعد ما بقوا بينادوا `t()`
بقوا بياخدوا الـ default بتاع الـ context (`"ar"`) وعالقين على العربي مهما بدّلت
اللغة. الحل: كل مسار داشبورد بقى ملفوف في `LocaleProvider` بتاعه في `main.tsx`.

### 7A — الإصلاحات اللي العميل بيشوفها

1. **`SaveButton`** — `"Save company"` · `"Saved"` · `"Remove from saved"`.
   الزر ده على **كل كرت شركة** في الموقع.
2. **`AuthGate`** — `"Incorrect email or password."` + `"Admin"` / `"Provider"`.
3. **`SearchInput`** → `"Clear search"` · **`Pagination`** → `"Previous page"` /
   `"Next page"`. دول `aria-label` — قارئ الشاشة العربي بيسمع إنجليزي.
4. **`Captcha`** → `"Failed to load Turnstile"` (رسالة تقنية للعميل).
5. **`CatalogError`**.
6. نقل الـ ternary في `ChatThread` `RequestItemPicker` `RequestBar`
   `OfferingCards` لـ `t()`.

**🔴 استثناء: `CrashScreen` يفضل زي ما هو.** نصوصه inline عن قصد — صفر
اعتماديات (شوف [المرحلة 1](phase-1-status-screen.md)). **ماتنقلهوش لـ `i18n.ts`** ولا تخليه يستدعي `t()`.
اكتب التعليق ده جنبه عشان محدش يـ"يصلّحه" بعدين.

### باجات محددة (كلها في 7A)

**التواريخ بتاخد لغة الجهاز مش لغة الموقع.** `toLocaleDateString()` /
`toLocaleString()` من غير locale في `WaitlistManager:132`،
`ProviderDashboard:523`، و٦ مواضع في `pages/admin/`. يعني مستخدم على ويندوز
إنجليزي بيشوف `Jul 29, 2026` جوه واجهة عربي.
**الحل:** دالة واحدة `formatDate(ms, locale)` و`formatDateTime(ms, locale)` في
`app/src/lib/i18n.ts` (أو `lib/format.ts`)، ومنع `toLocaleDateString()` المباشر.
`pricing.ts` عمل ده صح — اتبع نفس الأسلوب.

**`formatReopenDate` غير متسقة** — بـ locale في `CompanyProfile` و`RequestForm`،
ومن غيره في `AvailabilityControl:71` و`ProviderDashboard:197` و
`admin/index:260`. خلّي البارامتر **إجباري** (نفس منطق `isEffectivelyBusy`)
وسيب TypeScript يمسك الباقي.

**اسم البراند بطريقتين:** `Al Assema` في ٣٤ موضع و **`Al Assemah`** في ٥:
`TopNav:128` و`:208` (aria-label عامّين!) · `AuthGate:48` ·
`admin/components/SidebarBody:17` · `ProviderDashboard:782`. وحّدها.

**`RequestForm.tsx:210`** — `t(locale, "busy_banner_booked_until").toLowerCase()`.
تعديل نص مترجم برمجيًا. في العربي no-op فمش هيبان، بس الصح مفتاح تاني
بالصيغة المطلوبة.

### 🛡 حارس ضد التراجع — اعمله في 7A

من غير حارس، أول كومبوننت جديد هيرجع يكتب نصوص إنجليزي وهنرجع لنفس النقطة.
اكتب تست (بنفس روح `maintenance.coverage.test.ts` الموجودة) بيعدّي على
`app/src/**/*.tsx` ويوقع لو لقى:
- نص JSX حرفي فيه حروف لاتينية (`>Some text<`)
- `placeholder=` / `aria-label=` / `title=` بقيمة نصية حرفية
- `toLocaleDateString()` / `toLocaleString()` من غير بارامتر locale

مع قائمة استثناءات صريحة ومعلّلة: `CrashScreen.tsx` (صفر اعتماديات)،
وأي ملف لسه ما اتنقلش (تتشال مع 7B و 7C).

### قواعد للأجزاء التلاتة

- المفاتيح بـ prefix واضح: `admin_*` · `prov_*` · `chat_*` · `offer_*`.
- ضيف المفتاح في `en` **و** `ar` في نفس التعديل — الترتيب متطابق في البلوكين.
- **صفر تغيير في السلوك.** ده نقل نصوص بس. أي باج تلاقيه اكتبه في قائمة
  منفصلة وسيبه.
- بعد كل جزء: بدّل اللغة في المتصفح وعدّي على كل الشاشات في نطاق الجزء، ودوّر
  على نص إنجليزي فاضل أو تخطيط اتكسر في RTL.


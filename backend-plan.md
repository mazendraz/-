# Service Directory Platform — Backend Technical Plan

> منصة دليل خدمات تربط العملاء بمقدّمي الخدمات. مش marketplace — لا مزايدات، لا شات، لا مدفوعات. مجرد lead-generation: العميل يختار شركة ويبعتلها طلب، والشركة تتواصل معاه خارج المنصة.

**Stack:** Next.js API Routes · Supabase (Postgres + Auth + Storage) · Prisma ORM

---

## 1. المعمارية العامة (Architecture)

```
┌─────────────────────────────────────────────┐
│              Next.js (Vercel)                │
│                                              │
│   Public Pages   Provider Dash   Admin Dash  │
│        │              │              │       │
│        └──────────────┴──────────────┘       │
│                     │                        │
│              API Routes (/api)               │
│       ┌─────────────┼─────────────┐          │
│   Validation   Auth Middleware   Rate Limit  │
│       └─────────────┼─────────────┘          │
│                Service Layer                 │
│                     │                        │
│                Prisma Client                 │
└─────────────────────┼────────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        │          Supabase          │
        │  Postgres · Auth · Storage │
        └────────────────────────────┘
```

**مبادئ التصميم:**
- كل منطق الأعمال في **Service Layer** منفصل عن الـ API Routes (الـ routes بتستقبل وترد بس).
- **Validation** على كل input بـ Zod قبل ما يوصل للـ database.
- **Auth Middleware** يحمي routes البروفايدر والأدمن.
- الردود بشكل موحّد (consistent response shape).

---

## 2. هيكلة المجلدات (Folder Structure)

```
/src
  /app
    /api
      /categories
        route.ts                      GET (list)
        /[slug]/companies/route.ts    GET
      /companies
        route.ts                      GET (list + filters)
        /[slug]/route.ts              GET (full profile)
      /leads
        route.ts                      POST (public submit)
        /[id]/route.ts                PATCH (provider/admin) · DELETE? (admin via /admin/leads)
      /provider
        /leads/route.ts               GET (protected)
      /admin
        /categories/route.ts          GET POST
        /categories/[id]/route.ts     PUT DELETE
        /companies/route.ts           GET POST
        /companies/[id]/route.ts      PUT DELETE
        /companies/[id]/status/route.ts             PATCH
        /companies/[id]/projects/route.ts           POST
        /companies/[id]/projects/[projectId]/route.ts   DELETE
        /companies/[id]/reviews/route.ts            POST
        /companies/[id]/reviews/[reviewId]/route.ts     DELETE
        /upload/route.ts              POST
        /leads/route.ts               GET
        /leads/[id]/route.ts          DELETE
      /auth
        /login/route.ts               POST
        /logout/route.ts              POST
        /me/route.ts                  GET
  /lib
    /prisma.ts            Prisma client (singleton)
    /supabase.ts          Supabase client
    /auth.ts              session / JWT helpers
    /validation           Zod schemas
    /services             business logic
      categories.service.ts
      companies.service.ts
      projects.service.ts
      reviews.service.ts    // يعيد حساب rating/reviewCount
      leads.service.ts      // refNumber + DateTime→epoch
      upload.service.ts
    /middleware
      withAuth.ts
      withRole.ts
      rateLimit.ts
    /utils
      response.ts         موحّد للردود
      errors.ts           custom errors
      slug.ts             توليد slugs
  /prisma
    schema.prisma
    /migrations
```

---

## 3. قاعدة البيانات (Prisma Schema)

> ✅ **الـ schema ده متطابق مع الأنواع الحية** في [data.ts](app/src/lib/data.ts)،
> [requests.ts](app/src/lib/requests.ts)، و[apiTypes.ts](app/src/lib/apiTypes.ts)
> (اللي اتوحّد). شوف [قسم 16](#16-تطابق-العقد-مع-الفرونت-اند-contract-mapping) لجدول الربط الكامل.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Company visibility — يتحكم فيها الأدمن. الـ UI العام بيعرض ACTIVE بس.
enum CompanyStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

// لازم تتطابق قيمها (بعد الـ mapping) مع LeadStatus في الفرونت:
// "New" | "Contacted" | "In Progress" | "Completed" | "Cancelled"
enum LeadStatus {
  NEW
  CONTACTED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum UserRole {
  ADMIN
  PROVIDER
}

model Category {
  id          String   @id @default(uuid())
  slug        String   @unique
  label       String              // الفرونت بيسميها label مش name
  description String   @db.Text
  icon        String              // Material Symbols icon name
  cover       String?             // ApiCategory.cover — صورة غلاف الكاتيجوري
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  companies   Company[]

  // count في الفرونت = عدد الشركات النشطة، بتتحسب live مش بتتخزّن.

  @@index([slug])
  @@index([isActive])
}

model Company {
  id                String        @id @default(uuid())
  categoryId        String
  slug              String        @unique
  name              String
  tagline           String                       // سطر تعريفي قصير
  about             String        @db.Text
  logo              String
  cover             String                       // صورة الغلاف الكبيرة
  services          String[]                     // Postgres text[]
  gallery           String[]                     // روابط صور المعرض
  badges            String[]                     // ["Licensed", "Award-Winning"]
  phone             String
  location          String
  yearsExperience   Int           @default(0)
  responseTime      String                       // "within 2 hours"
  verifiedSince     String                       // "2021"
  completedProjects Int           @default(0)    // رقم يدوي من الأدمن (≠ projects.length)
  // aggregate cache — بيتعاد حسابه من Review عند أي تغيير
  rating            Float         @default(0)
  reviewCount       Int           @default(0)
  featured          Boolean       @default(true)
  verified          Boolean       @default(false)
  status            CompanyStatus @default(ACTIVE)
  // حقول تواصل داخلية للإشعارات — مش بتترجع في الـ public payload
  email             String?
  whatsapp          String?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  category          Category      @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  projects          Project[]
  reviews           Review[]
  leads             Lead[]
  users             User[]

  @@index([slug])
  @@index([categoryId])
  @@index([status])
  @@index([featured])
}

model Project {
  id          String   @id @default(uuid())
  companyId   String
  title       String
  img         String                  // يطابق ApiProject.img + data.ts
  description String   @db.Text
  year        String                  // string (نص عرض زي "2024")
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())

  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
}

model Review {
  id        String   @id @default(uuid())
  companyId String
  author    String                   // يطابق ApiReview.author
  avatar    String                   // حرف أول كـ fallback
  rating    Int                      // 1..5
  text      String   @db.Text
  date      String                   // "March 2024" (نص عرض)
  district  String                   // يطابق ApiReview.district
  createdAt DateTime @default(now())

  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
}

model Lead {
  id           String     @id @default(uuid())
  refNumber    String     @unique          // AA-YYYYMMDD-XXXX — يتولّد server-side
  companyId    String
  service      String                       // الخدمة المطلوبة (نص)
  customerName String                       // ApiLead.name
  phone        String
  district     String
  budget       String
  description  String     @db.Text
  status       LeadStatus @default(NEW)
  createdAt    DateTime   @default(now())   // يترجع كـ epoch ms (Number) في الـ API
  updatedAt    DateTime   @updatedAt

  company      Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)
  // companySlug + companyName بترجع derived من العلاقة دي.

  @@index([companyId])
  @@index([status])
  @@index([createdAt])
}

model User {
  id           String    @id @default(uuid())
  name         String
  email        String    @unique
  passwordHash String
  role         UserRole  @default(PROVIDER)
  companyId    String?
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  company      Company?  @relation(fields: [companyId], references: [id], onDelete: SetNull)

  @@index([email])
  @@index([companyId])
}
```

**ملاحظات على التصميم:**
- ضفت كل حقول `ApiCompany`: `tagline, about, cover, services[], gallery[], badges[], location, yearsExperience, responseTime, verifiedSince, completedProjects, rating, reviewCount, featured, verified`.
- `Project` و `Review` بقوا موديلين كاملين من **Phase 1** (مش Phase 3) — لأن تابات Projects/Reviews وحساب الـ rating أساسية في صفحة الشركة.
- `category` (slug) و `categoryLabel` في الـ payload بيتشتقّوا من علاقة `Category` — مش بنخزّن `categoryLabel` مكرّر.
- `rating` و `reviewCount` aggregate cache بيتعاد حسابهم في `reviews.service` عند add/delete review (نفس سلوك `addReview` في catalog.ts).
- `completedProjects` رقم يدوي من الأدمن (في الـ seed = 87 بينما `projects.length` = 3).
- استبدلت موديل `CompanyImage` بـ `gallery String[]` على الشركة مباشرةً — لأن الفرونت بيتعامل مع `gallery: string[]` بسيطة. (لو عايز captions/ordering منفصلين، رجّعه موديل؛ بس الـ UI الحالي مش محتاجها.)
- `Lead` فيه `refNumber, service, district, budget` وحالات الطلب الخمسة الصح؛ `createdAt` بيترجع **epoch ms (Number)** زي ما `requests.ts` متوقع.
- `onDelete: Cascade` على projects/reviews/leads، `Restrict` على الكاتيجوري، `SetNull` على يوزر البروفايدر.

---

## 4. توحيد الردود (Response Shape)

> ⚠️ **اتغيّر عشان يطابق عميل الـ HTTP الفعلي** في [api.ts](app/src/lib/api.ts)
> و [apiTypes.ts](app/src/lib/apiTypes.ts). العميل بيعمل `res.json() as T` على طول
> (مفيش `success` wrapper)، و وقت الخطأ بيقرأ `.message` من جذر الـ JSON مباشرةً.

**القوائم** → `ApiPage<T>`:
```jsonc
{
  "data": [ /* ... */ ],
  "meta": { "total": 134, "page": 1, "pageSize": 20 }   // لاحظ pageSize مش limit
}
```

**عنصر واحد** → الكائن نفسه **بدون envelope** (زي ما `apiFetch<Lead>` و `apiFetch<Company>` متوقعين):
```jsonc
{ "id": "...", "slug": "...", /* ... */ }
```
> ملاحظة: `apiTypes.ts` معرّفة `ApiItem<T> = { data: T }` بس **مفيش caller فعلي بيستخدمها** —
> كل الكود الحي بيقرأ الكائن مباشرةً. اتفق على الراو-أوبجكت ووحّد `apiTypes.ts` معاه.

**الأخطاء** → `ApiErrorBody` flat + HTTP status مناسب:
```jsonc
{
  "code": "VALIDATION_ERROR",
  "message": "Phone number is invalid",
  "details": { "phone": ["Invalid Egyptian mobile number"] }  // Record<string, string[]>
}
```

أكواد الأخطاء المعيارية:
`VALIDATION_ERROR` · `UNAUTHORIZED` · `FORBIDDEN` · `NOT_FOUND` · `RATE_LIMITED` · `CONFLICT` · `INTERNAL_ERROR`

---

## 5. الـ API Endpoints بالتفصيل

### 5.1 Public (بدون مصادقة)

> المسارات نسبية لـ `VITE_API_URL`. القوائم بترجع `ApiPage<T>`، العنصر الواحد راو.

#### `GET /categories`
قائمة الكاتيجوريز النشطة → `ApiCategory[]`.
- Query: `?active=true`
- Response: `[{ slug, label, description, icon, image, count }]`
  (`image` = `cover`، و`count` = عدد الشركات `ACTIVE` بيتحسب live).

#### `GET /companies`
دليل كل الشركات النشطة (الـ Companies page) → `ApiPage<ApiCompany>`.
- Query: `?page=1&pageSize=20&category=<slug>&search=...&minRating=4&sort=recommended|rating|projects|reviews|name`
- بيرجّع `ACTIVE` بس (يخفي `INACTIVE`/`SUSPENDED`).

#### `GET /categories/[slug]/companies`
الشركات النشطة داخل كاتيجوري واحدة → `ApiPage<ApiCompany>` (نفس فلترة `GET /companies`).

#### `GET /companies/[slug]`  ⭐
بروفايل شركة كامل → `ApiCompany` راو.
- بيرجّع `404` لو الشركة مش `ACTIVE`.
- بيشمل `services[], gallery[], projects[], reviews[], badges[], rating, reviewCount, completedProjects, category, categoryLabel` … (كل حقول `ApiCompany`).

#### `POST /leads`  ⭐ القلب الأساسي
تقديم طلب خدمة. الفرونت بيبعت لـ `/leads` (مش تحت الشركة) — [requests.ts:103](app/src/lib/requests.ts#L103).
- **محمي بـ rate limit + بوت-بروتكشن** (مفتوح للعامة، بدون مصادقة).
- Body (`ApiLeadPayload`):
```json
{
  "companySlug": "aura-interiors",
  "companyName": "Aura Interiors",
  "service": "Full Interior Design",
  "name": "string (2-100)",
  "phone": "string (valid phone)",
  "district": "R7 District",
  "budget": "EGP 150,000 – 500,000",
  "description": "string (10-2000)"
}
```
- التحقق: الشركة موجودة بـ `companySlug` و`ACTIVE`، الموبايل صحيح.
- يولّد `refNumber` (`AA-YYYYMMDD-XXXX`) و status = `NEW`.
- يطلق إشعار للبروفايدر (Phase 2).
- Response: `201` + **كائن `ApiLead` كامل** راو (id, refNumber, companySlug, companyName, service, name, phone, district, budget, description, status, `createdAt` كـ epoch ms).

---

### 5.2 Auth

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/auth/login` | إيميل + باسورد → `{ token, user }` |
| POST | `/auth/logout` | إبطال التوكن |
| GET  | `/auth/me` | بيانات المستخدم الحالي |

- ⚠️ **العميل بيستخدم Bearer token مخزّن في localStorage** (`al-assema-token`) ويبعته
  في هيدر `Authorization: Bearer <token>` — [api.ts:24-29](app/src/lib/api.ts#L24).
  فـ `/auth/login` لازم يرجّع **JWT في جسم الرد** (مش httpOnly cookie بس)، والفرونت بيخزّنه.
- فيه كمان هيدر اختياري `X-Api-Key` (`VITE_API_KEY`) لو حابب تحط بوابة عامة.
- الباسورد متخزّن hashed (argon2/bcrypt) — أو سيب Supabase Auth يدير ده ويصدر الـ JWT.

---

### 5.3 Provider (محمي — role: PROVIDER)

#### `GET /provider/leads`
الطلبات الخاصة بشركة البروفايدر **بس** → `ApiPage<ApiLead>`.
- Middleware يتأكد إن `lead.companyId === user.companyId`.
- Query: `?status=New&page=1&pageSize=20` (القيمة بالـ label زي "In Progress").

#### `PATCH /leads/[id]`
تحديث حالة طلب (أي من الحالات الخمسة) — Body: `ApiLeadStatusPatch` = `{ "status": "Contacted" }`.
- البروفايدر: يتأكد إن الطلب تبع شركته. الأدمن: أي طلب.
- Response: كائن `ApiLead` المحدّث (راو).

> ملاحظة: داشبورد البروفايدر بيعرض كمان projects/reviews (قراءة)، وملف الشركة **بيديره الأدمن** — مفيش write للبروفايدر عليهم.

---

### 5.4 Admin (محمي — role: ADMIN)

#### Categories
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/admin/categories` | كل الكاتيجوريز (نشطة وغير نشطة) |
| POST | `/admin/categories` | إنشاء — يولّد `slug` تلقائي من `label` |
| PUT | `/admin/categories/[id]` | تعديل (label, icon, description, cover) |
| DELETE | `/admin/categories/[id]` | حذف — يفشل لو فيها شركات |

#### Companies
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/admin/companies` | كل الشركات + فلترة بالكاتيجوري/الحالة + عدد الـ leads |
| POST | `/admin/companies` | إضافة (كل حقول `ApiCompany`) + ربط بكاتيجوري |
| PUT | `/admin/companies/[id]` | تعديل البيانات + services/badges/gallery + `featured`/`verified` |
| DELETE | `/admin/companies/[id]` | حذف |
| PATCH | `/admin/companies/[id]/status` | `ACTIVE / INACTIVE / SUSPENDED` |

#### Company Projects & Reviews (يديرها الأدمن)
| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/admin/companies/[id]/projects` | إضافة مشروع |
| DELETE | `/admin/companies/[id]/projects/[projectId]` | حذف مشروع |
| POST | `/admin/companies/[id]/reviews` | إضافة ريفيو → يعيد حساب `rating`/`reviewCount` |
| DELETE | `/admin/companies/[id]/reviews/[reviewId]` | حذف ريفيو → يعيد حساب الـ aggregate |

#### Image Upload
| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/admin/upload` | رفع صورة (logo/cover/gallery/project) → يرجّع `{ url }` |

> الفرونت حاليًا بيضغط الصور لـ data URLs ([image.ts](app/src/lib/image.ts)). مع باك اند حقيقي:
> الأدمن يرفع الملف لـ `/admin/upload`، ياخد الـ URL، ويحطه في حقل `logo`/`cover`/`gallery[]`/`project.img`.

#### Service Requests (Leads)
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/admin/leads` | كل الطلبات + فلترة بالشركة/الحالة/التاريخ → `ApiPage<ApiLead>` |
| PATCH | `/leads/[id]` | تغيير الحالة (نفس endpoint البروفايدر، صلاحية أوسع) |
| DELETE | `/admin/leads/[id]` | حذف طلب (الأدمن بيمسح leads من الـ UI) |

---

## 6. التحقق من المدخلات (Validation — Zod)

مثال على schema الطلب:

```typescript
import { z } from "zod";

// POST /leads — يطابق ApiLeadPayload
export const createLeadSchema = z.object({
  companySlug: z.string().trim().min(1),
  companyName: z.string().trim().min(1),   // معلوماتي؛ المصدر الموثوق هو الشركة من الـ slug
  service: z.string().trim().min(1).max(150),
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?20)?01[0125]\d{8}$/, "رقم موبايل غير صحيح"), // مصري كمثال
  district: z.string().trim().min(1),
  budget: z.string().trim().min(1),
  description: z.string().trim().min(10).max(2000),
});

// POST/PUT /admin/companies — يطابق ApiCompany (الحقول المُدخلة)
export const upsertCompanySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2).max(150),
  tagline: z.string().trim().max(200),
  about: z.string().max(5000),
  logo: z.string().url(),
  cover: z.string().url(),
  services: z.array(z.string().trim().min(1)).default([]),
  gallery: z.array(z.string().url()).default([]),
  badges: z.array(z.string().trim().min(1)).default([]),
  phone: z.string().trim().min(8),
  location: z.string().trim().min(1),
  yearsExperience: z.number().int().min(0),
  responseTime: z.string().trim().min(1),
  verifiedSince: z.string().trim().min(1),
  completedProjects: z.number().int().min(0).default(0),
  featured: z.boolean().default(true),
  verified: z.boolean().default(false),
  email: z.string().email().optional(),
  whatsapp: z.string().trim().optional(),
});

// PATCH /leads/[id]
export const leadStatusSchema = z.object({
  status: z.enum(["New", "Contacted", "In Progress", "Completed", "Cancelled"]),
});
```

كل route بيعدّي الـ body على الـ schema الأول. أي خطأ → `400 VALIDATION_ERROR` بتفاصيل الحقول.

---

## 7. المصادقة والصلاحيات (Auth & Authorization)

**الطبقات:**

1. **`withAuth`** — يتأكد إن فيه session صالحة، يرفض بـ `401` لو لأ.
2. **`withRole(role)`** — يتأكد من الدور، يرفض بـ `403`.
3. **Ownership check** — في routes البروفايدر، يتأكد إن المورد تبع شركته.

```typescript
// مثال على الاستخدام في route
export const GET = withAuth(withRole("PROVIDER", async (req, { user }) => {
  const page = await leadsService.listByCompany(user.companyId, query);
  return ok(page); // → ApiPage<ApiLead>
}));
```

**مصفوفة الصلاحيات:**

| المورد | Public | Provider | Admin |
|--------|:------:|:--------:|:-----:|
| تصفّح الكاتيجوريز/الشركات | ✅ | ✅ | ✅ |
| تقديم طلب | ✅ | ✅ | ✅ |
| شوف طلبات شركتي | ❌ | ✅ | — |
| شوف كل الطلبات | ❌ | ❌ | ✅ |
| إدارة الكاتيجوريز/الشركات | ❌ | ❌ | ✅ |
| تعليق/تفعيل شركة | ❌ | ❌ | ✅ |

---

## 8. الأمان (Security)

- **Rate Limiting** على `POST /requests` و`/auth/login` (مثلاً 5 طلبات/دقيقة/IP) — Upstash Redis أو in-memory للبداية.
- **Bot Protection** على فورم الطلب: reCAPTCHA v3 أو honeypot field.
- **Input Sanitization**: Zod + تنظيف أي HTML في الوصف.
- **Passwords**: hashed (argon2/bcrypt) أو Supabase Auth.
- **JWT**: التوكن بيترجع في جسم الرد (العميل بيخزّنه في localStorage)؛ خليه قصير العمر + refresh لو أمكن. (ملاحظة أمان: localStorage معرّض لـ XSS أكتر من httpOnly cookie — راعي ده ووثّق القرار.)
- **CORS**: مسموح لدومين الموقع بس + السماح بهيدر `Authorization` و`X-Api-Key`.
- **SQL Injection**: محمي تلقائياً عن طريق Prisma (parameterized).
- **منع leak للبيانات**: البروفايدر ميشوفش غير طلبات شركته (ownership check إجباري).
- **Environment Variables**: المفاتيح كلها في `.env`، مش في الكود.

---

## 9. التخزين (Storage — Supabase)

- **Buckets**: `logos` · `covers` · `gallery` · `projects` (أو bucket واحد بمجلدات).
- **Endpoint موحّد**: `POST /admin/upload` بيستقبل الملف، يعمل resize + compress (عرض أقصى ~1200px، WebP/JPEG)، ويرجّع `{ url }`.
- **التخزين**: الـ URL بيتحفظ في الحقل المناسب — `Company.logo` / `Company.cover` / عنصر في `Company.gallery[]` / `Project.img`.
- **حد أقصى**: حجم الصورة ≤ 5MB.
- **الصلاحيات**: الرفع للأدمن بس، القراءة public.
- **بديل/ترحيل**: الفرونت الحالي بيولّد data URLs ([image.ts](app/src/lib/image.ts)) — لو حبّيت تقبلها مؤقتًا اقبل data URL في حقول الصور، بس الأفضل الرفع لـ Storage.

---

## 10. معالجة الأخطاء (Error Handling)

```typescript
// lib/utils/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number,
    public details?: unknown
  ) { super(message); }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} not found`, 404);
  }
}
// ... ForbiddenError, ValidationError, RateLimitError
```

- Wrapper مركزي بيمسك أي خطأ ويحوّله لـ response موحّد.
- Logging للأخطاء (Sentry في الـ production).
- مفيش تفاصيل internal بتتسرّب للعميل.

---

## 11. الإشعارات (Phase 2)

لما يجي طلب جديد للشركة:
- **Email** للبروفايدر (Resend / Supabase) بتفاصيل الطلب.
- **WhatsApp/SMS** (اختياري — Twilio أو WhatsApp Business API).
- في الـ MVP: البروفايدر يشوف الطلبات من الداشبورد بس (polling أو refresh).

---

## 12. الاختبارات (Testing)

| النوع | الأداة | التغطية |
|------|--------|---------|
| Unit | Vitest | Service layer + validation + utils |
| Integration | Vitest + Supertest | API routes مع DB اختبار |
| E2E | Playwright | رحلة العميل + الأدمن الكاملة |

أهم السيناريوهات اللي لازم تتغطّى:
- تقديم طلب لشركة `ACTIVE` ينجح ويرجّع `refNumber` + `createdAt` كـ epoch ms، ولشركة `SUSPENDED` يفشل.
- البروفايدر ميقدرش يشوف طلبات شركة تانية.
- حذف كاتيجوري فيها شركات يفشل.
- إضافة/حذف ريفيو يعيد حساب `rating` و`reviewCount` على الشركة صح.
- شكل الردود يطابق `ApiPage`/راو-object/`ApiErrorBody` (snapshot على الـ JSON).
- rate limit بيشتغل على الطلبات المتكررة على `/leads`.

---

## 13. متغيرات البيئة (.env)

```bash
DATABASE_URL=                    # Supabase Postgres connection
DIRECT_URL=                      # للـ Prisma migrations
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server-side فقط
JWT_SECRET=
RECAPTCHA_SECRET_KEY=
UPSTASH_REDIS_URL=               # rate limiting
RESEND_API_KEY=                  # Phase 2
```

---

## 14. خطة التنفيذ بالمراحل

### Phase 1 — MVP Backend
1. إعداد المشروع + Supabase + Prisma schema (بكل الموديلات: Category/Company/Project/Review/Lead/User) + migrations.
2. Service layer + utils (response envelope، errors، slug، refNumber، DateTime→epoch).
3. Public endpoints: `/categories`, `/companies`, `/companies/[slug]`, `POST /leads`.
4. Auth (login/logout/me برجوع JWT في الـ body) + middleware (withAuth/withRole/ownership).
5. Admin endpoints: CRUD للشركات/الكاتيجوريز + status + **projects + reviews (مع إعادة حساب rating)**.
6. Image upload + storage (`POST /admin/upload`).
7. Validation (Zod) + rate limiting + bot protection على `/leads`.
8. Seed data من `data.ts` للتجربة + تطابق العقد ([قسم 16](#16-تطابق-العقد-مع-الفرونت-اند-contract-mapping)).

### Phase 2
- داشبورد البروفايدر (`/provider/leads` + status update).
- إشعارات إيميل/واتساب عند طلب جديد.

### Phase 3
- بحث وفلترة متقدمة (server-side)، Analytics aggregations للأدمن، self-registration للبروفايدر (لو اتقرر).

---

## 15. ملخص الـ Endpoints

> المسارات نسبية لـ `VITE_API_URL`.

```
PUBLIC
  GET    /categories
  GET    /companies
  GET    /categories/[slug]/companies
  GET    /companies/[slug]
  POST   /leads

AUTH
  POST   /auth/login
  POST   /auth/logout
  GET    /auth/me

PROVIDER
  GET    /provider/leads
  PATCH  /leads/[id]

ADMIN
  GET    /admin/categories
  POST   /admin/categories
  PUT    /admin/categories/[id]
  DELETE /admin/categories/[id]
  GET    /admin/companies
  POST   /admin/companies
  PUT    /admin/companies/[id]
  DELETE /admin/companies/[id]
  PATCH  /admin/companies/[id]/status
  POST   /admin/companies/[id]/projects
  DELETE /admin/companies/[id]/projects/[projectId]
  POST   /admin/companies/[id]/reviews
  DELETE /admin/companies/[id]/reviews/[reviewId]
  POST   /admin/upload
  GET    /admin/leads
  DELETE /admin/leads/[id]
  PATCH  /leads/[id]
```

---

## 16. تطابق العقد مع الفرونت اند (Contract Mapping)

الجدول ده هو **مرجع الحقيقة** للربط بين موديلات الباك اند والأنواع في الفرونت.
التعارضات اللي كانت بين `apiTypes.ts` و `data.ts`/`requests.ts` **اتحلّت — التلاتة بقوا متطابقين**
على أساس أنواع الـ UI الحية.

### Company
| Backend | `data.ts` | `apiTypes.ts` | ملاحظة |
|--------|-----------|----------------|--------|
| كل الحقول | ✅ | ✅ | متوافقين |
| `category`/`categoryLabel` | slug + label | نفسه | derived من علاقة Category |
| `rating`,`reviewCount` | ✅ | ✅ | aggregate cache من Reviews |

### Project
| Backend | `data.ts` | `apiTypes.ts` | الحالة |
|--------|-----------|----------------|--------|
| `img` | `img` | `img` | ✅ موحّد (كان `image`) |
| `year` | `string` | `string` | ✅ موحّد (كان `number`) |

### Review
| Backend | `data.ts` | `apiTypes.ts` | الحالة |
|--------|-----------|----------------|--------|
| `author` | `author` | `author` | ✅ موحّد (كان `reviewer`) |
| `district` | `district` | `district` | ✅ موحّد (كان ناقص) |
| `avatar` | `avatar` | `avatar` | ✅ مطابق |

### Category
| Backend | `data.ts` | `apiTypes.ts` | الحالة |
|--------|-----------|----------------|--------|
| `cover` | `cover` | `cover` | ✅ موحّد (كان `image`) |
| `label` | `label` | `label` | ✅ مطابق |

### Lead (ApiLead)
| Backend | `requests.ts` (حي ✅) | ملاحظة |
|--------|----------------------|--------|
| `refNumber` | ✅ | server-side `AA-YYYYMMDD-XXXX` |
| `companySlug`,`companyName` | ✅ | derived/معلوماتي |
| `service`,`district`,`budget` | ✅ | كلها مطلوبة |
| `status` | New/Contacted/In Progress/Completed/Cancelled | enum بـ mapping |
| `createdAt` | **Number (epoch ms)** ✅ | لازم تحويل من DateTime |

### Envelope
| | الفرونت الحي | القرار |
|--|--------------|--------|
| قائمة | `ApiPage<T>` = `{ data, meta:{total,page,pageSize} }` | اعتمده |
| عنصر | راو object (`res.json() as T`) | اعتمد راو، `ApiItem` غير مستخدم |
| خطأ | `{ code, message, details }` flat | `.message` في الجذر |

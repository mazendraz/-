# api/ — الخدمة الخلفية (Al Assema)

Next.js API Routes + Prisma ORM على Postgres (Supabase). بتوفّر REST API لدليل الخدمات: الشركات، المشاريع، المراجعات، الطلبات (leads)، لوحة الأدمن، ولوحة مقدّم الخدمة.

## التشغيل

```bash
npm install

# الإعدادات
cp .env.example .env          # املأ القيم (DATABASE_URL, JWT secret, …)

# قاعدة البيانات (أول مرة)
npm run db:generate           # توليد Prisma client
npm run db:migrate            # تطبيق الـ migrations
npm run seed                  # بيانات تجريبية (اختياري)
npm run create-admin          # إنشاء مستخدم أدمن

# التطوير
npm run dev                   # http://localhost:3000
```

## السكربتات

| السكربت | الوظيفة |
| ------- | ------- |
| `npm run dev` | خادم التطوير |
| `npm run build` / `npm start` | بناء وتشغيل الإنتاج |
| `npm run lint` | ESLint |
| `npm test` | اختبارات الوحدة (Vitest) |
| `npm run test:integration` | اختبارات التكامل (محتاجة DB) |
| `npm run test:db:up` / `:down` | تشغيل/إيقاف Postgres محلي عبر Docker |
| `npm run db:generate` / `db:migrate` / `seed` / `create-admin` | أدوات قاعدة البيانات |

## الهيكل

```
src/
├── app/api/          مسارات الـ API (route.ts لكل endpoint)
└── lib/
    ├── services/     منطق الأعمال (companies, leads, reviews, …)
    ├── middleware/   auth · rate-limit · captcha · body-limit · guards
    ├── validation/   مخططات Zod للتحقق من المدخلات
    ├── observability/ تسجيل الأخطاء والمراقبة
    └── utils/        أدوات مساعدة
prisma/
├── schema.prisma     موديلات قاعدة البيانات
├── migrations/       الترحيلات
└── seed.ts           بيانات البداية
```

## الموديلات
`Category` · `Company` · `Project` · `Review` · `Lead` · `User` · `PushSubscription` · `SiteReview` · `Feedback` · `AppSetting` · `AuditLog`

## وثائق ذات صلة
- المعمارية الكاملة: [`../docs/architecture/backend-plan.md`](../docs/architecture/backend-plan.md)
- الأمان: [`SECURITY.md`](SECURITY.md)
- النشر: [`../docs/deployment/DEPLOY.md`](../docs/deployment/DEPLOY.md)

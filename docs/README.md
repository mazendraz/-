# التوثيق — Al Assema

فهرس كل وثائق المشروع. الملفات متصنّفة حسب الغرض.

## 🏗️ architecture — المعمارية والتخطيط
- [`backend-plan.md`](architecture/backend-plan.md) — الخطة التقنية للباك إند (المعمارية، الـ schema، العقود). **مصدر الحقيقة.**
- [`backend-build-plan.md`](architecture/backend-build-plan.md) — خطة البناء بالمراحل (Goal → Steps → Files → Done when).

## 🔍 audits — التدقيق والمراجعة
- [`CTO-AUDIT.md`](audits/CTO-AUDIT.md) — تدقيق تقني بمستوى CTO لمراجعة الجاهزية للإطلاق.
- [`REMEDIATION-PLAN.md`](audits/REMEDIATION-PLAN.md) — خطة إصلاح مرافقة للتدقيق، خطوة بخطوة.
- [`PR_DESCRIPTION.md`](audits/PR_DESCRIPTION.md) — وصف الـ PR الخاص بمراحل التقوية الأمنية.

## 🚀 deployment — النشر
- [`DEPLOY.md`](deployment/DEPLOY.md) — دليل النشر الكامل خطوة بخطوة (Frontend + Backend + DB).

> للنشر على VPS بدومين واحد، شوف كمان [`../deploy/README.md`](../deploy/README.md) والسكربتات في [`../deploy/`](../deploy/).

## 📱 التطبيقات الموبايل — التوثيق المرجعي
- [`mobile/business/README.md`](../mobile/business/README.md) — **تطبيق الموظفين (مقدّم الخدمة + الأدمن)**: المعمارية، خريطة الشاشات، الصلاحيات، الجلسات، SSE/الإشعارات، البناء والنشر.
- [`mobile/client/README.md`](../mobile/client/README.md) — تطبيق العملاء.

> خطة بناء تطبيق الموظفين بالمراحل في [`architecture/business-app/`](architecture/business-app/README.md).

## 🤖 prompts — برومبتات الـ AI
- [`ai-context-prompt-al-assema.md`](prompts/ai-context-prompt-al-assema.md) — برومبت سياقي تلصقه لأي AI agent جديد عشان يفهم المشروع كامل.
- [`dev-prompt-critical-fixes-and-notifications.md`](prompts/dev-prompt-critical-fixes-and-notifications.md) — برومبت جاهز لمطوّر fullstack (إصلاحات كريتيكال + إشعارات).

---

📄 الـ README الرئيسي للمشروع في [الجذر](../README.md).

# برومبت ١ — الرفع (للكلود كود على جهاز مازن المحلي)

إنت على جهاز مازن المحلي، في ريبو مشروع "العاصمة" (داخل OneDrive). فيه تعديلات
مهمة غير مرفوعة في الـ working tree (تحصين seed.ts، storage driver محلي في
upload.service.ts، backup.sh، docker-compose.dev.yml، CLAUDE.md). المطلوب ترفعها
على GitHub على برانش main بأمان:

- لو فيه قفل عالق: امسحه `rm -f .git/index.lock`. لو ظهر "index corrupt" اعمل
  `git reset` (بيعيد بناء الـ index من HEAD من غير ما يلمس ملفاتك). لو القفل رفض
  يتمسح، قوللي أقفل VS Code وأعمل Pause لـ OneDrive.
- استخدم أمر الريبو المعتمد بس:
  `npm run ship -- "feat: local image storage + harden seed + local/prod db split + two-place backups"`
- ممنوع rebase أو push --force أو تبديل برانشات.
- بعد الرفع اتأكد بـ `git status` و `git log --oneline -3` إن الـ commit اترفع فعلًا.
- ملاحظة: api/.env و api/.env.production متجاهلين من git (فيهم أسرار) — اتأكد إنهم
  مش داخلين في الـ commit.

# برومبت ٢ — السحب/الـ deploy (للكلود كود على السيرفر)

إنت على سيرفر الإنتاج (هوستنجر VPS) في ريبو "العاصمة". التعديلات اتّرفعت على برانش
اسمه `fix/phase-0-hardening` (مش main). المطلوب تسحبه وتعمله deploy:

- الأول اتأكد إن السيرفر على نفس البرانش (السيرفر مش جوه OneDrive فالتبديل آمن هنا):
    git fetch origin
    git checkout fix/phase-0-hardening
- بعدها شغّل: `bash deploy/deploy.sh`  (بيحفظ rollback point، بيعمل git pull لنفس
  البرانش، بيبني، ويعيد تشغيل الـ API).
- بعدها اتأكد إن الكود الجديد وصل فعلًا:
    git log --oneline -3
    grep -n "uploadToLocalDisk\|STORAGE_DRIVER" api/src/lib/services/upload.service.ts
  لازم الـ grep يطلّع نتايج.
- ممنوع أي أمر مدمّر (لا seed ولا migrate reset ولا حذف). بلّغني بالنتيجة بس.

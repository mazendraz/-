# Al Assema Business — إصدار ورفع على المتاجر

كل البناء بيتم على **EAS** من **GitHub Actions**، مش من جهاز محلي.
الـ workflow: [`.github/workflows/mobile-business-release.yml`](../../.github/workflows/mobile-business-release.yml)

| | |
|---|---|
| EAS project | `9f9db7b8-98a0-43d9-b9a4-338ae0e7a4c2` (`alassema-business`, owner `mazendraz`) |
| Bundle / package | `com.alassema.business` |
| قنوات التحديث | `production` / `preview` (expo-updates → `https://u.expo.dev/9f9db7b8-…`) |
| أرقام الإصدار | `appVersionSource: remote` — **EAS** اللي بيزوّد `versionCode` و `buildNumber`. ماتعدّلهمش بإيدك في `app.json`. |

`version` في `app.json` (`1.0.0`) هو اللي بيحدّد الـ runtimeVersion، فأي تغيير نيتف لازم يزوّده.

---

## الأسرار المطلوبة في GitHub

Settings ← Secrets and variables ← Actions ← **New repository secret**

| السر | من فين | مطلوب لإيه |
|---|---|---|
| `EXPO_TOKEN` | expo.dev ← Settings ← Access tokens | كل بناء |
| `ANDROID_KEYSTORE_BASE64` | محتوى `mobile/business/ci/upload-keystore.jks.base64` | بناء أندرويد |
| `ANDROID_KEYSTORE_PASSWORD` | الباسورد اللي في `mobile/business/ci/KEYSTORE-PASSWORD.txt` | بناء أندرويد |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | `‎.alassema-secrets\google-play-service-account.json` | الرفع على Play |
| `ASC_API_KEY_BASE64` | base64 لملف `‎.alassema-secrets\AuthKey_69TH75M6BG.p8` | الرفع على App Store |

مفتاح الرفع (`upload-keystore.jks`) **لازم** يتعمله نسخة احتياطية بره الريبو مع الباسورد.
ضياعه معناه إنك مش هتقدر ترفع تحديث للتطبيق تاني على نفس الـ listing.
مجلد `ci/` و `credentials.json` مُستبعدين من git.

---

## تشغيل إصدار

Actions ← **Mobile Business — Build & Submit** ← Run workflow:

- **platform** — `android` أو `ios`
- **profile** — `production` (AAB/IPA للمتجر) أو `preview` (APK للتوزيع المباشر)
- **submit** — علّمها عشان يرفع على المتجر بعد ما يخلّص البناء

الـ workflow بيعمل typecheck الأول، وبيمسح كل ملفات التوقيع من الرَنَر في الآخر.

### الرفع على Google Play
البروفايل بيرفع على مسار **internal** بحالة **draft**. أول مرة لازم يكون
التطبيق متعمل في Play Console بنفس الـ package، وحساب الخدمة معاه صلاحية عليه.

### الرفع على App Store
أول بناء iOS لـ `com.alassema.business` محتاج credentials جديدة (شهادة توزيع +
provisioning profile). دي اتعملت مرة واحدة تفاعليًا بـ `eas credentials`؛
بعد كده الـ CI بيشتغل `--non-interactive` عادي.

---

## تحديث OTA (من غير بناء جديد)

للتغييرات اللي في JS بس، جوه نفس نسخة `app.json` النيتف:

```bash
cd mobile/business
eas update --branch production --message "وصف التغيير"
```

أي تغيير نيتف (مكتبة جديدة، صلاحية، أيقونة) لازم بناء جديد.

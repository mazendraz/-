#!/usr/bin/env bash
# ship.sh — ارفع تعديلاتك على GitHub بأمر واحد.
#
#   bash scripts/ship.sh "رسالة الكوميت"
#   (أو من الجذر:  npm run ship -- "رسالة الكوميت")
#
# بيعمل: تنظيف أي قفل git عالق → add → commit → push للبرانش الحالي.
# آمن لإعادة التشغيل. لو مفيش تعديلات، بيعمل push للموجود بس.
set -euo pipefail

# اتحرك لجذر الريبو مهما كان مكان التشغيل
cd "$(cd "$(dirname "$0")/.." && pwd)"

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  MSG="update: $(date '+%Y-%m-%d %H:%M')"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# VS Code أو الأنتي فيروس أحيانًا بيسيبوا .git/index.lock عالق ويلخبط git — نظّفه
if [[ -f .git/index.lock ]]; then
  echo "⚠  لقيت .git/index.lock عالق — بشيله."
  rm -f .git/index.lock || true
fi

echo "→ البرانش: $BRANCH"
git add -A

# ── حارس الأسرار وحجم الملفات ─────────────────────────────────────────────────
# في 2026-07-20 اتعمل أرشيف backup فيه api/.env بكل الأسرار الحقيقية، والـ
# `git add -A` اللي فوق رفعه على GitHub. قواعد الـ .gitignore وقتها كانت بتطابق
# **مسار** الـ .env، والملف كان جوه tar — فعدّى.
#
# عشان كده الحارس ده بيبص على اللي **اتعمله stage فعلًا** قبل الـ commit، مش على
# القواعد. أي ملف سر/أرشيف/dump، أو أي ملف أكبر من 1MB، بيوقف الرفع.
# للتجاوز عن قصد (نادر): SHIP_I_KNOW=1 npm run ship -- "رسالة"
MAX_BYTES="${SHIP_MAX_FILE_BYTES:-1048576}" # 1MB
blocked=""

# --diff-filter=d بيستثني الملفات المحذوفة: إنك تشيل ملف سر ده حاجة كويسة،
# مش حاجة نوقفها.
while IFS= read -r -d '' f; do
  case "$f" in
    # قوالب ومراجع — مسموحة (مفيهاش أسرار حقيقية)
    *.example|*.example.*|*.reference) ;;
    # الـ migrations لازم تفضل متتبّعة
    api/prisma/migrations/*/migration.sql) ;;
    # أسرار وأرشيفات
    *.env|*.env.*|*.pem|*.key|*.p12|*.pfx|id_rsa|id_ed25519)
      blocked="${blocked}
  [سر]     $f" ; continue ;;
    *.tar|*.tar.gz|*.tgz|*.zip|*.bak)
      blocked="${blocked}
  [أرشيف]  $f" ; continue ;;
    *.sql|*.sql.gz|*.dump)
      blocked="${blocked}
  [dump]   $f" ; continue ;;
  esac

  # حجم الملف — أرشيف أو dump كبير بيعدّي من غير ما حد ياخد باله
  if [[ -f "$f" ]]; then
    size="$(wc -c < "$f" | tr -d '[:space:]')"
    if [[ "$size" -gt "$MAX_BYTES" ]]; then
      blocked="${blocked}
  [كبير]   $f ($((size / 1024)) KB)"
    fi
  fi
done < <(git diff --cached --name-only --diff-filter=d -z)

if [[ -n "$blocked" ]]; then
  if [[ "${SHIP_I_KNOW:-}" == "1" ]]; then
    echo "⚠  الحارس لقى الملفات دي بس SHIP_I_KNOW=1 — بكمّل:$blocked"
  else
    echo "✗ الرفع اتوقف — الملفات دي متعملها stage:$blocked" >&2
    echo "" >&2
    echo "  لو دي ملفات مؤقتة:  git reset  ثم ضيفها في .gitignore" >&2
    echo "  لو متأكد إنها آمنة:  SHIP_I_KNOW=1 npm run ship -- \"رسالتك\"" >&2
    exit 1
  fi
fi

# فحص أسرار إضافي لو gitleaks متثبّت (اختياري — مش شرط للرفع)
if command -v gitleaks >/dev/null 2>&1; then
  if ! gitleaks protect --staged --no-banner --redact >/dev/null 2>&1; then
    echo "✗ gitleaks لقى سر جوه التعديلات. شغّل: gitleaks protect --staged --verbose" >&2
    [[ "${SHIP_I_KNOW:-}" == "1" ]] || exit 1
  fi
fi

if git diff --cached --quiet; then
  echo "→ مفيش تعديلات جديدة للكوميت."
else
  git commit -m "$MSG"
  echo "✓ اتعمل commit: $MSG"
fi

echo "→ بيرفع على origin/$BRANCH …"
git push origin "$BRANCH"
echo "✓ اترفع بنجاح."
echo
echo "لتحديث السيرفر، شغّل عليه:"
echo "   git checkout $BRANCH && bash deploy/deploy.sh"

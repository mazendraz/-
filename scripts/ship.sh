#!/usr/bin/env bash
# ship.sh — ارفع تعديلاتك على GitHub بأمر واحد.
#
#   bash scripts/ship.sh "رسالة الكوميت"
#   (أو من الجذر:  npm run ship -- "رسالة الكوميت")
#
# بيعمل: تنظيف أي قفل عالق من OneDrive → add → commit → push للبرانش الحالي.
# آمن لإعادة التشغيل. لو مفيش تعديلات، بيعمل push للموجود بس.
set -euo pipefail

# اتحرك لجذر الريبو مهما كان مكان التشغيل
cd "$(cd "$(dirname "$0")/.." && pwd)"

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  MSG="update: $(date '+%Y-%m-%d %H:%M')"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# OneDrive أحيانًا بيسيب .git/index.lock عالق ويلخبط git — نظّفه
if [[ -f .git/index.lock ]]; then
  echo "⚠  لقيت .git/index.lock عالق — بشيله."
  rm -f .git/index.lock || true
fi

echo "→ البرانش: $BRANCH"
git add -A

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

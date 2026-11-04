#!/bin/bash
# ים של ציורים - הפעלה במק: לחיצה כפולה על הקובץ הזה
cd "$(dirname "$0")" || exit 1
xattr -dr com.apple.quarantine . >/dev/null 2>&1

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "כדי להפעיל את האקווריום צריך להתקין את Node.js (פעם אחת בלבד).\n\nנפתח עכשיו את אתר ההורדה: לחצו על הכפתור הירוק LTS, התקינו, ואז לחצו שוב פעמיים על start.command." buttons {"פתיחת אתר ההורדה"} default button 1 with title "ים של ציורים"' >/dev/null 2>&1
  open "https://nodejs.org/"
  exit 1
fi

MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 18 ]; then
  osascript -e 'display dialog "גרסת Node.js ישנה מדי (צריך 18 ומעלה). התקינו גרסה חדשה מ-nodejs.org." buttons {"אישור"} default button 1' >/dev/null 2>&1
  open "https://nodejs.org/"
  exit 1
fi

PORT="${PORT:-8000}"
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "האקווריום כבר רץ - פותח את המסך."
  open "http://localhost:$PORT/tv"
  exit 0
fi

( sleep 2; open "http://localhost:$PORT/tv" ) &
echo "ים של ציורים רץ. כדי לעצור: סגרו את החלון הזה (או Ctrl+C)."
exec node server.js

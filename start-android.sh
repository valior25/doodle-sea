#!/data/data/com.termux/files/usr/bin/bash
# Doodle Sea on Android (Termux). Usage:  bash start-android.sh   |   bash start-android.sh test
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "מתקין Node.js (פעם אחת)..."; pkg update -y && pkg install -y nodejs || { echo "ההתקנה נכשלה. בדקו חיבור לאינטרנט."; exit 1; }
fi
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock    # keep the server alive with the screen off
export REEF_DATA="${REEF_DATA:-$HOME/reef-data}"; mkdir -p "$REEF_DATA"
export PORT="${PORT:-8000}"
if [ "$1" = "test" ]; then
  REEF_NO_LIMIT=1 node server.js >/tmp/reef-test.log 2>&1 & P=$!
  sleep 2; node tools/selftest.js "$PORT"; R=$?; kill $P 2>/dev/null; exit $R
fi
echo; echo "  בדפדפן של הטלפון:  http://localhost:$PORT/tv   (תצוגה)   http://localhost:$PORT/scan   (סריקה)"
echo "  בדיקת מערכת:       http://localhost:$PORT/check"; echo
exec node server.js

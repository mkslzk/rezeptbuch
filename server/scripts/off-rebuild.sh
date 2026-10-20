#!/usr/bin/env bash
# Monatlicher OFF-DB-Rebuild für MOCA.
# 1) Dump streamen → off.db neu bauen (atomar, alte DB bleibt bei Fehler)
# 2) moca.service neu starten (hält sonst den alten Inode)
# 3) Angebote neu scrapen, damit die neuen Vegan-/Vegetarisch-Tags greifen
# 4) Kurzbericht auf stdout (Cron liefert ihn verbatim)
#
# Test ohne Download: moca-off-rebuild.sh --skip-build
set -uo pipefail

cd /home/openclaw/services/moca/server || { echo "⚠️ MOCA-Verzeichnis fehlt"; exit 1; }

LOG="$HOME/.hermes/cache/scratch/off-rebuild.log"
mkdir -p "$(dirname "$LOG")"
SUMMARY=""

if [ "${1:-}" = "--skip-build" ]; then
  SUMMARY="(Build übersprungen)"
else
  curl -sL --max-time 5400 "https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz" \
    | python3 scripts/build-off-db.py - >"$LOG" 2>&1
  rc=${PIPESTATUS[1]}
  SUMMARY=$(grep -E "✅ Fertig|⚠️" "$LOG" | tail -1)
  if [ "$rc" -ne 0 ]; then
    echo "⚠️ OFF-Rebuild fehlgeschlagen (Exit $rc): ${SUMMARY:-kein Output}"
    echo "off.db bleibt unverändert. Log: $LOG"
    exit "$rc"
  fi
fi

systemctl --user restart moca.service
for _ in $(seq 1 25); do
  curl -sf -o /dev/null http://localhost:3001/recipe/api/health && break
  sleep 1
done
curl -sf -o /dev/null http://localhost:3001/recipe/api/health || {
  echo "⚠️ moca.service antwortet nach dem Neustart nicht"; exit 1; }

# Scrape anstoßen (läuft im Dienst im Hintergrund) und abwarten
curl -s -X POST http://localhost:3001/recipe/api/offers/scrape -o /dev/null
for _ in $(seq 1 72); do
  st=$(curl -s http://localhost:3001/recipe/api/offers/scrape/progress \
    | python3 -c "import sys,json;print((json.load(sys.stdin).get('progress') or {}).get('status',''))" 2>/dev/null)
  [ "$st" = "running" ] || break
  sleep 5
done

curl -s http://localhost:3001/recipe/api/offers | python3 -c "
import json,sys,collections
d=json.load(sys.stdin)
o=[x for a in d.get('offers',{}).values() for x in a]
c=collections.Counter(x.get('diet_tag') or 'ohne' for x in o)
print(f\"Angebote: {len(o)} · vegan {c['vegan']} · vegetarisch {c['vegetarisch']} · Fleisch/Fisch {c['fleisch']}\")
" 2>/dev/null

[ -n "$SUMMARY" ] && echo "$SUMMARY"
exit 0

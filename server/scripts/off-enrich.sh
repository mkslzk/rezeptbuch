#!/usr/bin/env bash
# Tägliches OFF-Budget: holt ingredients_analysis_tags für gematchte Angebots-Codes.
# OFF drosselt anonym (~429), deshalb kleine Charge + Pausen; Rest folgt am nächsten Tag.
set -u
cd /home/openclaw/services/moca/server || exit 1
exec node scripts/off-enrich.cjs "${OFF_BATCH:-120}"

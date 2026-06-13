#!/usr/bin/env bash
# Met a jour l'extension Twitch Auto depuis GitHub (mise a jour EN PLACE).
# Ensuite : chrome://extensions -> bouton recharger sur la carte Twitch Auto.
set -e
cd "$(dirname "$0")/.."

echo "Recuperation de la derniere version..."
git pull --ff-only

VERSION=$(node -e "console.log(require('./manifest.json').version)" 2>/dev/null || grep -oP '"version"\s*:\s*"\K[^"]+' manifest.json)
echo ""
echo "Version installee : v$VERSION"
echo "Derniere etape : va sur chrome://extensions et clique le bouton recharger sur Twitch Auto."

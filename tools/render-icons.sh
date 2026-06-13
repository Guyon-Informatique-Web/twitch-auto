#!/usr/bin/env bash
# Genere les PNG d'icone a partir de icons/logo.svg via Chrome headless.
set -e
cd "$(dirname "$0")/.."
for size in 16 32 48 128; do
  cat > /tmp/ta-icon.html <<HTML
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0}img{display:block}</style>
<img src="file://$PWD/icons/logo.svg" width="$size" height="$size">
HTML
  google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --default-background-color=00000000 \
    --window-size=$size,$size \
    --screenshot=icons/icon-$size.png "file:///tmp/ta-icon.html"
done
echo "icones generees"

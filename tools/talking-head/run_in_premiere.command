#!/bin/bash
# Doppelklick (oder im Terminal ausfuehren): schickt build_premiere_KW42.jsx an Premiere Pro.
# Premiere sollte bereits laufen. Erstes Mal: Rechtsklick > Oeffnen (Gatekeeper), ggf. chmod +x.
DIR="$(cd "$(dirname "$0")" && pwd)"
JSX="$DIR/build_premiere_KW42.jsx"
APP="$(ls -d /Applications/Adobe\ Premiere\ Pro*/Adobe\ Premiere\ Pro*.app 2>/dev/null | grep -v Beta | sort | tail -1)"
if [ -z "$APP" ]; then echo "Premiere Pro nicht gefunden in /Applications"; exit 1; fi
BIN="$APP/Contents/MacOS/$(basename "$APP" .app)"
echo "Premiere: $APP"
echo "Skript:   $JSX"
"$BIN" /C es.processFile "$JSX" &
echo "Gesendet. Ergebnis erscheint als Hinweisfenster in Premiere."

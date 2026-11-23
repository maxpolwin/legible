#!/bin/sh
# Regenerate the bundled fonts into build-fonts/ (gitignored).
# Downloads the pinned OFL sources, verifies SHA-256 (in build-fonts.py),
# builds with a hash-pinned fonttools in a throwaway venv, then cleans up.
# Needs: python3, curl, network. The plugin itself stays offline.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build-fonts"
COMMIT=06bfe0d62a98375cb09c942fa18e68bd32cff057   # github.com/google/fonts
BASE="https://raw.githubusercontent.com/google/fonts/$COMMIT/ofl"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/src"

get() { curl -fsSL --proto '=https' --tlsv1.2 "$BASE/$1" -o "$WORK/src/$2"; }
get "inter/Inter%5Bopsz,wght%5D.ttf" "inter_Inter[opsz,wght].ttf"
get "inter/Inter-Italic%5Bopsz,wght%5D.ttf" "inter_Inter-Italic[opsz,wght].ttf"
get "roboto/Roboto%5Bwdth,wght%5D.ttf" "roboto_Roboto[wdth,wght].ttf"
get "roboto/Roboto-Italic%5Bwdth,wght%5D.ttf" "roboto_Roboto-Italic[wdth,wght].ttf"
get "opensans/OpenSans%5Bwdth,wght%5D.ttf" "opensans_OpenSans[wdth,wght].ttf"
get "opensans/OpenSans-Italic%5Bwdth,wght%5D.ttf" "opensans_OpenSans-Italic[wdth,wght].ttf"
for w in Black Bold ExtraBold ExtraLight Light Medium Regular SemiBold Thin; do
  get "lato/Lato-$w.ttf" "lato_Lato-$w.ttf"
  [ "$w" = Regular ] && w=""   # Regular's italic is plain "Italic"
  get "lato/Lato-${w}Italic.ttf" "lato_Lato-${w}Italic.ttf"
done

python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install -q --require-hashes --only-binary=:all: -r "$ROOT/scripts/requirements-fonts.txt"
rm -rf "$OUT"
"$WORK/venv/bin/python" -I "$ROOT/scripts/build-fonts.py" "$WORK/src" "$OUT"

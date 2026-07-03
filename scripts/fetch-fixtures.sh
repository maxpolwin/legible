#!/bin/sh
# Fetch test-fixture fonts (dev-only; fixtures are gitignored).
# The plugin itself never touches the network — this script is for local/CI
# unit tests that need a real TTF to exercise font embedding.
set -e
DIR="$(dirname "$0")/../test/fixtures"
mkdir -p "$DIR"

fetch() {
  url="$1"
  out="$2"
  if [ -f "$out" ]; then
    echo "exists: $out"
    return 0
  fi
  echo "fetching $url"
  curl -fsSL "$url" -o "$out" || return 1
}

# Lato (SIL OFL 1.1) — static regular + bold, used for embedding/extraction tests.
fetch "https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf" "$DIR/Lato-Regular.ttf" || true
fetch "https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Bold.ttf" "$DIR/Lato-Bold.ttf" || true

# EB Garamond (SIL OFL 1.1) — has standard fi/fl ligatures, used for the
# ligature-to-Unicode (ToUnicode CMap) test.
fetch "https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf" "$DIR/EBGaramond.ttf" || true

ls -la "$DIR"

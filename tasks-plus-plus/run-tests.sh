#!/usr/bin/env bash
# Runs the Playwright tests in the terminal. Extra arguments are passed to
# `playwright test`, e.g. `./run-tests.sh tests/copy-buttons.spec.js` or
# `./run-tests.sh --update-snapshots`.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm ci
fi

# Does nothing when Chromium is already installed.
npx playwright install chromium

npx playwright test "$@"

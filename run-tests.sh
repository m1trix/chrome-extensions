#!/usr/bin/env bash
# Runs every extension's tests (each folder's run-tests.sh), carrying on past
# failures, and exits non-zero if any failed. Extra arguments are passed to
# each one, e.g. `./run-tests.sh --update-snapshots`.
set -uo pipefail

cd "$(dirname "$0")"

failed=()
for script in */run-tests.sh; do
  extension=$(dirname "$script")
  echo "==> $extension"
  "./$script" "$@" || failed+=("$extension")
  echo
done

if [ ${#failed[@]} -gt 0 ]; then
  echo "Tests failed in: ${failed[*]}"
  exit 1
fi
echo "All tests passed."

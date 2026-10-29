#!/usr/bin/env bash
# Runs every test and writes the reports into the gitignored private/test-report/ folder:
#   typescript/index.html   Vitest's HTML report of the unit and story tests (opens from disk)
#   rust/junit.xml          nextest's JUnit report of the Rust tests
# Both suites always run, so a failure in one still leaves a report of the other; the script
# fails if either did. Needs cargo-nextest: cargo install cargo-nextest --locked
# Usage: generate_test_report.sh
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_DIR
readonly REPORT_DIR="${PROJECT_DIR}/private/test-report"
readonly MANIFEST_PATH="${PROJECT_DIR}/src-tauri/Cargo.toml"
readonly NEXTEST_PROFILE='report'
readonly NEXTEST_JUNIT_FILE="${PROJECT_DIR}/src-tauri/target/nextest/${NEXTEST_PROFILE}/junit.xml"
readonly RUST_REPORT_DIR="${REPORT_DIR}/rust"

if ! cargo nextest --version >/dev/null 2>&1; then
  echo 'Error: cargo-nextest is missing. Install it with: cargo install cargo-nextest --locked' >&2
  exit 1
fi

rm -rf "${REPORT_DIR}"
rm -f "${NEXTEST_JUNIT_FILE}"
mkdir -p "${RUST_REPORT_DIR}"

cd "${PROJECT_DIR}" || exit 1
pnpm exec vitest run --mode test-report
typescript_status=$?

cargo nextest run --manifest-path "${MANIFEST_PATH}" --profile "${NEXTEST_PROFILE}"
rust_status=$?
# Missing when the Rust code doesn't compile, so no test ran.
if [[ -f "${NEXTEST_JUNIT_FILE}" ]]; then
  cp "${NEXTEST_JUNIT_FILE}" "${RUST_REPORT_DIR}/"
fi

echo
echo "Reports written to ${REPORT_DIR}"
((typescript_status == 0 && rust_status == 0))

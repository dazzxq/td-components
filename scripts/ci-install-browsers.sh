#!/usr/bin/env bash
# CI only (v0.63.2): install the Playwright browsers named in $ENGINES with their system deps. Twice on 2026-10-09/10 the runner's
# apt mirror stalled and one job sat 18–25 min in `playwright install --with-deps` (one hit the job timeout). Each attempt is
# capped at 5 minutes (a normal install takes ~1) — SIGKILL 30 s after the SIGTERM; a stalled apt is cleared before the next
# one. Worst case ~17 min: the jobs' timeout-minutes leave room for it.
set -u
for attempt in 1 2 3; do
  if timeout --kill-after=30s 300s npx playwright-core install --with-deps ${ENGINES}; then exit 0; fi
  echo "::warning::browser install attempt ${attempt} failed or stalled — retrying"
  sudo pkill -x apt-get || true
  sudo pkill -x dpkg || true
  sudo dpkg --configure -a || true
  sleep 5
done
exit 1

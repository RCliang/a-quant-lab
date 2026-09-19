#!/bin/bash
# 一键更新全部数据并重建前端。配合 cron 使用（工作日盘后）。
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=data_cache/update_$(date +%Y%m%d).log
mkdir -p data_cache
{
  echo "==== update start $(date '+%F %T') ===="
  for mod in klines cb emotion; do
    echo "--- module: $mod ---"
    python3 scripts/fetch_data.py "$mod" || echo "!! module $mod failed"
  done
  echo "--- build ---"
  (cd web && npm run build) || echo "!! build failed"
  echo "==== update done $(date '+%F %T') ===="
} >> "$LOG" 2>&1
tail -5 "$LOG"

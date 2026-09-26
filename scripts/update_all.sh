#!/bin/bash
# 一键更新全部数据并重建前端。配合 cron 使用（工作日盘后）。
# 更新完成后自动提交推送数据变更（推送失败不影响本地更新）——push 会触发 Cloudflare Pages 重新发布。
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
  echo "--- push data ---"
  if ! git diff --quiet HEAD -- web/public/data 2>/dev/null; then
    git add web/public/data scripts
    git commit -q -m "data: 盘后更新 $(date +%F)" || echo "!! commit failed"
    git push || echo "!! push failed（数据已本地更新，稍后可手动 git push）"
  else
    echo "数据无变化，跳过提交"
  fi
  echo "==== update done $(date '+%F %T') ===="
} >> "$LOG" 2>&1
tail -5 "$LOG"

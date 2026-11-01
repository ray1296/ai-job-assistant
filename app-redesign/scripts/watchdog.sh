#!/usr/bin/env bash
# 看门狗：每分钟检查 5175 / 5173，不在就重新拉起（幂等，可放 cron）
set -u
cd /home/ubuntu/workspaces/competition
start_web() {
  if ! ss -lntn 2>/dev/null | grep -q ':5175 '; then
    ( cd app-redesign && setsid nohup env PORT=5175 HTTPS_PORT=5175 HTTP_PORT=5176 HOST=0.0.0.0 node server/index.mjs >> career-server.log 2>&1 < /dev/null & )
    echo "$(date '+%F %T') restarted 5175" >> app-redesign/watchdog.log
  fi
  if ! ss -lntn 2>/dev/null | grep -q ':5173 '; then
    ( cd app && setsid nohup env HTTPS_PORT=5173 HTTP_PORT=5174 HOST=0.0.0.0 node server/index.mjs >> career-server.log 2>&1 < /dev/null & )
    echo "$(date '+%F %T') restarted 5173" >> app-redesign/watchdog.log
  fi
}
start_web

#!/usr/bin/env bash
# إيقاف خوادم Safi: الباك إند (8601) والواجهة (3601)
for port in 8601 3601; do
  pids=$(lsof -ti tcp:$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "إيقاف المنفذ $port (PIDs: $pids)"
    kill $pids 2>/dev/null
    sleep 1
    pids=$(lsof -ti tcp:$port 2>/dev/null)   # إن بقي حيّاً، أجبره
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  else
    echo "المنفذ $port: لا شيء يعمل"
  fi
done
echo "✅ تم إيقاف خوادم Safi"

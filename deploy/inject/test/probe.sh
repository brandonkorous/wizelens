#!/bin/sh
# Runs inside the cluster: each sample must answer with a trace id, and keep that trace.
set -e
for svc in auto-node:5300 auto-dotnet:8080; do
  id=$(curl -s -D - -o /dev/null "http://$svc/api/products" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-wizelens-trace"{print $2}')
  if [ -z "$id" ]; then echo "FAIL: $svc answered with no X-WizeLens-Trace"; exit 1; fi
  sleep 2
  if ! curl -sf "http://$svc/_wizelens/api/traces/$id" | grep -q '"kind":"server"'; then echo "FAIL: $svc did not keep trace $id"; exit 1; fi
  echo "ok: $svc traced $id"
done

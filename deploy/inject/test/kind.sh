#!/usr/bin/env bash
# End to end in a kind cluster: install the chart, deploy both samples labeled for injection, check their requests are traced.
# Needs docker, kind, kubectl, helm, and the image built as wizelens-inject:ci. Usage: deploy/inject/test/kind.sh [cluster]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLUSTER="${1:-wizelens}"

docker build -q -t wizelens-sample-node:ci "$ROOT/samples/auto-node"
docker build -q -t wizelens-sample-dotnet:ci "$ROOT/samples/auto-dotnet"
for image in wizelens-inject:ci wizelens-sample-node:ci wizelens-sample-dotnet:ci; do kind load docker-image "$image" --name "$CLUSTER"; done

helm upgrade --install wl "$ROOT/deploy/inject/chart" --namespace wizelens --create-namespace --wait --timeout 3m \
  --set image.repository=wizelens-inject --set image.tag=ci --set image.pullPolicy=Never --set dashboard=true

kubectl create namespace shop --dry-run=client -o yaml | kubectl apply -f -
kubectl -n shop apply -f "$ROOT/deploy/inject/test/samples.yaml"
if ! kubectl -n shop rollout status deploy/auto-node --timeout=4m || ! kubectl -n shop rollout status deploy/auto-dotnet --timeout=4m; then
  kubectl -n shop describe pods; kubectl -n wizelens logs deploy/wl-wizelens-inject; exit 1
fi

for app in auto-node auto-dotnet; do
  injected=$(kubectl -n shop get pod -l "app=$app" -o jsonpath='{.items[0].metadata.annotations.wizelens\.dev/injected}')
  [ -n "$injected" ] || { echo "FAIL: $app was not injected"; exit 1; }
  echo "ok: $app injected as $injected"
done

kubectl -n shop delete pod probe --ignore-not-found
kubectl -n shop run probe --image=curlimages/curl:8.11.1 --restart=Never --command -- sh -c "$(cat "$ROOT/deploy/inject/test/probe.sh")"
kubectl -n shop wait pod/probe --for=jsonpath='{.status.phase}'=Succeeded --timeout=2m || { kubectl -n shop logs probe; kubectl -n shop logs deploy/auto-node; kubectl -n shop logs deploy/auto-dotnet; exit 1; }
kubectl -n shop logs probe

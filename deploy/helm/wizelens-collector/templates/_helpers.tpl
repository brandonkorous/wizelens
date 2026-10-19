{{- define "wlc.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "wlc.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "wlc.labels" -}}
app.kubernetes.io/name: {{ include "wlc.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "wlc.selector" -}}
app.kubernetes.io/name: {{ include "wlc.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "wlc.serviceAccount" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "wlc.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "wlc.secretName" -}}
{{- default (printf "%s-ingest" (include "wlc.fullname" .)) .Values.existingSecret.name -}}
{{- end -}}

{{- define "wlc.secretKey" -}}
{{- if .Values.existingSecret.name -}}{{ .Values.existingSecret.key }}{{- else -}}ingest-key{{- end -}}
{{- end -}}

{{/* Processors both collectors share: memory limit (a fixed size: cgroup detection fails with the host's / mounted), batching, and the cluster, environment, and project on everything. Called with (dict "root" $ "mib" <limit>). */}}
{{- define "wlc.processors" -}}
{{- $v := .root.Values -}}
memory_limiter:
  check_interval: 1s
  limit_mib: {{ .mib }}
  spike_limit_mib: {{ div .mib 4 }}
batch:
  send_batch_size: 1024
  send_batch_max_size: 2048
  timeout: 10s
resource/wizelens:
  attributes:
    - { key: wizelens.collector.version, value: {{ .root.Chart.Version | quote }}, action: insert }
    {{- with $v.clusterName }}
    - { key: k8s.cluster.name, value: {{ . | quote }}, action: upsert }
    {{- end }}
    {{- with $v.environment }}
    - { key: deployment.environment.name, value: {{ . | quote }}, action: insert }
    {{- end }}
    {{- with $v.project }}
    - { key: wizelens.project, value: {{ . | quote }}, action: insert }
    {{- end }}
{{- end -}}

{{/* Where both collectors send: OTLP/HTTP to the hub or the cloud, with the ingest key (or hub token) as a bearer token. */}}
{{- define "wlc.exporters" -}}
otlphttp/wizelens:
  endpoint: "${env:WIZELENS_ENDPOINT}"
  compression: gzip
  headers:
    Authorization: "Bearer ${env:WIZELENS_INGEST_KEY}"
  retry_on_failure:
    enabled: true
    max_elapsed_time: 300s
{{- end -}}

{{/* The k8sattributes processor: pod, namespace, node, and workload names from the Kubernetes API. */}}
{{- define "wlc.k8sattributes" -}}
auth_type: serviceAccount
passthrough: false
extract:
  metadata:
    - k8s.namespace.name
    - k8s.pod.name
    - k8s.pod.uid
    - k8s.node.name
    - k8s.deployment.name
    - k8s.statefulset.name
    - k8s.daemonset.name
    - k8s.job.name
    - k8s.cronjob.name
pod_association:
  - sources: [{ from: resource_attribute, name: k8s.pod.uid }]
  - sources: [{ from: resource_attribute, name: k8s.pod.ip }]
  - sources: [{ from: connection }]
{{- end -}}

{{/* Env vars every collector pod reads. */}}
{{- define "wlc.env" -}}
- name: MY_POD_IP
  valueFrom: { fieldRef: { fieldPath: status.podIP } }
- name: K8S_NODE_NAME
  valueFrom: { fieldRef: { fieldPath: spec.nodeName } }
- name: K8S_NODE_IP
  valueFrom: { fieldRef: { fieldPath: status.hostIP } }
- name: WIZELENS_ENDPOINT
  value: {{ .Values.endpoint | trimSuffix "/" | quote }}
- name: WIZELENS_INGEST_KEY
  valueFrom:
    secretKeyRef:
      name: {{ include "wlc.secretName" . }}
      key: {{ include "wlc.secretKey" . }}
      optional: true
- name: GOMEMLIMIT
  valueFrom: { resourceFieldRef: { resource: limits.memory, divisor: "1" } }
{{- end -}}

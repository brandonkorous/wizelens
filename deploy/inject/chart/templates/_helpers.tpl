{{- define "wizelens-inject.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "wizelens-inject.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}

{{- define "wizelens-inject.labels" -}}
app.kubernetes.io/name: wizelens-inject
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "wizelens-inject.selector" -}}
app.kubernetes.io/name: wizelens-inject
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

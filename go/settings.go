package wizelens

import (
	"math"
	"os"
	"strconv"
	"strings"
)

// DefaultRedactKeys are key fragments whose values are replaced with "[redacted]".
var DefaultRedactKeys = []string{"authorization", "cookie", "password", "passwd", "secret", "token", "apikey", "api_key", "connectionstring"}

// Redacted replaces sensitive values.
const Redacted = "[redacted]"

// BodyLimit is the most of a body that is kept.
const BodyLimit = 16 * 1024

// Settings is what WizeLens turns on. Every field has a WIZELENS_* environment variable.
type Settings struct {
	Enabled              bool
	Hub                  string
	Token                string
	Project              string
	SampleRate           float64
	KeepErrors           bool
	KeepSlowMs           *float64
	CaptureBody          bool
	CaptureSQLParameters bool
	CaptureHeaders       bool
	ReportPackages       bool
	RedactKeys           []string
}

// SettingsFromEnv reads the WIZELENS_* environment variables.
func SettingsFromEnv() Settings {
	return SettingsFrom(os.Getenv)
}

// SettingsFrom reads WIZELENS_* names from any lookup.
func SettingsFrom(env func(string) string) Settings {
	redact := append([]string{}, DefaultRedactKeys...)
	for _, k := range strings.Split(env("WIZELENS_REDACT_KEYS"), ",") {
		if k = strings.TrimSpace(k); k != "" {
			redact = append(redact, strings.ToLower(k))
		}
	}
	hub := strings.TrimRight(env("WIZELENS_HUB"), "/")
	if hub == "" {
		hub = "http://localhost:5960"
	}
	return Settings{
		Enabled:              flag(env("WIZELENS_ENABLED"), true),
		Hub:                  hub,
		Token:                env("WIZELENS_HUB_TOKEN"),
		Project:              env("WIZELENS_PROJECT"),
		SampleRate:           rate(env("WIZELENS_SAMPLE_RATE")),
		KeepErrors:           flag(env("WIZELENS_KEEP_ERRORS"), true),
		KeepSlowMs:           slow(env("WIZELENS_KEEP_SLOW_MS")),
		CaptureBody:          flag(env("WIZELENS_CAPTURE_BODY"), false),
		CaptureSQLParameters: flag(env("WIZELENS_CAPTURE_SQL_PARAMETERS"), true),
		CaptureHeaders:       flag(env("WIZELENS_CAPTURE_HEADERS"), true),
		ReportPackages:       flag(env("WIZELENS_PACKAGES"), true),
		RedactKeys:           redact,
	}
}

// IsSensitive reports whether the key (case-insensitive) contains a sensitive fragment.
func (s Settings) IsSensitive(key string) bool {
	k := strings.ToLower(key)
	for _, frag := range s.RedactKeys {
		if strings.Contains(k, frag) {
			return true
		}
	}
	return false
}

func flag(v string, fallback bool) bool {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func rate(v string) float64 {
	r, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
	if err != nil || math.IsNaN(r) {
		return 1
	}
	return math.Min(1, math.Max(0, r))
}

func slow(v string) *float64 {
	v = strings.ToLower(strings.TrimSpace(v))
	switch v {
	case "off", "none", "null", "false":
		return nil
	}
	ms, err := strconv.ParseFloat(v, 64)
	if err != nil {
		ms = 1000
	}
	return &ms
}

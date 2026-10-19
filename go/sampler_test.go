package wizelens

import (
	"reflect"
	"testing"
	"time"
)

const (
	inRate  = "0af7651916cd43dd8448eb2100000000"
	outRate = "0af7651916cd43dd8448eb21ffffffff"
)

type sent []string

func (s *sent) send(name string) func() { return func() { *s = append(*s, name) } }

func TestKeepByRateMatchesTheAddOns(t *testing.T) {
	cases := []struct {
		id   string
		rate float64
		want bool
	}{
		{outRate, 1, true}, {inRate, 0, false}, {inRate, 0.5, true}, {outRate, 0.5, false},
		{"00000000000000000000000080000000", 0.6, true}, {"00000000000000000000000080000000", 0.4, false},
	}
	for _, c := range cases {
		if got := KeepByRate(c.id, c.rate); got != c.want {
			t.Errorf("KeepByRate(%s, %v) = %v", c.id, c.rate, got)
		}
	}
}

func TestOutsideTheRateWaitsForTheRootThenDrops(t *testing.T) {
	var got sent
	s := NewTraceSampler(0.5)
	s.Offer(outRate, false, false, got.send("child"))
	if s.Pending() != 1 {
		t.Fatal("child should wait")
	}
	s.Offer(outRate, false, true, got.send("root"))
	s.Offer(outRate, false, false, got.send("late"))
	if len(got) != 0 || s.Pending() != 0 {
		t.Fatalf("got %v", got)
	}
}

func TestAnErrorKeepsTheHeldSpans(t *testing.T) {
	var got sent
	s := NewTraceSampler(0)
	s.Offer(outRate, false, false, got.send("query"))
	s.Offer(outRate, true, false, got.send("failed"))
	s.Offer(outRate, false, true, got.send("root"))
	if !reflect.DeepEqual([]string(got), []string{"query", "failed", "root"}) {
		t.Fatalf("got %v", got)
	}
}

func TestAnErrorAfterADropKeepsTheRest(t *testing.T) {
	var got sent
	s := NewTraceSampler(0)
	s.Offer(outRate, false, true, got.send("root"))
	s.Offer(outRate, true, false, got.send("error log"))
	s.Offer(outRate, false, false, got.send("after"))
	if !reflect.DeepEqual([]string(got), []string{"error log", "after"}) {
		t.Fatalf("got %v", got)
	}
}

func TestATraceWhoseRootNeverEndsIsDroppedLater(t *testing.T) {
	var got sent
	clock := time.Unix(0, 0)
	s := NewTraceSampler(0)
	s.now = func() time.Time { return clock }
	s.Offer(outRate, false, false, got.send("orphan"))
	clock = clock.Add(holdFor + time.Second)
	s.Offer(inRate, false, true, got.send("other"))
	s.Offer(outRate, false, false, got.send("late"))
	if len(got) != 0 || s.Pending() != 0 {
		t.Fatalf("got %v, pending %d", got, s.Pending())
	}
}

func TestSettings(t *testing.T) {
	d := SettingsFrom(func(string) string { return "" })
	if !d.Enabled || d.Hub != "http://localhost:5960" || d.SampleRate != 1 || *d.KeepSlowMs != 1000 || d.CaptureBody || !d.CaptureSQLParameters {
		t.Fatalf("defaults: %+v", d)
	}
	env := map[string]string{"WIZELENS_HUB": "https://app.wizelens.com/", "WIZELENS_SAMPLE_RATE": "0.25", "WIZELENS_KEEP_SLOW_MS": "off", "WIZELENS_REDACT_KEYS": "ssn"}
	s := SettingsFrom(func(k string) string { return env[k] })
	if s.Hub != "https://app.wizelens.com" || s.SampleRate != 0.25 || s.KeepSlowMs != nil || !s.IsSensitive("customer_SSN") {
		t.Fatalf("read: %+v", s)
	}
	if SettingsFrom(func(k string) string { return map[string]string{"WIZELENS_SAMPLE_RATE": "lots"}[k] }).SampleRate != 1 {
		t.Fatal("a bad rate keeps everything")
	}
}

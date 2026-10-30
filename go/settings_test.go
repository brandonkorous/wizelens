package wizelens

import (
	"bytes"
	"log"
	"strings"
	"testing"
)

func TestOldSendNamesAreNotRead(t *testing.T) {
	env := map[string]string{"WIZELENS_HUB": "https://old.example", "WIZELENS_HUB_TOKEN": "old"}
	s := SettingsFrom(func(k string) string { return env[k] })
	if s.Endpoint != "http://localhost:5960" || s.Token != "" {
		t.Fatalf("old names read: %+v", s)
	}
}

func TestOnOffValuesAndABadValueWarnsOnce(t *testing.T) {
	one := func(v string) func(string) string { return func(string) string { return v } }
	for _, on := range []string{"true", "1", "ON", "Yes"} {
		if !envFlag(one(on), "WIZELENS_TEST_ON", false) {
			t.Fatalf("%q is on", on)
		}
	}
	for _, off := range []string{"false", "0", "Off", "NO"} {
		if envFlag(one(off), "WIZELENS_TEST_OFF", true) {
			t.Fatalf("%q is off", off)
		}
	}
	var out bytes.Buffer
	defer log.SetOutput(log.Writer())
	log.SetOutput(&out)
	if !envFlag(one("maybe"), "WIZELENS_TEST_BAD", true) || !envFlag(one("nah"), "WIZELENS_TEST_BAD", true) {
		t.Fatal("a bad value keeps the fallback")
	}
	if n := strings.Count(out.String(), "WIZELENS_TEST_BAD"); n != 1 {
		t.Fatalf("warned %d times: %s", n, out.String())
	}
}

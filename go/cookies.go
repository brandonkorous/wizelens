package wizelens

import (
	"regexp"
	"strings"
)

var cookieStart = regexp.MustCompile(`^[^;,\s=]+=`)

// splitSetCookie splits one Set-Cookie value at ", " before the next name=, so an Expires date stays whole.
func splitSetCookie(value string) []string {
	parts := strings.Split(value, ",")
	out := []string{parts[0]}
	for _, p := range parts[1:] {
		if cookieStart.MatchString(strings.TrimLeft(p, " \t")) {
			out = append(out, strings.TrimLeft(p, " \t"))
		} else {
			out[len(out)-1] += "," + p
		}
	}
	return out
}

// redactSetCookie hides each cookie's value and keeps its name and flags: sid=[redacted]; Path=/; HttpOnly.
func redactSetCookie(value string) string {
	cookies := splitSetCookie(value)
	for i, c := range cookies {
		head, rest, found := strings.Cut(c, ";")
		name, _, _ := strings.Cut(head, "=")
		cookies[i] = strings.TrimSpace(name) + "=" + Redacted
		if found {
			cookies[i] += ";" + rest
		}
	}
	return strings.Join(cookies, ", ")
}

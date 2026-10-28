package wizelens

// Which column each SQL parameter is bound to, so its value can be redacted by that column's name.

import (
	"regexp"
	"strconv"
	"strings"
)

// SQLParamKeys are column names whose values are never kept in SQL parameters, besides the redact keys: personal data, and ASP.NET Identity's SecurityStamp (it signs a user's sign-in cookies).
var SQLParamKeys = []string{"email", "securitystamp", "security_stamp"}

// One placeholder: $1, @name, :name (not a :: cast, checked in keyOf), %(name)s; `?` and `%s` are numbered first.
const placeholder = `(?:\$(\d+)|([@:])([A-Za-z_]\w*)|%\((\w+)\)s)`

var (
	quotedRe      = regexp.MustCompile(`'(?:[^']|'')*'`)
	castRe        = regexp.MustCompile(`::\w+`)
	dollarRe      = regexp.MustCompile(`\$\d`)
	positionalRe  = regexp.MustCompile(`\?|%s`)
	placeholderRe = regexp.MustCompile(placeholder)
	comparedRe    = regexp.MustCompile(`(?i)([\w"` + "`" + `\]]+)\s*(?:=|!=|<>|<=|>=|<|>|\s(?:i?like|in)\s*\(?)\s*` + placeholder)
	insertRe      = regexp.MustCompile(`(?i)insert\s+into\s+[\w".` + "`" + `\[\]]+\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)`)
	bareReplacer  = strings.NewReplacer("`", "", `"`, "", "[", "", "]", "")
)

func bare(ident string) string {
	parts := strings.Split(bareReplacer.Replace(ident), ".")
	return strings.TrimSpace(parts[len(parts)-1])
}

func isWord(b byte) bool {
	return b == '_' || b >= '0' && b <= '9' || b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z'
}

// keyOf is the key a placeholder match stands for: "0" for $1 (zero-based), else its name; "" for @name or :name after ":" or a word.
func keyOf(text string, m []int, at int) string {
	group := func(g int) string {
		if m[2*g] < 0 {
			return ""
		}
		return text[m[2*g]:m[2*g+1]]
	}
	if d := group(at); d != "" {
		n, _ := strconv.Atoi(d)
		return strconv.Itoa(n - 1)
	}
	if s := m[2*(at+1)]; s >= 0 {
		if s > 0 && (text[s-1] == ':' || isWord(text[s-1])) {
			return ""
		}
		return group(at + 2)
	}
	return group(at + 3)
}

// normalized empties quoted text, drops `::type` casts, and numbers `?` and `%s` as `$1`, `$2`…, so one parser reads every style.
func normalized(sql string) string {
	text := castRe.ReplaceAllLiteralString(quotedRe.ReplaceAllLiteralString(sql, "''"), "")
	if dollarRe.MatchString(text) {
		return text
	}
	n := 0
	return positionalRe.ReplaceAllStringFunc(text, func(string) string {
		n++
		return "$" + strconv.Itoa(n)
	})
}

// insertColumns adds the columns of `insert into t (a, b) values ($1, default, @b)`, by parameter key.
func insertColumns(text string, out map[string]string) {
	m := insertRe.FindStringSubmatch(text)
	if m == nil {
		return
	}
	cols := strings.Split(m[1], ",")
	for i, v := range strings.Split(m[2], ",") {
		v = strings.TrimSpace(v)
		p := placeholderRe.FindStringSubmatchIndex(v)
		if p == nil || i >= len(cols) {
			continue
		}
		if col, key := bare(cols[i]), keyOf(v, p, 1); col != "" && key != "" {
			out[key] = col
		}
	}
}

// paramColumns is the column each parameter is compared with or set to, by position ("0" for $1, ? and %s) or name: "t"."token" = $1 gives "0" → token.
func paramColumns(sql string) map[string]string {
	text := normalized(sql)
	out := map[string]string{}
	for _, m := range comparedRe.FindAllStringSubmatchIndex(text, -1) {
		if key := keyOf(text, m, 2); key != "" {
			out[key] = bare(text[m[2]:m[3]])
		}
	}
	insertColumns(text, out)
	return out
}

// unsigiled is a parameter name without its leading @, : or $, as the SQL text names it.
func unsigiled(name string) string {
	if name != "" && strings.ContainsRune("@:$", rune(name[0])) {
		return name[1:]
	}
	return name
}

// paramValue is one value: redacted when its name or its column is sensitive.
func paramValue(v any, s Settings, names ...string) any {
	personal := Settings{RedactKeys: SQLParamKeys}
	for _, n := range names {
		if n != "" && (s.IsSensitive(n) || personal.IsSensitive(n)) {
			return Redacted
		}
	}
	return plain(v)
}

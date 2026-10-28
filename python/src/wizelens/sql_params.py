"""Which column each SQL parameter is bound to, so its value can be redacted by that column's name."""

from __future__ import annotations

import itertools
import re
from typing import Dict, Tuple

# Column names whose values are never kept in SQL parameters, besides the redact keys: personal data, and ASP.NET Identity's SecurityStamp (it signs a user's sign-in cookies).
SQL_PARAM_KEYS: Tuple[str, ...] = ("email", "securitystamp", "security_stamp")

# One placeholder: $1, @name, :name (not a :: cast), %(name)s; `?` and `%s` are numbered first.
_PLACEHOLDER = r"(?:\$(\d+)|(?<![:\w])[@:]([A-Za-z_]\w*)|%\((\w+)\)s)"
_FLAGS = re.ASCII | re.IGNORECASE
_PLACEHOLDER_RE = re.compile(_PLACEHOLDER, _FLAGS)
_COMPARED_RE = re.compile(r"([\w\"`\]]+)\s*(?:=|!=|<>|<=|>=|<|>|\s(?:i?like|in)\s*\(?)\s*" + _PLACEHOLDER, _FLAGS)
_INSERT_RE = re.compile(r"insert\s+into\s+[\w\".`\[\]]+\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)", _FLAGS)
_QUOTED_RE = re.compile(r"'(?:[^']|'')*'")
_CAST_RE = re.compile(r"::\w+", re.ASCII)


def _bare(ident: str) -> str:
    return re.sub(r"[`\"\[\]]", "", ident).split(".")[-1].strip()


def unsigiled(name: str) -> str:
    """A parameter name without its leading @, : or $, as the SQL text names it."""
    return name[1:] if name[:1] in ("@", ":", "$") else name


def _key_of(m: "re.Match[str]", at: int) -> str:
    """The key a placeholder match stands for: "0" for $1 (zero-based), else its name."""
    if m.group(at):
        return str(int(m.group(at)) - 1)
    return m.group(at + 1) or m.group(at + 2)


def _normalized(sql: str) -> str:
    """Quoted text emptied, `::type` casts dropped, and `?` and `%s` numbered as `$1`, `$2`..., so one parser reads every style."""
    text = _CAST_RE.sub("", _QUOTED_RE.sub("''", sql))
    if re.search(r"\$\d", text):
        return text
    n = itertools.count(1)
    return re.sub(r"\?|%s", lambda _: f"${next(n)}", text)


def _insert_columns(sql: str, out: Dict[str, str]) -> None:
    """Columns of `insert into t (a, b) values ($1, default, @b)`, by parameter key."""
    m = _INSERT_RE.search(sql)
    if not m:
        return
    cols = [_bare(c) for c in m.group(1).split(",")]
    for i, v in enumerate(m.group(2).split(",")):
        p = _PLACEHOLDER_RE.search(v.strip())
        if p and i < len(cols) and cols[i]:
            out[_key_of(p, 1)] = cols[i]


def param_columns(sql: str) -> Dict[str, str]:
    """The column each parameter is compared with or set to, by position ("0" for $1, ? and %s) or name: `"t"."token" = $1` gives "0" -> token."""
    text = _normalized(sql)
    out: Dict[str, str] = {}
    for m in _COMPARED_RE.finditer(text):
        out[_key_of(m, 2)] = _bare(m.group(1))
    _insert_columns(text, out)
    return out

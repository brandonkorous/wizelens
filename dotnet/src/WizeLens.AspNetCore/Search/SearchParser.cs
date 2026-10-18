// Parses a search into a tree: OR binds loosest, then AND (also implied by a space), then NOT and `-`.
namespace WizeLens.Search;

public static class SearchParser
{
    /// <summary>The tree of a search, or null when it matches everything. Throws a <see cref="SearchError"/> with a position.</summary>
    public static SearchNode? Parse(string src)
    {
        if (src.Length > SearchLimits.Chars)
            throw new SearchError($"A search can be at most {SearchLimits.Chars} characters.", SearchLimits.Chars, src.Length);
        return new Parser(src, SearchLexer.Lex(src)).Parse();
    }

    private sealed class Parser(string src, List<SearchToken> tokens)
    {
        private int _i;
        private int _terms;

        public SearchNode? Parse()
        {
            if (tokens.Count == 0) return null;
            var node = Or(0);
            if (_i < tokens.Count)
            {
                var extra = tokens[_i];
                throw new SearchError(extra.Type == ")" ? "This ) has no matching (." : "Unexpected text.", extra.Start, extra.End);
            }
            return SearchTerms.IsEmpty(node) ? null : node;
        }

        private SearchNode Or(int depth)
        {
            if (Peek("OR")) throw new SearchError("OR needs something before it.", tokens[_i].Start, tokens[_i].End);
            var items = new List<SearchNode> { And(depth) };
            while (Peek("OR"))
            {
                var op = tokens[_i++];
                if (AtEnd() || Peek("OR")) throw new SearchError("OR needs something after it.", op.Start, op.End);
                items.Add(And(depth));
            }
            return SearchTerms.Join(false, items);
        }

        private SearchNode And(int depth)
        {
            var items = new List<SearchNode>();
            while (!AtEnd() && !Peek("OR"))
            {
                if (Peek("AND"))
                {
                    var op = tokens[_i++];
                    if (items.Count == 0 || AtEnd()) throw new SearchError("AND needs something on both sides.", op.Start, op.End);
                }
                if (Unary(depth) is { } node) items.Add(node);
            }
            return SearchTerms.Join(true, items);
        }

        private SearchNode? Unary(int depth)
        {
            if (depth > SearchLimits.Depth) throw new SearchError("Too many nested parts.", tokens[_i].Start, src.Length);
            var t = tokens[_i++];
            if (t.Type == "NOT") return Negate(t, depth);
            if (t.Type == "(") return Group(t, depth);
            if (t.Type != SearchToken.Term) throw new SearchError($"Unexpected {t.Type}.", t.Start, t.End);
            if (++_terms > SearchLimits.Terms) throw new SearchError($"A search can have at most {SearchLimits.Terms} parts.", t.Start, t.End);
            if (t.Neg && t.Chars.Count == 0) return Negate(t, depth);
            return SearchTerms.TermNode(t);
        }

        private NotNode Negate(SearchToken t, int depth)
        {
            if (AtEnd() || Peek(")") || Peek("OR")) throw new SearchError("NOT needs something after it.", t.Start, t.End);
            return new NotNode(Unary(depth + 1) ?? new AndNode([]));
        }

        private SearchNode? Group(SearchToken open, int depth)
        {
            if (Peek(")")) throw new SearchError("These parentheses are empty.", open.Start, tokens[_i].End);
            var node = Or(depth + 1);
            if (!Peek(")")) throw new SearchError("This ( is never closed.", open.Start, open.End);
            _i++;
            return SearchTerms.IsEmpty(node) ? null : node;
        }

        private bool Peek(string type) => _i < tokens.Count && tokens[_i].Type == type;

        private bool AtEnd() => _i >= tokens.Count || Peek(")");
    }
}

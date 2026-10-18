// Splits a search into tokens. Quoted and escaped characters are literal: they never act as syntax.
namespace WizeLens.Search;

/// <summary>One character of a term; <c>Lit</c> when it was quoted or escaped.</summary>
public readonly record struct Ch(char C, bool Lit);

/// <summary>A token: "(", ")", "OR", "AND", "NOT", or "term" (with its characters and a leading <c>-</c>).</summary>
public sealed record SearchToken(string Type, int Start, int End, IReadOnlyList<Ch> Chars, bool Neg = false)
{
    public const string Term = "term";
}

public static class SearchLexer
{
    private static readonly HashSet<string> Keywords = new(StringComparer.Ordinal) { "OR", "AND", "NOT" };

    /// <summary>Reads a quoted part starting at <paramref name="i"/> (the quote). Returns the index after the closing quote.</summary>
    private static int ReadQuoted(string src, int i, List<Ch> output)
    {
        var j = i + 1;
        while (j < src.Length && src[j] != '"')
        {
            if (src[j] == '\\' && j + 1 < src.Length) j++;
            output.Add(new Ch(src[j], true));
            j++;
        }
        if (j >= src.Length) throw new SearchError("This quote is never closed.", i, src.Length);
        return j + 1;
    }

    /// <summary>Reads one term from <paramref name="i"/> up to a space or an unquoted parenthesis.</summary>
    private static (List<Ch> Chars, int End) ReadTerm(string src, int i)
    {
        var chars = new List<Ch>();
        var j = i;
        while (j < src.Length && !JsText.IsSpace(src[j]) && src[j] != '(' && src[j] != ')')
        {
            if (src[j] == '"') j = ReadQuoted(src, j, chars);
            else if (src[j] == '\\' && j + 1 < src.Length)
            {
                chars.Add(new Ch(src[j + 1], true));
                j += 2;
            }
            else chars.Add(new Ch(src[j++], false));
        }
        return (chars, j);
    }

    /// <summary>The text of the characters when none is literal; else null.</summary>
    private static string? Plain(IReadOnlyList<Ch> chars) => chars.All(ch => !ch.Lit) ? Text(chars) : null;

    internal static string Text(IEnumerable<Ch> chars) => string.Concat(chars.Select(ch => ch.C));

    /// <summary>The tokens of a search, in order.</summary>
    public static List<SearchToken> Lex(string src)
    {
        var output = new List<SearchToken>();
        var i = 0;
        while (i < src.Length)
        {
            var c = src[i];
            if (JsText.IsSpace(c)) i++;
            else if (c is '(' or ')') output.Add(new SearchToken(c.ToString(), i, ++i, []));
            else i = LexTerm(src, i, output);
        }
        return output;
    }

    /// <summary>Adds the term or keyword at <paramref name="i"/>; returns the index after it.</summary>
    private static int LexTerm(string src, int i, List<SearchToken> output)
    {
        var neg = src[i] == '-' && i + 1 < src.Length && !JsText.IsSpace(src[i + 1]);
        var (chars, end) = ReadTerm(src, neg ? i + 1 : i);
        var word = Plain(chars);
        if (!neg && word is not null && Keywords.Contains(word)) output.Add(new SearchToken(word, i, end, []));
        else if (chars.Count > 0 || neg) output.Add(new SearchToken(SearchToken.Term, i, end, chars, neg));
        else if (end == i) throw new SearchError("Unexpected character.", i, i + 1);
        return end;
    }
}

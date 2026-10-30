// A parse that never throws, for APIs: the tree, or an error with its position.
namespace WizeLens.Search;

/// <summary>The result of <see cref="SearchCheck.Check"/>: Ok with the tree, or the error and its span.</summary>
internal sealed record SearchCheckResult(bool Ok, SearchNode? Node, string? Error = null, int Start = 0, int End = 0);

internal static class SearchCheck
{
    public static SearchCheckResult Check(string src)
    {
        try
        {
            return new SearchCheckResult(true, SearchParser.Parse(src));
        }
        catch (SearchError err)
        {
            return new SearchCheckResult(false, null, err.Message, err.Start, err.End);
        }
    }
}

using WizeLens.Model;

namespace WizeLens.Web;

/// <summary>The server a browser span says answered it. Kept only on the page's own origin, so a page cannot point the federation at any URL.</summary>
internal static class ClientRemote
{
    public const string Attribute = "wizelens.browser.remote";

    public static string? Of(Span span, string? origin)
    {
        var remote = span.Attr(Attribute);
        if (string.IsNullOrEmpty(remote) || string.IsNullOrEmpty(origin)) return null;
        if (!Uri.TryCreate(remote, UriKind.Absolute, out var url)) return null;
        if (url.Scheme != Uri.UriSchemeHttp && url.Scheme != Uri.UriSchemeHttps) return null;
        var sameOrigin = string.Equals(url.GetLeftPart(UriPartial.Authority), origin, StringComparison.OrdinalIgnoreCase);
        return sameOrigin ? remote.TrimEnd('/') : null;
    }
}

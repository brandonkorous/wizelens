using WizeLens.Model;

namespace WizeLens.Web;

/// <summary>The server a browser span says answered it. Kept on the page's own origin or a trusted one, so a page cannot point the federation at any URL.</summary>
internal static class ClientRemote
{
    public const string Attribute = "wizelens.browser.remote";

    public static string? Of(Span span, string? origin, IReadOnlySet<string>? trusted = null)
    {
        var remote = span.Attr(Attribute);
        if (string.IsNullOrEmpty(remote) || string.IsNullOrEmpty(origin)) return null;
        if (!Uri.TryCreate(remote, UriKind.Absolute, out var url)) return null;
        if (url.Scheme != Uri.UriSchemeHttp && url.Scheme != Uri.UriSchemeHttps) return null;
        var authority = url.GetLeftPart(UriPartial.Authority);
        var allowed = string.Equals(authority, origin, StringComparison.OrdinalIgnoreCase) || trusted?.Contains(authority) == true;
        return allowed ? remote.TrimEnd('/') : null;
    }

    /// <summary>The origins (scheme, host, port) of <see cref="WizeLensOptions.TrustedRemotes"/>; bad entries are left out.</summary>
    public static IReadOnlySet<string> Origins(IEnumerable<string> remotes) => remotes
        .Select(r => Uri.TryCreate(r.Trim(), UriKind.Absolute, out var u) ? u.GetLeftPart(UriPartial.Authority) : null)
        .OfType<string>()
        .ToHashSet(StringComparer.OrdinalIgnoreCase);
}

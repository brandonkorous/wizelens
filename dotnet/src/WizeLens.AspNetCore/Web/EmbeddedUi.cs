using System.Reflection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;

namespace WizeLens.Web;

/// <summary>Serves the dashboard built by js/packages/ui and embedded into this assembly at build time.</summary>
internal static class EmbeddedUi
{
    private const string Prefix = "ui/";

    private static readonly Assembly Assembly = typeof(EmbeddedUi).Assembly;
    // Normalized name ("ui/assets/app.js") -> manifest name. RecursiveDir may use '\' on Windows.
    private static readonly Dictionary<string, string> Resources = Assembly.GetManifestResourceNames()
        .Where(n => n.StartsWith(Prefix, StringComparison.Ordinal))
        .ToDictionary(n => n.Replace('\\', '/'), n => n, StringComparer.Ordinal);

    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    public static bool IsBuilt => Resources.ContainsKey(Prefix + "index.html");

    public static async Task ServeAsync(HttpContext context, string? path)
    {
        path = (path ?? "").Replace('\\', '/').TrimStart('/');
        if (path.Contains("..", StringComparison.Ordinal)) path = "";

        if (!IsBuilt)
        {
            context.Response.ContentType = "text/html; charset=utf-8";
            await context.Response.WriteAsync(FallbackHtml);
            return;
        }

        var name = Prefix + (path.Length == 0 ? "index.html" : path);
        if (!Resources.ContainsKey(name))
        {
            // Unknown files with an extension are real 404s. Everything else falls back to the SPA shell.
            if (Path.HasExtension(path))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }
            name = Prefix + "index.html";
        }

        context.Response.ContentType = ContentTypes.TryGetContentType(name, out var type) ? type : "application/octet-stream";
        // The page and its build id must always be fresh; the hashed files never change.
        context.Response.Headers.CacheControl = name.EndsWith("index.html", StringComparison.Ordinal) || name.EndsWith("version.json", StringComparison.Ordinal)
            ? "no-cache"
            : "public, max-age=31536000, immutable";

        await using var stream = Assembly.GetManifestResourceStream(Resources[name])!;
        await stream.CopyToAsync(context.Response.Body, context.RequestAborted);
    }

    private const string FallbackHtml = """
        <!doctype html>
        <html lang="en">
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>WizeLens</title></head>
        <body style="font-family: system-ui, sans-serif; padding: 2rem;">
          <h1>WizeLens</h1>
          <p>UI not built — run <code>pnpm build</code> at the repo root, then rebuild this app.</p>
          <p>The JSON API still works: <a href="api/traces">api/traces</a></p>
        </body>
        </html>
        """;
}

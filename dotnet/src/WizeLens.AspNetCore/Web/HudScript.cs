using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WizeLens.Web;

/// <summary>Serves the lens-browser script-tag bundle, embedded at build time, at <c>{base}/wizelens.js</c> and its source map.</summary>
internal static class HudScript
{
    private const string MapComment = "//# sourceMappingURL=";

    private static readonly Lazy<ScriptFile?> Script = new(() => Load("hud/wizelens.js", rewriteMap: true));
    private static readonly Lazy<ScriptFile?> Map = new(() => Load("hud/wizelens.js.map", rewriteMap: false));

    private static readonly ScriptFile Fallback = new(Encoding.UTF8.GetBytes(
        "console.info(\"WizeLens: the HUD script is not built. Run pnpm build at the repo root, then rebuild this app.\");\n"));

    /// <summary>True when this build has the bundle in it.</summary>
    public static bool IsBuilt => Script.Value is not null;

    public static void MapRoutes(IEndpointRouteBuilder group)
    {
        group.MapGet("wizelens.js", c => ServeAsync(c, Script.Value ?? Fallback, "application/javascript; charset=utf-8"));
        group.MapGet("wizelens.js.map", c => ServeAsync(c, Map.Value, "application/json; charset=utf-8"));
    }

    private static async Task ServeAsync(HttpContext context, ScriptFile? file, string contentType)
    {
        if (file is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        context.Response.Headers.CacheControl = "no-cache";
        context.Response.Headers.ETag = file.ETag;
        if (context.Request.Headers.IfNoneMatch.ToString().Contains(file.ETag, StringComparison.Ordinal))
        {
            context.Response.StatusCode = StatusCodes.Status304NotModified;
            return;
        }
        context.Response.ContentType = contentType;
        context.Response.ContentLength = file.Bytes.Length;
        await context.Response.Body.WriteAsync(file.Bytes, context.RequestAborted);
    }

    private static ScriptFile? Load(string name, bool rewriteMap)
    {
        using var stream = typeof(HudScript).Assembly.GetManifestResourceStream(name);
        if (stream is null) return null;
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        var bytes = memory.ToArray();
        return new(rewriteMap ? PointMap(bytes) : bytes);
    }

    // The bundle names its map wizelens.iife.js.map; served here it is wizelens.js.map, next to the script.
    private static byte[] PointMap(byte[] bytes)
    {
        var text = Encoding.UTF8.GetString(bytes);
        var at = text.LastIndexOf(MapComment, StringComparison.Ordinal);
        if (at < 0) return bytes;
        var end = text.IndexOf('\n', at);
        var tail = end < 0 ? "" : text[end..];
        return Encoding.UTF8.GetBytes(text[..at] + MapComment + "wizelens.js.map" + tail);
    }

    /// <summary>A served file and its validator.</summary>
    private sealed class ScriptFile(byte[] bytes)
    {
        public byte[] Bytes { get; } = bytes;

        public string ETag { get; } = "\"" + Convert.ToHexStringLower(SHA256.HashData(bytes))[..16] + "\"";
    }
}

using System.Net.Http.Json;
using System.Reflection;
using System.Text.Json;
using WizeLens.Capture;
using WizeLens.Web;

namespace WizeLens.Hub;

/// <summary>The NuGet packages the app runs, from its deps.json, sent to <c>POST {hub}/_wizelens/api/packages</c> once at start.</summary>
internal static class PackageReport
{
    private const int MaxPackages = 5000;
    private const int Retries = 5;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(1);

    public sealed record PackageItem(string Ecosystem, string Name, string Version);

    private sealed record Report(HubSenderInfo Sender, List<PackageItem> Packages);

    /// <summary>The <c>package</c> libraries of a deps.json (<c>"Name/1.2.3": { "type": "package" }</c>).</summary>
    public static List<PackageItem> FromDepsJson(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("libraries", out var libraries)) return [];
        return [.. libraries.EnumerateObject()
            .Where(l => l.Value.TryGetProperty("type", out var t) && t.GetString() == "package" && l.Name.Contains('/'))
            .Select(l => new PackageItem("NuGet", l.Name[..l.Name.LastIndexOf('/')], l.Name[(l.Name.LastIndexOf('/') + 1)..]))
            .DistinctBy(p => (p.Name, p.Version))
            .Take(MaxPackages)];
    }

    /// <summary>The entry app's deps.json, else the first one in the app folder; empty when there is none.</summary>
    public static List<PackageItem> List()
    {
        var dir = AppContext.BaseDirectory;
        var entry = Assembly.GetEntryAssembly()?.GetName().Name;
        var path = entry is not null && File.Exists(Path.Combine(dir, entry + ".deps.json")) ? Path.Combine(dir, entry + ".deps.json") : Directory.EnumerateFiles(dir, "*.deps.json").FirstOrDefault();
        try
        {
            return path is null ? [] : FromDepsJson(File.ReadAllText(path));
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return [];
        }
    }

    /// <summary>Send the list, retrying a few times while the hub cannot be reached. Never throws.</summary>
    public static async Task SendAsync(HttpClient client, string url, HubSenderInfo sender, CancellationToken stop)
    {
        WizeLensContext.Suppressed = true;
        var report = new Report(sender, List());
        for (var attempt = 1; attempt <= Retries && !stop.IsCancellationRequested; attempt++)
        {
            try
            {
                using var response = await client.PostAsJsonAsync($"{url}/_wizelens/api/packages", report, WizeLensJson.Options, stop).ConfigureAwait(false);
                if (response.IsSuccessStatusCode || (int)response.StatusCode is >= 400 and < 500 and not 429) return;
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
            }
            try
            {
                await Task.Delay(RetryDelay, stop).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }
}

using System.Diagnostics;
using Trace = WizeLens.Model.Trace;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using WizeLens.Model;
using WizeLens.Storage;
using WizeLens.Web;

namespace WizeLens.Tests;

/// <summary>samples/auto-dotnet has no WizeLens code. Started with DOTNET_STARTUP_HOOKS, it is traced.</summary>
[Collection(TestApp.Collection)]
public class StartupHookTests
{
    // dotnet/tests/WizeLens.Tests/bin/{Configuration}/net10.0
    private static readonly DirectoryInfo Bin = new(AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar));
    private static readonly string Configuration = Bin.Parent!.Name;
    private static readonly string Repo = Bin.Parent!.Parent!.Parent!.Parent!.Parent!.Parent!.FullName;

    private static string Built(params string[] parts)
    {
        var path = Path.Combine([Repo, .. parts]);
        Assert.True(File.Exists(path), $"Build the solution first: {path} is missing.");
        return path;
    }

    private static int FreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }

    private static Process StartSample(int port, string folder)
    {
        var info = new ProcessStartInfo("dotnet") { WorkingDirectory = folder, RedirectStandardOutput = true, RedirectStandardError = true };
        info.ArgumentList.Add(Built("samples", "auto-dotnet", "bin", Configuration, "net10.0", "AutoDotnet.dll"));
        info.Environment["DOTNET_STARTUP_HOOKS"] = Built("dotnet", "src", "WizeLens.AutoInstrumentation", "bin", Configuration, "net10.0", "WizeLens.AutoInstrumentation.dll");
        info.Environment["ASPNETCORE_URLS"] = $"http://127.0.0.1:{port}";
        info.Environment["ASPNETCORE_ENVIRONMENT"] = "Development";
        info.Environment["OTEL_SERVICE_NAME"] = "auto-dotnet";
        info.Environment.Remove("ASPNETCORE_HOSTINGSTARTUPASSEMBLIES");
        var process = Process.Start(info)!;
        process.OutputDataReceived += (_, _) => { };
        process.ErrorDataReceived += (_, _) => { };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static async Task<HttpResponseMessage> GetWhenUpAsync(HttpClient client, string path)
    {
        for (var i = 0; ; i++)
        {
            try
            {
                return await client.GetAsync(path);
            }
            catch (HttpRequestException) when (i < 150)
            {
                await Task.Delay(200);
            }
        }
    }

    [Fact]
    public async Task The_startup_hook_traces_an_app_with_no_WizeLens_code()
    {
        var folder = Directory.CreateTempSubdirectory("wl-hook-").FullName;
        var port = FreePort();
        using var process = StartSample(port, folder);
        try
        {
            using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };
            var response = await GetWhenUpAsync(client, "/api/products/1/related");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var traceId = Assert.Single(response.Headers.GetValues(WizeLensMiddleware.TraceHeader));
            var trace = await client.GetFromJsonAsync<Trace>($"/_wizelens/api/traces/{traceId}", WizeLensJson.Options);
            var root = Assert.Single(trace!.Spans, s => s.Category == SpanCategories.HttpServer);
            Assert.Equal(("auto-dotnet", "GET /api/products/{id:int}/related"), (root.Service, root.Name));
            Assert.Equal(3, trace.Spans.Count(s => s.Category == SpanCategories.Db && s.Attr("wizelens.db.adapter") == "efcore"));
        }
        finally
        {
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
        }
    }
}

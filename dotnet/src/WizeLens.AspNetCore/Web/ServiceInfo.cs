using System.Runtime.InteropServices;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using WizeLens.Storage;

namespace WizeLens.Web;

/// <summary>The <c>GET api/info</c> response (contract type ServiceInfo).</summary>
internal static class ServiceInfo
{
    public static IResult Create(WizeLensOptions options, IHostEnvironment environment, TraceStorageService storage) =>
        Results.Json(new
        {
            mode = "in-app",
            capabilities = options.MetricsOn ? new[] { "federation", "metrics" } : new[] { "federation" },
            service = options.ServiceName,
            version = typeof(ServiceInfo).Assembly.GetName().Version?.ToString(3) ?? "0.0.0",
            runtime = RuntimeInformation.FrameworkDescription,
            mcp = options.EnableMcp,
            environment = environment.EnvironmentName,
            host = Environment.MachineName,
            startedMs = options.StartedMs,
            storage = new
            {
                kind = storage.StoragePath is null ? "memory" : "sqlite",
                maxTraces = options.MaxTraces,
                maxAgeMs = options.MaxAge.TotalMilliseconds,
            },
            analysis = new { slowQueryMs = options.SlowQueryMs, nPlusOneThreshold = options.NPlusOneThreshold },
            redactKeys = options.RedactKeys,
            captureResponseBody = options.CaptureResponseBody,
            project = string.IsNullOrWhiteSpace(options.Project) ? null : options.Project,
            hub = options.NormalizedHubUrl,
        }, WizeLensJson.Options);
}

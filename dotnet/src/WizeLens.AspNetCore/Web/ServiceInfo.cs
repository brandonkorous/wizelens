using System.Runtime.InteropServices;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using WizeLens.Hub;
using WizeLens.Storage;

namespace WizeLens.Web;

/// <summary>The <c>GET api/info</c> response (contract type ServiceInfo).</summary>
internal static class ServiceInfo
{
    public static IResult Create(WizeLensOptions options, IHostEnvironment environment, TraceStorageService storage, HubExporter hubExporter) =>
        Results.Json(new
        {
            protocol = 1,
            mode = "in-app",
            capabilities = options.MetricsOn ? new[] { "federation", "search", "tags", "metrics" } : new[] { "federation", "search", "tags" },
            service = options.Service,
            version = typeof(ServiceInfo).Assembly.GetName().Version?.ToString(3) ?? "0.0.0",
            runtime = RuntimeInformation.FrameworkDescription,
            mcp = options.Mcp,
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
            sendTo = options.NormalizedEndpoint,
            send = options.NormalizedEndpoint is null ? null : hubExporter.SendState,
            sampling = options.Sampling.IsOn
                ? new { rate = options.Sampling.ClampedRate, keepErrors = options.Sampling.KeepErrors, keepSlowMs = options.Sampling.KeepSlowMs }
                : null,
        }, WizeLensJson.Options);
}

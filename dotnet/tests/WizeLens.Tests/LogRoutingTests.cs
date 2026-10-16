using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NLog.Config;
using NLog.Extensions.Logging;
using Serilog;
using WizeLens.Model;
using WizeLens.NLog;

namespace WizeLens.Tests;

/// <summary>ILogger records that also reach Serilog or NLog are stored once, by the library sink.</summary>
[Collection(TestApp.Collection)]
public class LogRoutingTests
{
    private static readonly string Category = typeof(LogRoutingTests).FullName!;

    private static void Map(WebApplication app) =>
        app.MapGet("/log", (ILogger<LogRoutingTests> log) =>
        {
            log.LogInformation("Hello {Name}", "ada");
            return "ok";
        });

    private static async Task<List<LogRecord>> LogsOfOneRequestAsync(Action<IServiceCollection> services, Action? flush = null)
    {
        await using var app = await TestApp.StartAsync(Map, services: services);
        var response = await app.Client.GetAsync("/log");
        flush?.Invoke();
        var trace = await app.TraceAsync(response);
        return [.. trace.Logs.Where(l => l.Category == Category)];
    }

    private static global::Serilog.Core.Logger SerilogLogger() => new LoggerConfiguration().WriteTo.WizeLens().CreateLogger();

    [Fact]
    public async Task Serilog_replacing_the_logger_factory_is_captured_by_the_sink()
    {
        var logs = await LogsOfOneRequestAsync(s => s.AddSerilog((_, lc) => lc.WriteTo.WizeLens()));
        Assert.Equal("Hello \"ada\"", Assert.Single(logs).Message);
    }

    [Fact]
    public async Task Serilog_writing_to_providers_is_stored_once()
    {
        var logs = await LogsOfOneRequestAsync(s => s.AddSerilog((_, lc) => lc.WriteTo.WizeLens(), writeToProviders: true));
        Assert.Single(logs);
    }

    [Fact]
    public async Task Serilog_as_a_provider_is_stored_once()
    {
        var logs = await LogsOfOneRequestAsync(s => s.AddLogging(b => b.AddSerilog(SerilogLogger(), dispose: true)));
        Assert.Equal("Hello \"ada\"", Assert.Single(logs).Message);
    }

    private static global::NLog.LogFactory NLogFactory(bool async)
    {
        var config = new LoggingConfiguration();
        var target = new WizeLensTarget();
        config.AddRuleForAllLevels(async ? new global::NLog.Targets.Wrappers.AsyncTargetWrapper(target) : target);
        return new global::NLog.LogFactory { Configuration = config };
    }

    [Fact]
    public async Task NLog_as_a_provider_is_stored_once()
    {
        using var factory = NLogFactory(async: false);
        var logs = await LogsOfOneRequestAsync(s => s.AddLogging(b => b.AddNLog(_ => factory)));
        Assert.Single(logs);
    }

    [Fact]
    public async Task NLog_behind_an_async_wrapper_is_stored_once()
    {
        using var factory = NLogFactory(async: true);
        var logs = await LogsOfOneRequestAsync(s => s.AddLogging(b => b.AddNLog(_ => factory)), () => factory.Flush(TimeSpan.FromSeconds(5)));
        Assert.Single(logs);
    }

    [Fact]
    public async Task ILogger_records_are_kept_when_no_library_receives_them()
    {
        _ = SerilogLogger();
        var logs = await LogsOfOneRequestAsync(_ => { });
        Assert.Equal("Hello ada", Assert.Single(logs).Message);
    }
}

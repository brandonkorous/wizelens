using System.Diagnostics;
using NLog;
using NLog.Config;
using NLog.Targets.Wrappers;
using Serilog;
using Serilog.Events;
using WizeLens.Capture;
using WizeLens.Model;
using WizeLens.NLog;
using WizeLens.Serilog;
using WizeLens.Storage;

namespace WizeLens.Tests;

public class LogLibraryTests
{
    private readonly TraceStore _store = new(100);
    private readonly WizeLensOptions _options = new() { ServiceName = "svc", IsEnabled = true };

    private bool Destination(out TraceStore store, out WizeLensOptions options)
    {
        store = _store;
        options = _options;
        return true;
    }

    private static Activity StartRequest()
    {
        var activity = new Activity("request").Start();
        activity.ActivityTraceFlags |= ActivityTraceFlags.Recorded;
        return activity;
    }

    private List<LogRecord> Logs(Activity activity) => _store.Get(activity.TraceId.ToHexString())?.Logs ?? [];

    private List<LogRecord> LooseLogs() => [.. _store.Recent(100).Where(t => TraceIds.IsLoose(t.TraceId)).SelectMany(t => t.Logs)];

    private global::Serilog.Core.Logger SerilogLogger() =>
        new LoggerConfiguration().MinimumLevel.Verbose().WriteTo.Sink(new WizeLensSink(Destination)).CreateLogger();

    [Fact]
    public void Serilog_event_goes_into_the_request_trace()
    {
        using var logger = SerilogLogger();
        using var activity = StartRequest();
        logger.ForContext("SourceContext", "Orders.Api").Warning(new InvalidOperationException("boom"), "Order {OrderId} for {Name}", 42, "ada");

        var log = Assert.Single(Logs(activity));
        Assert.Equal("warn", log.Level);
        Assert.Equal("Orders.Api", log.Category);
        Assert.Equal("Order 42 for \"ada\"", log.Message);
        Assert.Equal("svc", log.Service);
        Assert.Equal(activity.SpanId.ToHexString(), log.SpanId);
        Assert.Equal(42L, log.Attributes["OrderId"]);
        Assert.Equal("ada", log.Attributes["Name"]);
        Assert.False(log.Attributes.ContainsKey("SourceContext"));
        Assert.Equal("System.InvalidOperationException", log.Attributes["exception.type"]);
        Assert.Equal("boom", log.Attributes["exception.message"]);
    }

    [Fact]
    public void Serilog_event_outside_a_request_goes_into_the_loose_batch()
    {
        using var logger = SerilogLogger();
        logger.ForContext("SourceContext", "Orders.Jobs").Information("startup {Step}", 1);
        logger.Debug("below the floor");

        var log = Assert.Single(LooseLogs());
        Assert.Equal(("info", "Orders.Jobs", "startup 1", "svc"), (log.Level, log.Category, log.Message, log.Service));
        Assert.Null(log.SpanId);
        Assert.Equal(1L, log.Attributes["Step"]);
    }

    [Fact]
    public void Serilog_event_outside_a_request_is_skipped_when_outside_is_off()
    {
        _options.Logs.Outside = false;
        using var logger = SerilogLogger();
        logger.Warning("startup");
        Assert.Equal(0, _store.Count);
    }

    [Fact]
    public void Serilog_levels_map_to_contract_levels()
    {
        using var logger = SerilogLogger();
        using var activity = StartRequest();
        foreach (var level in Enum.GetValues<LogEventLevel>()) logger.Write(level, "x");
        Assert.Equal(["trace", "debug", "info", "warn", "error", "critical"], Logs(activity).Select(l => l.Level));
    }

    [Fact]
    public void Serilog_secret_properties_are_redacted_and_noisy_categories_skipped()
    {
        using var logger = SerilogLogger();
        using var activity = StartRequest();
        logger.Information("Login {password}", "hunter2");
        logger.ForContext("SourceContext", "Microsoft.AspNetCore.Hosting.Diagnostics").Information("Request starting");
        Assert.Equal(Redactor.Redacted, Assert.Single(Logs(activity)).Attributes["password"]);
    }

    [Fact]
    public void Serilog_async_sink_keeps_the_trace_of_the_logging_thread()
    {
        var logger = new LoggerConfiguration().WriteTo.Async(a => a.Sink(new WizeLensSink(Destination))).CreateLogger();
        using var activity = StartRequest();
        logger.Information("queued");
        activity.Stop();
        logger.Dispose();
        Assert.Equal("queued", Assert.Single(Logs(activity)).Message);
    }

    private LogFactory NLogFactory(bool async)
    {
        var config = new LoggingConfiguration();
        var target = new WizeLensTarget(Destination);
        config.AddRuleForAllLevels(async ? new AsyncTargetWrapper(target) : target);
        return new LogFactory { Configuration = config };
    }

    [Fact]
    public void NLog_event_goes_into_the_request_trace()
    {
        using var factory = NLogFactory(async: false);
        using var activity = StartRequest();
        var logger = factory.GetLogger("Orders.Api");
        logger.Error(new InvalidOperationException("boom"), "Order {OrderId} for {Name}", 42, "ada");

        var log = Assert.Single(Logs(activity));
        Assert.Equal("error", log.Level);
        Assert.Equal("Orders.Api", log.Category);
        Assert.Equal("Order 42 for ada", log.Message);
        Assert.Equal(activity.SpanId.ToHexString(), log.SpanId);
        Assert.Equal(42L, log.Attributes["OrderId"]);
        Assert.Equal("boom", log.Attributes["exception.message"]);
    }

    [Fact]
    public void NLog_levels_map_and_events_outside_a_request_go_into_the_loose_batch()
    {
        using var factory = NLogFactory(async: false);
        var logger = factory.GetLogger("app");
        logger.Info("startup");
        logger.Debug("below the floor");
        var loose = Assert.Single(LooseLogs());
        Assert.Equal(("info", "app", "startup"), (loose.Level, loose.Category, loose.Message));

        using var activity = StartRequest();
        foreach (var level in global::NLog.LogLevel.AllLoggingLevels) logger.Log(level, "x");
        Assert.Equal(["trace", "debug", "info", "warn", "error", "critical"], Logs(activity).Select(l => l.Level));
    }

    [Fact]
    public void NLog_async_wrapper_keeps_lines_outside_a_request_loose()
    {
        using var factory = NLogFactory(async: true);
        factory.GetLogger("worker").Warn("tick");
        factory.Flush(TimeSpan.FromSeconds(5));
        Assert.Equal("tick", Assert.Single(LooseLogs()).Message);
    }

    [Fact]
    public void NLog_async_wrapper_keeps_the_trace_of_the_logging_thread()
    {
        using var factory = NLogFactory(async: true);
        using var activity = StartRequest();
        factory.GetLogger("app").Info("queued");
        activity.Stop();
        factory.Flush(TimeSpan.FromSeconds(5));
        var log = Assert.Single(Logs(activity));
        Assert.Equal("queued", log.Message);
        Assert.Equal(activity.SpanId.ToHexString(), log.SpanId);
    }

    [Fact]
    public void Disabled_options_store_nothing()
    {
        _options.IsEnabled = false;
        using var logger = SerilogLogger();
        using var factory = NLogFactory(async: false);
        using var activity = StartRequest();
        logger.Information("serilog");
        factory.GetLogger("app").Info("nlog");
        Assert.Equal(0, _store.Count);
    }
}

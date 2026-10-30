using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace WizeLens.Tests;

/// <summary>Environment variables fill the options at registration, never at construction, and code-set values win.</summary>
[Collection(TestApp.Collection)]
public class EnvironmentTests
{
    /// <summary>New options, set by <paramref name="configure"/>, filled from the environment the way AddWizeLens does.</summary>
    internal static WizeLensOptions Resolve(Action<WizeLensOptions>? configure = null)
    {
        var options = new WizeLensOptions();
        configure?.Invoke(options);
        options.ApplyEnvironment(new Production());
        return options;
    }

    private static T With<T>(string name, string? value, Func<T> read)
    {
        var before = Environment.GetEnvironmentVariable(name);
        Environment.SetEnvironmentVariable(name, value);
        try
        {
            return read();
        }
        finally
        {
            Environment.SetEnvironmentVariable(name, before);
        }
    }

    [Fact]
    public void Making_the_options_reads_no_variable()
    {
        var options = With("WIZELENS_ENDPOINT", "http://hub.test:5960", () => With("WIZELENS_SAMPLE_RATE", "0.25", () => new WizeLensOptions()));
        Assert.Null(options.Endpoint);
        Assert.Equal(1, options.Sampling.Rate);
    }

    [Fact]
    public void Reads_the_endpoint_and_token_at_registration()
    {
        var options = With("WIZELENS_ENDPOINT", "http://hub.test:5960/", () => With("WIZELENS_TOKEN", "wl_ik_x", () => Resolve()));
        Assert.Equal(("http://hub.test:5960", "wl_ik_x"), (options.NormalizedEndpoint, options.Token));
    }

    [Fact]
    public void Code_set_values_win_over_the_environment()
    {
        var options = With("WIZELENS_HUD", "false", () => With("WIZELENS_KEEP_ERRORS", "false", () => With("WIZELENS_KEEP_SLOW_MS", "off",
            () => Resolve(o => { o.Hud = true; o.Sampling.KeepErrors = true; o.Sampling.KeepSlowMs = 500; }))));
        Assert.Equal((true, true, 500d), (options.Hud, options.Sampling.KeepErrors, options.Sampling.KeepSlowMs));
    }

    [Fact]
    public void Reads_the_service_from_otel_service_name()
    {
        Assert.Equal("orders", With("OTEL_SERVICE_NAME", " orders ", () => Resolve()).Service);
        Assert.Equal("code", With("OTEL_SERVICE_NAME", "orders", () => Resolve(o => o.Service = "code")).Service);
        Assert.Equal("app-name", With("OTEL_SERVICE_NAME", null, () => Resolve()).Service);
    }

    [Theory]
    [InlineData("false", false)]
    [InlineData("NO", false)]
    [InlineData("1", true)]
    [InlineData(null, true)]
    public void Reads_keep_errors(string? value, bool expected) =>
        Assert.Equal(expected, With("WIZELENS_KEEP_ERRORS", value, () => Resolve()).Sampling.KeepErrors);

    [Theory]
    [InlineData("250", 250d)]
    [InlineData("off", null)]
    [InlineData(" ", 1000d)]
    [InlineData(null, 1000d)]
    [InlineData("soon", 1000d)]
    public void Reads_keep_slow_ms(string? value, double? expected) =>
        Assert.Equal(expected, With("WIZELENS_KEEP_SLOW_MS", value, () => Resolve()).Sampling.KeepSlowMs);

    [Fact]
    public void Adds_redact_keys_to_the_defaults()
    {
        var keys = With("WIZELENS_REDACT_KEYS", " X-Tenant ,ssn,,token", () => Resolve()).RedactKeys;
        Assert.Equal([.. WizeLensOptions.DefaultRedactKeys, "x-tenant", "ssn"], keys);
    }

    [Theory]
    [InlineData("off", false)]
    [InlineData("0", false)]
    [InlineData("yes", true)]
    [InlineData("maybe", true)]
    public void Reads_packages_with_the_one_parser(string value, bool expected) =>
        Assert.Equal(expected, With("WIZELENS_PACKAGES", value, () => Resolve()).ReportPackages);

    [Fact]
    public void Warns_once_for_a_value_it_cannot_read()
    {
        var lines = new List<string>();
        var before = WizeLensEnv.Warn;
        WizeLensEnv.Warn = lines.Add;
        try
        {
            var name = "WIZELENS_TEST_FLAG_" + Guid.NewGuid().ToString("N");
            With(name, "sometimes", () => (WizeLensEnv.Flag(name), WizeLensEnv.Flag(name)));
            Assert.Equal($"{name}=sometimes is not true/1/on/yes or false/0/off/no, so the default is used.", Assert.Single(lines));
        }
        finally
        {
            WizeLensEnv.Warn = before;
        }
    }

    [Fact]
    public void Reads_the_logs_rate_and_level()
    {
        var logs = With("WIZELENS_LOGS_SAMPLE_RATE", "0.5", () => With("WIZELENS_LOGS_MIN_LEVEL", "warn", () => Resolve())).Logs;
        Assert.Equal((0.5, LogLevel.Warning), (logs.Rate, logs.MinLevel));
    }

    private sealed class Production : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "app-name";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

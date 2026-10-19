using System.Diagnostics;
using System.Net;
using System.Reflection;
using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Builder;
using StackExchange.Redis;
using StackExchange.Redis.Profiling;
using WizeLens.Model;
using WizeLens.Redis;

namespace WizeLens.Tests;

/// <summary>WizeLens.Redis: SE.Redis profiling sessions become db spans in the request's trace, with key shapes and no values.</summary>
[Collection(TestApp.Collection)]
public class RedisTests
{
    [Fact]
    public async Task Commands_become_db_spans_under_the_request()
    {
        var profiler = new RedisProfiler(
            session => session.UserToken is Activity a && a.GetTagItem("test.command") is string text ? [Command(text)] : [],
            command => ((FakeCommand)command).Text);
        await using var app = await TestApp.StartAsync(a => a.MapGet("/cart", () =>
        {
            Send(profiler, "GET user:42");
            Send(profiler, "HSET cart:7f3c2a90-1b4e-4c55-9e2a-0d6f1c3b8a77");
            profiler.Flush();
            return "ok";
        }));
        var trace = await app.TraceAsync(await app.Client.GetAsync("/cart"));

        var get = Assert.Single(trace.Spans, s => s.Name == "GET user:?");
        Assert.Equal(SpanCategories.Db, get.Category);
        Assert.Equal(SpanKinds.Client, get.Kind);
        Assert.Equal("redis", get.Attr("db.system.name"));
        Assert.Equal("GET", get.Attr("db.operation.name"));
        Assert.Equal("GET user:?", get.Attr("db.query.text"));
        Assert.Equal("3", get.Attr("db.namespace"));
        Assert.Equal("cache.local", get.Attr("server.address"));
        Assert.Equal("6379", get.Attr("server.port"));
        Assert.Equal(RedisSpan.AdapterName, get.Attr("wizelens.db.adapter"));
        Assert.DoesNotContain("42", get.Attr("wizelens.db.parameters"));
        Assert.Contains(trace.Spans, s => s.SpanId == get.ParentSpanId);
        Assert.Contains(trace.Spans, s => s.Attr("db.query.text") == "HSET cart:?");
        Assert.Equal(0, profiler.OpenCount);
    }

    [Fact]
    public void Commands_outside_a_request_are_not_profiled()
    {
        using var listener = Listen();
        var previous = Activity.Current;
        Activity.Current = null;
        try
        {
            Assert.Null(new RedisProfiler(_ => []).Session());
        }
        finally
        {
            Activity.Current = previous;
        }
    }

    [Fact]
    public void A_command_with_no_reply_yet_stays_open_and_the_caller_keeps_its_activity()
    {
        using var listener = Listen();
        using var source = new ActivitySource("test.redis.parent");
        using var parent = source.StartActivity("request")!;
        var profiler = new RedisProfiler(_ => []);

        Assert.NotNull(profiler.Session());
        profiler.Flush();

        Assert.Equal(1, profiler.OpenCount);
        Assert.Same(parent, Activity.Current);
    }

    [Fact]
    public void The_key_is_read_from_a_real_command_without_its_value()
    {
        var command = RealCommand("SET", "user:42", "secret-value");

        Assert.Equal("SET user:42", RedisMessage.CommandAndKey(command));
        Assert.Null(RedisMessage.CommandAndKey(Command("GET x")));
    }

    [Theory]
    [InlineData("SET user:42", "SET", "user:42")]
    [InlineData("get session:abc", "GET", "session:abc")]
    [InlineData("PING", "PING", null)]
    public void Command_and_key_split(string text, string operation, string? key) =>
        Assert.Equal((operation, key), RedisSpan.Split(text));

    [Fact]
    public void UseWizeLens_registers_the_profiler()
    {
        var multiplexer = DispatchProxy.Create<IConnectionMultiplexer, FakeMultiplexer>();

        Assert.Same(multiplexer, multiplexer.UseWizeLens());
        Assert.NotNull(((FakeMultiplexer)(object)multiplexer).Profiler);
    }

    private static void Send(RedisProfiler profiler, string text)
    {
        var session = profiler.Session()!;
        ((Activity)session.UserToken!).SetTag("test.command", text);
    }

    private static FakeCommand Command(string text) => new(text);

    private static ActivityListener Listen()
    {
        var listener = new ActivityListener
        {
            ShouldListenTo = s => s.Name is RedisProfiler.SourceName or "test.redis.parent",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
        };
        ActivitySource.AddActivityListener(listener);
        return listener;
    }

    // A real ProfiledCommand holding a real Message, built the way SE.Redis builds them.
    private static IProfiledCommand RealCommand(string command, string key, string value)
    {
        var assembly = typeof(IProfiledCommand).Assembly;
        const BindingFlags all = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;
        var create = assembly.GetType("StackExchange.Redis.Message")!.GetMethods(all).First(m => m.Name == "Create"
            && m.GetParameters().Select(p => p.ParameterType.Name).SequenceEqual(["Int32", "CommandFlags", "RedisCommand", "RedisKey&", "RedisValue&"]));
        var redisCommand = Enum.Parse(assembly.GetType("StackExchange.Redis.RedisCommand")!, command);
        var message = create.Invoke(null, [0, CommandFlags.None, redisCommand, (RedisKey)key, (RedisValue)value]);
        var profiled = RuntimeHelpers.GetUninitializedObject(assembly.GetType("StackExchange.Redis.Profiling.ProfiledCommand")!);
        profiled.GetType().GetField("Message", all)!.SetValue(profiled, message);
        return (IProfiledCommand)profiled;
    }

    internal sealed record FakeCommand(string Text) : IProfiledCommand
    {
        public EndPoint EndPoint => new DnsEndPoint("cache.local", 6379);
        public int Db => 3;
        public string Command => Text.Split(' ')[0];
        public CommandFlags Flags => CommandFlags.None;
        public DateTime CommandCreated { get; } = DateTime.UtcNow.AddMilliseconds(-3);
        public TimeSpan CreationToEnqueued => TimeSpan.Zero;
        public TimeSpan EnqueuedToSending => TimeSpan.Zero;
        public TimeSpan SentToResponse => TimeSpan.FromMilliseconds(2);
        public TimeSpan ResponseToCompletion => TimeSpan.Zero;
        public TimeSpan ElapsedTime => TimeSpan.FromMilliseconds(2);
        public IProfiledCommand? RetransmissionOf => null;
        public RetransmissionReasonType? RetransmissionReason => null;
    }
}

/// <summary>An IConnectionMultiplexer that only records the profiler it is given.</summary>
public class FakeMultiplexer : DispatchProxy
{
    public Func<ProfilingSession?>? Profiler { get; private set; }

    protected override object? Invoke(MethodInfo? method, object?[]? args)
    {
        if (method?.Name == nameof(IConnectionMultiplexer.RegisterProfiler) && args?[0] is Func<ProfilingSession?> profiler) Profiler = profiler;
        else throw new NotSupportedException(method?.Name);
        return null;
    }
}

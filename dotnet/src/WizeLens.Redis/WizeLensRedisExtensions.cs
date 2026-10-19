using StackExchange.Redis;

namespace WizeLens.Redis;

public static class WizeLensRedisExtensions
{
    /// <summary>Records every command in WizeLens: <c>ConnectionMultiplexer.Connect(cs).UseWizeLens()</c>. It takes the multiplexer's one profiler slot.</summary>
    public static TMultiplexer UseWizeLens<TMultiplexer>(this TMultiplexer multiplexer)
        where TMultiplexer : IConnectionMultiplexer
    {
        ArgumentNullException.ThrowIfNull(multiplexer);
        multiplexer.RegisterProfiler(RedisProfiler.Shared.Session);
        return multiplexer;
    }
}

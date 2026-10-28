#if !NET9_0_OR_GREATER
using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace WizeLens.Metrics;

/// <summary>On .NET 8, the runtime numbers .NET 9 publishes itself, under the same System.Runtime names, so the runtime panel is the same.</summary>
internal static class RuntimeMeter
{
    private static readonly string[] Generations = ["gen0", "gen1", "gen2", "loh", "poh"];

    public static Meter Create()
    {
        var meter = new Meter("System.Runtime");
        meter.CreateObservableUpDownCounter("dotnet.process.memory.working_set", () => Environment.WorkingSet, "By");
        meter.CreateObservableCounter("dotnet.process.cpu.time", CpuTime, "s");
        meter.CreateObservableCounter("dotnet.gc.collections", Collections, "{collection}");
        meter.CreateObservableCounter("dotnet.gc.pause.time", () => GC.GetTotalPauseDuration().TotalSeconds, "s");
        meter.CreateObservableUpDownCounter("dotnet.gc.last_collection.heap.size", HeapSizes, "By");
        meter.CreateObservableUpDownCounter("dotnet.thread_pool.queue.length", () => ThreadPool.PendingWorkItemCount, "{work_item}");
        meter.CreateObservableUpDownCounter("dotnet.thread_pool.thread.count", () => ThreadPool.ThreadCount, "{thread}");
        return meter;
    }

    private static IEnumerable<Measurement<double>> CpuTime()
    {
        using var process = Process.GetCurrentProcess();
        yield return new(process.UserProcessorTime.TotalSeconds, new KeyValuePair<string, object?>("cpu.mode", "user"));
        yield return new(process.PrivilegedProcessorTime.TotalSeconds, new KeyValuePair<string, object?>("cpu.mode", "system"));
    }

    private static IEnumerable<Measurement<long>> Collections()
    {
        for (var g = 0; g <= GC.MaxGeneration; g++) yield return new(GC.CollectionCount(g), new KeyValuePair<string, object?>("gc.heap.generation", Generations[g]));
    }

    private static List<Measurement<long>> HeapSizes()
    {
        var info = GC.GetGCMemoryInfo().GenerationInfo;
        var sizes = new List<Measurement<long>>(info.Length);
        for (var g = 0; g < info.Length && g < Generations.Length; g++) sizes.Add(new(info[g].SizeAfterBytes, new KeyValuePair<string, object?>("gc.heap.generation", Generations[g])));
        return sizes;
    }
}
#endif

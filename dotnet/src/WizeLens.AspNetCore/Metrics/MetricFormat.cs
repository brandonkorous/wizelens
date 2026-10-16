using System.Globalization;

namespace WizeLens.Metrics;

/// <summary>Shows a metric value in its unit: bytes, durations, ratios, and counts.</summary>
internal static class MetricFormat
{
    private static readonly string[] ByteUnits = ["B", "KB", "MB", "GB", "TB"];

    public static string Format(double? value, string unit)
    {
        if (value is not { } v || !double.IsFinite(v)) return "—";
        return unit switch
        {
            "1" => Number(v * 100) + "%",
            "By" => Bytes(v),
            "s" => Seconds(v),
            "ms" => Seconds(v / 1000),
            "" => Number(v),
            _ => Number(v) + " " + unit.Trim('{', '}'),
        };
    }

    private static string Number(double v)
    {
        var a = Math.Abs(v);
        if (a >= 100) return Math.Round(v).ToString("N0", CultureInfo.InvariantCulture);
        if (a >= 10) return v.ToString("F1", CultureInfo.InvariantCulture);
        if (a >= 1 || a == 0) return v.ToString("F2", CultureInfo.InvariantCulture);
        return v.ToString("G2", CultureInfo.InvariantCulture);
    }

    private static string Bytes(double v)
    {
        var i = 0;
        while (Math.Abs(v) >= 1024 && i < ByteUnits.Length - 1)
        {
            v /= 1024;
            i++;
        }
        return Number(v) + " " + ByteUnits[i];
    }

    private static string Seconds(double v)
    {
        var a = Math.Abs(v);
        if (a >= 1) return Number(v) + " s";
        if (a >= 0.001 || a == 0) return Number(v * 1000) + " ms";
        return Number(v * 1e6) + " µs";
    }
}

namespace WizeLens.Web;

/// <summary>Moves browser times onto this server's clock: a crawler's clock put its page view 4.6 hours before the server request.</summary>
internal static class BrowserClock
{
    /// <summary>Within this gap the difference is network time, not a wrong clock.</summary>
    public const double ToleranceMs = 10_000;

    /// <summary>How far (ms) to move the browser's times: 0 when it sent no clock, or one close enough.</summary>
    public static double Offset(double? sentAt, double receivedAt)
    {
        if (sentAt is not { } sent || !double.IsFinite(sent) || sent <= 0) return 0;
        var offset = receivedAt - sent;
        return Math.Abs(offset) > ToleranceMs ? offset : 0;
    }

    /// <summary>A time moved by <paramref name="offset"/>; a missing (0) time stays missing.</summary>
    public static double Shift(double timeMs, double offset) => timeMs > 0 ? timeMs + offset : timeMs;
}

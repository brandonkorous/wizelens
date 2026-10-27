namespace WizeLens;

/// <summary>Lower-case hex, on every framework WizeLens builds for.</summary>
internal static class Hex
{
    /// <summary>The bytes as lower-case hex (Convert.ToHexStringLower is .NET 9 and newer).</summary>
    public static string Lower(ReadOnlySpan<byte> bytes)
    {
#if NET9_0_OR_GREATER
        return Convert.ToHexStringLower(bytes);
#else
        return Convert.ToHexString(bytes).ToLowerInvariant();
#endif
    }
}

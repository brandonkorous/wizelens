namespace WizeLens.Hub;

/// <summary>How sending to the hub goes (contract type HubSendState): "waiting", "ok", or "failing" with why.</summary>
internal sealed record HubSendState(string State, string? Reason = null, long? LastSentMs = null)
{
    /// <summary>Why the hub took nothing, and what to change: unreachable, the key, a limit, or another answer. Status 0 means no answer.</summary>
    public static string ReasonOf(int status, string url, bool hasToken) => status switch
    {
        0 => $"Could not reach the hub at {url}.",
        401 or 403 when hasToken => $"The hub at {url} refused the key ({status}). Check WIZELENS_TOKEN: it must be a live ingest key (wl_ik_).",
        401 or 403 => $"The hub at {url} needs a key ({status}). Set WIZELENS_TOKEN to an ingest key (wl_ik_).",
        429 => $"The hub at {url} asked to slow down (429): a limit of the key or the plan.",
        _ => $"The hub at {url} answered {status}.",
    };
}

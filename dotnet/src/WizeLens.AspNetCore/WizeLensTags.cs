namespace WizeLens;

/// <summary>One tag rule kept in code: a name, a search in the search language, and a color.</summary>
public sealed record WizeLensTagRule(string Name, string Query, string Color = "blue");

/// <summary>The <see cref="WizeLensOptions.Tags"/> option: rules, and built-in tags (stream, probe, bot) to turn off.</summary>
public sealed class WizeLensTags
{
    /// <summary>Rules the dashboard shows as tags, such as <c>new("checkout", "route:/checkout*", "green")</c>.</summary>
    public List<WizeLensTagRule> Rules { get; set; } = [];

    /// <summary>Built-in tags to turn off, by name.</summary>
    public List<string> DisableBuiltIns { get; set; } = [];
}

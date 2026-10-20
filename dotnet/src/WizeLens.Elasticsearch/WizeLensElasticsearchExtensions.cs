using Microsoft.Extensions.DependencyInjection;
using WizeLens.Capture;

namespace WizeLens.Elasticsearch;

public static class WizeLensElasticsearchExtensions
{
    /// <summary>Records every Elasticsearch request in WizeLens: <c>builder.Services.AddWizeLensElasticsearch()</c>, before the app is built.</summary>
    public static IServiceCollection AddWizeLensElasticsearch(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);
        ExternalSources.Map(ElasticSpans.SourceName, ElasticSpans.Apply);
        return services;
    }
}

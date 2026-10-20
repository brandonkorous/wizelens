using MongoDB.Driver;
using MongoDB.Driver.Core.Events;

namespace WizeLens.MongoDB;

public static class WizeLensMongoExtensions
{
    /// <summary>Records every command in WizeLens: <c>new MongoClient(MongoClientSettings.FromConnectionString(cs).UseWizeLens())</c>.</summary>
    public static MongoClientSettings UseWizeLens(this MongoClientSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        var previous = settings.ClusterConfigurator;
        settings.ClusterConfigurator = builder =>
        {
            previous?.Invoke(builder);
            builder.Subscribe<CommandStartedEvent>(MongoCommands.Shared.Started);
            builder.Subscribe<CommandSucceededEvent>(MongoCommands.Shared.Succeeded);
            builder.Subscribe<CommandFailedEvent>(MongoCommands.Shared.Failed);
        };
        return settings;
    }
}

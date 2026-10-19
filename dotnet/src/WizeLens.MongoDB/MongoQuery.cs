using System.Text;
using System.Text.Json;
using MongoDB.Bson;
using WizeLens.Data;

namespace WizeLens.MongoDB;

/// <summary>The shape of a MongoDB command: field names and operators kept, every value replaced by <c>?</c>.</summary>
internal static class MongoQuery
{
    // Handshake, auth, and health commands: driver plumbing, not app queries.
    private static readonly HashSet<string> Hidden = new(StringComparer.OrdinalIgnoreCase)
    {
        "hello", "isMaster", "saslStart", "saslContinue", "authenticate", "getnonce", "buildInfo", "ping", "endSessions", "getLastError", "logout",
    };

    // Session, cluster time, and transaction fields the driver adds to every command.
    private static readonly HashSet<string> Noise = new(StringComparer.Ordinal)
    {
        "$db", "lsid", "$clusterTime", "txnNumber", "autocommit", "startTransaction", "$readPreference", "readConcern", "writeConcern",
        "apiVersion", "apiStrict", "apiDeprecationErrors",
    };

    public static bool IsHidden(string commandName) => Hidden.Contains(commandName);

    /// <summary>The collection a command works on: <c>{find: "orders"}</c> or getMore's <c>collection</c> field.</summary>
    public static string? Collection(string commandName, BsonDocument command)
    {
        var field = commandName == "getMore" ? "collection" : commandName;
        return command.GetValue(field, null) is BsonString name ? name.Value : null;
    }

    /// <summary><c>{"find":"orders","filter":{"customerId":?},"limit":?}</c>: only the collection names are kept as text.</summary>
    public static string Shape(string commandName, BsonDocument command)
    {
        var text = new StringBuilder("{");
        foreach (var element in command)
        {
            if (Noise.Contains(element.Name)) continue;
            if (text.Length > 1) text.Append(',');
            text.Append(JsonSerializer.Serialize(element.Name)).Append(':');
            var isCollection = element.Name == commandName || commandName == "getMore" && element.Name == "collection";
            if (isCollection && element.Value is BsonString name) text.Append(JsonSerializer.Serialize(name.Value));
            else Write(text, element.Value);
        }
        return text.Append('}').ToString();
    }

    /// <summary>The command without the driver's own fields, for the fingerprint: equal commands match, values are never stored.</summary>
    public static string Raw(BsonDocument command)
    {
        var kept = new BsonDocument();
        foreach (var element in command)
        {
            if (!Noise.Contains(element.Name)) kept.Add(element);
        }
        return kept.ToJson();
    }

    /// <summary>Documents in a find, aggregate, or getMore reply's first batch.</summary>
    public static long? ReturnedRows(BsonDocument? reply)
    {
        if (reply?.GetValue("cursor", null) is not BsonDocument cursor) return null;
        var batch = cursor.GetValue("firstBatch", null) ?? cursor.GetValue("nextBatch", null);
        return batch is BsonArray documents ? documents.Count : null;
    }

    /// <summary>The <c>n</c> of an insert, update, or delete reply.</summary>
    public static int? AffectedRows(string commandName, BsonDocument? reply) =>
        commandName is "insert" or "update" or "delete" && reply?.GetValue("n", null) is { IsNumeric: true } n ? n.ToInt32() : null;

    private static void Write(StringBuilder text, BsonValue value)
    {
        if (value is BsonDocument document) WriteDocument(text, document);
        else if (value is BsonArray array && array.Count > 0 && array.All(v => v is BsonDocument)) WriteArray(text, array);
        else text.Append(QueryShape.Placeholder);
    }

    private static void WriteDocument(StringBuilder text, BsonDocument document)
    {
        text.Append('{');
        var first = true;
        foreach (var element in document)
        {
            if (!first) text.Append(',');
            first = false;
            text.Append(JsonSerializer.Serialize(element.Name)).Append(':');
            Write(text, element.Value);
        }
        text.Append('}');
    }

    // Documents of the same shape (an insert of 1000 rows) are written once.
    private static void WriteArray(StringBuilder text, BsonArray array)
    {
        var shapes = new List<string>();
        foreach (var item in array)
        {
            var shape = new StringBuilder();
            WriteDocument(shape, item.AsBsonDocument);
            var s = shape.ToString();
            if (!shapes.Contains(s)) shapes.Add(s);
        }
        text.Append('[').AppendJoin(',', shapes).Append(']');
    }
}

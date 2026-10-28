using WizeLens.Data;

namespace WizeLens.Tests;

/// <summary>The verb and table a SQL span is named after.</summary>
public class SqlOperationTests
{
    [Theory]
    [InlineData("SET IMPLICIT_TRANSACTIONS OFF;\r\nSET NOCOUNT ON;\r\nINSERT INTO [Catalog] ([Name]) VALUES (@p0);", "INSERT", "Catalog")]
    [InlineData("SET NOCOUNT ON;\r\nUPDATE [Catalog] SET [Price] = @p0 WHERE [Id] = @p1;", "UPDATE", "Catalog")]
    [InlineData("-- tag\nSELECT * FROM Orders", "SELECT", "Orders")]
    [InlineData("SET search_path = x", "SET", null)]
    public void Leading_comments_and_session_sets_are_skipped(string sql, string operation, string? table)
    {
        Assert.Equal(operation, DbActivity.OperationName(sql));
        Assert.Equal(table, DbActivity.CollectionName(sql));
    }
}

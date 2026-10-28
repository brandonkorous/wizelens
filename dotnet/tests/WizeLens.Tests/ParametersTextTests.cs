using Microsoft.Data.Sqlite;
using WizeLens.Data;

namespace WizeLens.Tests;

/// <summary>SQL params are shown as text: letters stay as typed (persona #072).</summary>
public class ParametersTextTests
{
    [Fact]
    public void Keeps_accents_and_dashes_as_typed()
    {
        using var command = new SqliteCommand("UPDATE Catalog SET Name = @p3 WHERE Id = @p6");
        command.Parameters.AddWithValue("@p3", "Peña Ridge 2-Person Tent — 3-season");
        command.Parameters.AddWithValue("@p6", 501);

        var json = DbActivity.ParametersJson(command);

        Assert.Contains("Peña Ridge 2-Person Tent — 3-season", json);
    }
}

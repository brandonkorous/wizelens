using WizeLens.Hub;
using Xunit;

namespace WizeLens.Tests;

public class PackageReportTests
{
    [Fact]
    public void Reads_the_package_libraries_of_a_deps_file()
    {
        const string json = """
        { "libraries": {
            "Newtonsoft.Json/13.0.1": { "type": "package", "serviceable": true },
            "MyApp/1.0.0": { "type": "project" },
            "Microsoft.Data.SqlClient/5.1.0": { "type": "package" } } }
        """;
        var found = PackageReport.FromDepsJson(json).Select(p => $"{p.Ecosystem}:{p.Name}@{p.Version}").Order().ToList();
        Assert.Equal(["NuGet:Microsoft.Data.SqlClient@5.1.0", "NuGet:Newtonsoft.Json@13.0.1"], found);
    }

    [Fact]
    public void Lists_the_test_run_s_own_packages()
    {
        Assert.Contains(PackageReport.List(), p => p.Name == "xunit.core" || p.Name.StartsWith("xunit", StringComparison.Ordinal));
    }
}

using Microsoft.EntityFrameworkCore;

namespace WizeLens.EntityFrameworkCore;

public static class WizeLensDbContextOptionsExtensions
{
    /// <summary>Records every EF Core command in WizeLens: <c>options.UseSqlite(cs).UseWizeLens()</c>.</summary>
    public static DbContextOptionsBuilder UseWizeLens(this DbContextOptionsBuilder builder) =>
        builder.AddInterceptors(WizeLensDbCommandInterceptor.Instance);

    /// <inheritdoc cref="UseWizeLens(DbContextOptionsBuilder)"/>
    public static DbContextOptionsBuilder<TContext> UseWizeLens<TContext>(this DbContextOptionsBuilder<TContext> builder)
        where TContext : DbContext =>
        builder.AddInterceptors(WizeLensDbCommandInterceptor.Instance);
}

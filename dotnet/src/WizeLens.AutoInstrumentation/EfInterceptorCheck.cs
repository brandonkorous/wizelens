using System.Collections;
using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.CompilerServices;

namespace WizeLens.AutoInstrumentation;

/// <summary>Tells whether a DbContext already has the WizeLens EF Core interceptor, which records the same commands. Read by reflection: WizeLens does not reference EF Core.</summary>
internal static class EfInterceptorCheck
{
    private sealed record OptionsAccess(PropertyInfo? Services, Type? OptionsType, PropertyInfo? Extensions);

    private static readonly ConcurrentDictionary<Type, OptionsAccess> Access = new();
    private static readonly ConditionalWeakTable<object, StrongBox<bool>> Answers = new();

    public static bool HasWizeLens(object? context)
    {
        try
        {
            var options = OptionsOf(context);
            return options is not null && Answers.GetValue(options, o => new StrongBox<bool>(Find(o))).Value;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>The context's IDbContextOptions: one object per options set, so the answer is kept per options.</summary>
    private static object? OptionsOf(object? context)
    {
        if (context is null) return null;
        var access = Access.GetOrAdd(context.GetType(), AccessFor);
        var services = access.Services?.GetValue(context) as IServiceProvider;
        return access.OptionsType is null ? null : services?.GetService(access.OptionsType);
    }

    private static OptionsAccess AccessFor(Type type)
    {
        var infrastructure = type.GetInterfaces()
            .FirstOrDefault(i => i.Name == "IInfrastructure`1" && i.GenericTypeArguments[0] == typeof(IServiceProvider));
        var optionsType = infrastructure?.Assembly.GetType("Microsoft.EntityFrameworkCore.Infrastructure.IDbContextOptions");
        return new OptionsAccess(infrastructure?.GetProperty("Instance"), optionsType, optionsType?.GetProperty("Extensions"));
    }

    private static bool Find(object options)
    {
        var access = Access.Values.FirstOrDefault(a => a.OptionsType?.IsInstanceOfType(options) == true);
        if (access?.Extensions?.GetValue(options) is not IEnumerable extensions) return false;
        return extensions.Cast<object>()
            .Select(e => e.GetType().GetProperty("Interceptors")?.GetValue(e) as IEnumerable)
            .Any(list => list?.Cast<object>().Any(i => i.GetType().Name == "WizeLensDbCommandInterceptor") == true);
    }
}

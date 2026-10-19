using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Loader;

namespace WizeLens.AutoInstrumentation;

/// <summary>Finds WizeLens and its dependencies in the hook's folder when the app does not ship them itself.</summary>
internal static class HookResolver
{
    private static string _folder = "";

    public static void Install(string folder)
    {
        _folder = folder;
        // Both events fire only when the app's own files have no match, so the app's versions always win.
        AssemblyLoadContext.Default.Resolving += ResolveAssembly;
        AssemblyLoadContext.Default.ResolvingUnmanagedDll += ResolveNative;
    }

    private static Assembly? ResolveAssembly(AssemblyLoadContext context, AssemblyName name)
    {
        var path = Path.Combine(_folder, name.Name + ".dll");
        return File.Exists(path) ? context.LoadFromAssemblyPath(path) : null;
    }

    private static IntPtr ResolveNative(Assembly assembly, string name)
    {
        foreach (var path in NativeCandidates(name))
        {
            if (File.Exists(path) && NativeLibrary.TryLoad(path, out var handle)) return handle;
        }
        return IntPtr.Zero;
    }

    /// <summary>Paths to try for a native library such as e_sqlite3: runtimes/{rid}/native, most specific RID first.</summary>
    internal static IEnumerable<string> NativeCandidates(string name)
    {
        var file = NativeFileName(name);
        var arch = RuntimeInformation.ProcessArchitecture.ToString().ToLowerInvariant();
        var os = OperatingSystem.IsWindows() ? "win" : OperatingSystem.IsMacOS() ? "osx" : IsMusl() ? "linux-musl" : "linux";
        foreach (var rid in new[] { RuntimeInformation.RuntimeIdentifier, $"{os}-{arch}" }.Distinct())
            yield return Path.Combine(_folder, "runtimes", rid, "native", file);
        yield return Path.Combine(_folder, file);
    }

    private static string NativeFileName(string name)
    {
        if (new[] { ".dll", ".so", ".dylib" }.Any(e => name.EndsWith(e, StringComparison.OrdinalIgnoreCase))) return name;
        if (OperatingSystem.IsWindows()) return name + ".dll";
        var file = name.StartsWith("lib", StringComparison.Ordinal) ? name : "lib" + name;
        return file + (OperatingSystem.IsMacOS() ? ".dylib" : ".so");
    }

    private static bool IsMusl() => File.Exists("/etc/alpine-release");
}

namespace Geronimo.Desktop;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        // A restarted instance must wait for the previous WebView2 profile owner to close.
        if (args.Length == 2 && args[0] == "--restart-from" && int.TryParse(args[1], out var previous) && previous > 0 && previous != Environment.ProcessId)
        {
            try { using var process = System.Diagnostics.Process.GetProcessById(previous); process.WaitForExit(10000); }
            catch (Exception e) when (e is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception) { }
        }
        Mutex mutex;
        bool ownsInstance;
        try { mutex = new Mutex(true, AppInstance.MutexName, out ownsInstance); }
        catch (UnauthorizedAccessException) { AppInstance.ActivateExisting(); return; }
        using var instance = mutex;
        if (!ownsInstance)
        {
            try { ownsInstance = instance.WaitOne(0); }
            catch (AbandonedMutexException) { ownsInstance = true; }
        }
        if (!ownsInstance) { AppInstance.ActivateExisting(); return; }
        try
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new MainWindow());
        }
        finally { instance.ReleaseMutex(); }
    }
}

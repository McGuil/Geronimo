using System.Runtime.InteropServices;
using System.Security.Principal;

namespace Geronimo.Desktop;

internal static class AppInstance
{
    public static string MutexName => $"Local\\Geronimo-{WindowsIdentity.GetCurrent().User?.Value ?? Environment.UserName}";
    public static uint ActivationMessage { get; } = RegisterWindowMessage("Geronimo.OpenDashboard.v1");
    public static void ActivateExisting() => SendNotifyMessage(new IntPtr(0xffff), ActivationMessage, IntPtr.Zero, IntPtr.Zero);
    // The message only opens the dashboard, so normal shortcuts can restore an elevated instance.
    public static void AllowActivation(IntPtr window) => ChangeWindowMessageFilterEx(window, ActivationMessage, 1, IntPtr.Zero);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "RegisterWindowMessageW")]
    private static extern uint RegisterWindowMessage(string name);
    [DllImport("user32.dll", EntryPoint = "SendNotifyMessageW")]
    [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SendNotifyMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)] private static extern bool ChangeWindowMessageFilterEx(IntPtr window, uint message, uint action, IntPtr change);
}

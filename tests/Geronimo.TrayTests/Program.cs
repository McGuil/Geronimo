using Geronimo.Desktop;

internal static class Program
{
    private static int _checks;
    private static void Check(bool condition, string message) { if (!condition) throw new Exception(message); _checks++; }
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using (var window = new TestWindow())
        using (var overlay = new Form { ShowInTaskbar = false })
        {
            var background = false;
            var paused = false;
            using var tray = new TrayController(window, b => background = b,
                () => { if (overlay.Visible) overlay.Hide(); else overlay.Show(); }, () => overlay.Visible,
                () => paused = !paused, () => paused);
            window.Show(); overlay.Show(); Application.DoEvents();
            window.WindowState = FormWindowState.Minimized; Application.DoEvents();
            Check(!window.Visible && !window.IsDisposed && tray.TrayVisible && background, "Minimize must hide to a live tray without disposing the application.");
            Check(overlay.Visible, "Hiding the dashboard must not hide the independent overlay.");
            ((ToolStripMenuItem)tray.Menu.Items["open"]!).PerformClick(); Application.DoEvents();
            Check(window.Visible && window.WindowState == FormWindowState.Normal && !background, "Tray Open must restore the dashboard.");
            window.Close(); Application.DoEvents();
            Check(!window.IsDisposed && !window.Visible && background, "The X button must keep monitoring alive by default.");
            ((ToolStripMenuItem)tray.Menu.Items["overlay"]!).PerformClick();
            Check(!overlay.Visible && !((ToolStripMenuItem)tray.Menu.Items["overlay"]!).Checked, "Tray menu must control overlay visibility while the dashboard is hidden.");
            ((ToolStripMenuItem)tray.Menu.Items["pause"]!).PerformClick();
            Check(paused && tray.Menu.Items["pause"]!.Text == "Resume monitoring", "Tray pause state must be reflected in the menu.");
            ((ToolStripMenuItem)tray.Menu.Items["pause"]!).PerformClick();
            Check(!paused, "Tray resume must restart monitoring.");
            Check(!window.SimulateClosing(CloseReason.WindowsShutDown).Cancel, "Windows shutdown must not be intercepted by close-to-tray.");
            Check(!window.SimulateClosing(CloseReason.ApplicationExitCall).Cancel, "Explicit application exit must bypass close-to-tray.");
            ((ToolStripMenuItem)tray.Menu.Items["exit"]!).PerformClick(); Application.DoEvents();
            Check(window.IsDisposed, "Exit Geronimo must really close the application even with close-to-tray enabled.");
        }
        using (var window = new TestWindow())
        using (var tray = new TrayController(window, _ => { }, () => { }, () => false, () => { }, () => false)
            { CloseToTray = false, MinimizeToTray = false })
        {
            window.Show(); window.WindowState = FormWindowState.Minimized; Application.DoEvents();
            Check(window.Visible && !window.IsDisposed, "Disabling minimize-to-tray must retain ordinary taskbar minimization.");
            window.Close(); Application.DoEvents();
            Check(window.IsDisposed, "Disabling close-to-tray must restore ordinary X-to-exit behavior.");
        }
        Console.WriteLine($"Passed {_checks} native Windows tray lifecycle checks.");
    }
    private sealed class TestWindow : Form
    {
        public FormClosingEventArgs SimulateClosing(CloseReason reason)
        { var args = new FormClosingEventArgs(reason, false); OnFormClosing(args); return args; }
    }
}

namespace Geronimo.Desktop;

// Owns window/tray lifetime; sensor polling and the overlay remain independent of visibility.
internal sealed class TrayController : IDisposable
{
    private readonly Form _window;
    private readonly Action<bool> _visibilityChanged;
    private readonly Func<bool> _overlayVisible;
    private readonly Func<bool> _paused;
    private readonly NotifyIcon _icon;
    private readonly ContextMenuStrip _menu = new();
    private bool _exitRequested;
    private bool _tipShown;
    private bool _disposed;
    private bool _restoring;
    public bool CloseToTray { get; set; } = true;
    public bool MinimizeToTray { get; set; } = true;
    public bool IsBackground { get; private set; }
    internal bool TrayVisible => _icon.Visible;
    internal ContextMenuStrip Menu => _menu;

    public TrayController(Form window, Action<bool> visibilityChanged, Action toggleOverlay, Func<bool> overlayVisible,
        Action togglePause, Func<bool> paused)
    {
        _window = window; _visibilityChanged = visibilityChanged; _overlayVisible = overlayVisible; _paused = paused;
        AddItem("open", "Open Geronimo", Restore);
        AddItem("background", "Run in background", HideToTray);
        _menu.Items.Add(new ToolStripSeparator());
        AddItem("overlay", "Show overlay", () => { toggleOverlay(); UpdateState(); });
        AddItem("pause", "Pause monitoring", () => { togglePause(); UpdateState(); });
        _menu.Items.Add(new ToolStripSeparator());
        AddItem("exit", "Exit Geronimo", Exit);
        _menu.Opening += (_, _) => UpdateState();
        _icon = new NotifyIcon { Text = "Geronimo — monitoring", Icon = SystemIcons.Application, ContextMenuStrip = _menu, Visible = true };
        _icon.DoubleClick += (_, _) => Restore();
        _window.Resize += WindowStateChanged;
        _window.VisibleChanged += WindowStateChanged;
        _window.FormClosing += WindowClosing;
    }

    private void AddItem(string name, string text, Action click)
    {
        var item = new ToolStripMenuItem(text) { Name = name };
        item.Click += (_, _) => click();
        _menu.Items.Add(item);
    }
    public void UpdateState()
    {
        if (_disposed) return;
        ((ToolStripMenuItem)_menu.Items["overlay"]!).Checked = _overlayVisible();
        ((ToolStripMenuItem)_menu.Items["pause"]!).Checked = _paused();
        _menu.Items["pause"]!.Text = _paused() ? "Resume monitoring" : "Pause monitoring";
        _menu.Items["background"]!.Enabled = !IsBackground;
        _icon.Text = _paused() ? "Geronimo — monitoring paused" : IsBackground ? "Geronimo — monitoring in background" : "Geronimo — monitoring";
    }
    public void HideToTray()
    {
        if (_disposed || _exitRequested) return;
        _window.Hide();
        SetBackground(true);
        if (!_tipShown)
        {
            _tipShown = true;
            _icon.ShowBalloonTip(3000, "Geronimo is running in the background",
                "Monitoring and your overlay keep running. Double-click the tray icon to reopen; right-click it to exit.", ToolTipIcon.Info);
        }
    }
    public void Restore()
    {
        if (_disposed || _exitRequested) return;
        // A hidden HWND can still have WS_MINIMIZE even after Form.WindowState changes.
        // Ignore intermediate resize/visibility events until both states have been restored.
        _restoring = true;
        try
        {
            _window.WindowState = FormWindowState.Normal;
            _window.Show();
            _window.WindowState = FormWindowState.Normal;
            _window.Activate();
        }
        finally { _restoring = false; }
        SetBackground(!_window.Visible || _window.WindowState == FormWindowState.Minimized);
    }
    public void Exit() { _exitRequested = true; _window.Close(); }
    private void WindowClosing(object? sender, FormClosingEventArgs e)
    {
        // Real exits/restarts and Windows shutdown must always be allowed.
        if (!_exitRequested && CloseToTray && e.CloseReason == CloseReason.UserClosing)
        { e.Cancel = true; HideToTray(); }
    }
    private void WindowStateChanged(object? sender, EventArgs e)
    {
        if (_disposed || _exitRequested || _restoring) return;
        if (_window.WindowState == FormWindowState.Minimized && MinimizeToTray) HideToTray();
        else SetBackground(!_window.Visible || _window.WindowState == FormWindowState.Minimized);
    }
    private void SetBackground(bool background)
    {
        if (IsBackground == background) return;
        IsBackground = background;
        UpdateState();
        _visibilityChanged(background);
    }
    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _window.Resize -= WindowStateChanged;
        _window.VisibleChanged -= WindowStateChanged;
        _window.FormClosing -= WindowClosing;
        _icon.Visible = false;
        _icon.Dispose();
        _menu.Dispose();
    }
}

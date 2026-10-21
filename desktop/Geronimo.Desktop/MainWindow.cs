using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Geronimo.Desktop;

internal sealed class MainWindow : Form
{
    internal static readonly string DataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Geronimo");
    internal static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    private readonly SensorService _sensors = new();
    private readonly OverlayWindow _overlay = new();
    private readonly PerformanceService _performance = new();
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 2000 };
    private bool _busy;
    private bool _ready;
    private bool _closing;
    private bool _processes;
    private bool _overlayPage;
    private int? _selectedProcess;
    private bool _paused;
    private bool _opened;
    private OverlaySettings _overlaySettings = new();

    public MainWindow()
    {
        Text = "Geronimo — Your PC, in perspective";
        Size = new Size(1440, 1000);
        MinimumSize = new Size(920, 650);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(17, 19, 20);
        Controls.Add(_web);
        Shown += async (_, _) => await InitializeAsync();
        _timer.Tick += async (_, _) => await PublishAsync();
        FormClosing += (_, _) => { _closing = true; _timer.Stop(); _overlay.Close(); };
        FormClosed += (_, _) => { _timer.Dispose(); _performance.Dispose(); if (!_busy) _sensors.Dispose(); UnregisterHotKey(Handle, 1); };
    }

    private async Task InitializeAsync()
    {
        try
        {
            Directory.CreateDirectory(DataFolder);
            var assets = Path.Combine(AppContext.BaseDirectory, "Assets");
            if (!File.Exists(Path.Combine(assets, "index.html"))) throw new FileNotFoundException("UI assets are missing. Rebuild using scripts/build-windows.ps1.");
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(DataFolder, "WebView2"));
            await _web.EnsureCoreWebView2Async(environment);
            _web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _web.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _web.CoreWebView2.SetVirtualHostNameToFolderMapping("geronimo.local", assets, CoreWebView2HostResourceAccessKind.DenyCors);
            _web.CoreWebView2.NavigationStarting += (_, e) =>
            {
                if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.Host != "geronimo.local") e.Cancel = true;
            };
            _web.CoreWebView2.NewWindowRequested += (_, e) => e.Handled = true;
            _web.CoreWebView2.WebMessageReceived += async (_, e) => await OnMessageAsync(e);
            _web.CoreWebView2.Navigate("https://geronimo.local/index.html");
            RegisterHotKey(Handle, 1, 0x0002 | 0x0004 | 0x4000, (uint)Keys.O); // Ctrl+Shift+O, no repeat.
        }
        catch (Exception e)
        {
            MessageBox.Show(this, $"Geronimo could not start. Install the Microsoft Edge WebView2 Evergreen Runtime if it is missing.\n\n{e.Message}", "Geronimo startup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private async Task OnMessageAsync(CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!Uri.TryCreate(e.Source, UriKind.Absolute, out var source) || source.Host != "geronimo.local" || source.Scheme != "https") return;
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            var root = document.RootElement;
            if (!root.TryGetProperty("type", out var type)) return;
            switch (type.GetString())
            {
                case "ready":
                    if (!_opened) { _opened = true; await Task.Run(_sensors.Open); }
                    _ready = true;
                    await PublishAsync();
                    _timer.Start();
                    break;
                case "preferences":
                    if (root.TryGetProperty("settings", out var settings)) ApplyPreferences(settings);
                    break;
                case "page":
                    var pageName = root.TryGetProperty("page", out var page) ? page.GetString() : null;
                    _processes = pageName is "processes" or "overlay";
                    _overlayPage = pageName == "overlay";
                    ConfigureCapture();
                    if (_processes) await PublishAsync();
                    break;
                case "pause": _paused = root.TryGetProperty("paused", out var paused) && paused.GetBoolean(); ConfigureCapture(); break;
                case "select-process":
                    _selectedProcess = root.TryGetProperty("id", out var processId) && processId.TryGetInt32(out var pid) && pid > 0 ? pid : null;
                    _sensors.TargetProcessId = _selectedProcess;
                    ConfigureCapture();
                    await PublishAsync();
                    break;
                case "select-gpu":
                    _sensors.SelectedGpuId = root.TryGetProperty("id", out var id) ? id.GetString() : null;
                    await PublishAsync();
                    break;
                case "reset-overlay-position": _overlay.ResetPosition(); break;
                case "install-driver":
                    await InstallDriverAsync();
                    break;
                case "restart-admin": Restart(true); break;
                case "restart-app": Restart(false); break;
            }
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException) { /* Ignore malformed bridge messages. */ }
    }

    private void ApplyPreferences(JsonElement settings)
    {
        if (settings.TryGetProperty("theme", out var theme))
        {
            var dark = theme.GetString() == "light" ? 0 : 1;
            DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
        }
        if (settings.TryGetProperty("refresh", out var refresh) && refresh.TryGetInt32(out var interval) && interval is 1000 or 2000 or 5000) _timer.Interval = interval;
        if (settings.TryGetProperty("overlay", out var overlay))
        {
            _overlaySettings = overlay.Deserialize<OverlaySettings>(JsonOptions) ?? new();
            _overlaySettings.Fahrenheit = settings.TryGetProperty("fahrenheit", out var unit) && unit.GetBoolean();
            _overlaySettings.Opacity = Math.Clamp(_overlaySettings.Opacity, 35, 100);
            _overlaySettings.Scale = Math.Clamp(_overlaySettings.Scale, 75, 140);
            _overlaySettings.Metrics = (_overlaySettings.Metrics ?? []).Where(OverlayWindow.IsMetric).Distinct().Take(24).ToArray();
            if (_overlaySettings.Layout is not ("stacked" or "inline")) _overlaySettings.Layout = "stacked";
            if (!IsColor(_overlaySettings.Color)) _overlaySettings.Color = "#90e6b5";
            if (!IsColor(_overlaySettings.Background)) _overlaySettings.Background = "#0f1513";
            _overlaySettings.PingHost = (_overlaySettings.PingHost ?? "").Trim();
            _overlay.Configure(_overlaySettings);
            if (_overlaySettings.Visible && !_overlay.Visible) _overlay.Show();
            else if (!_overlaySettings.Visible && _overlay.Visible) _overlay.Hide();
            ConfigureCapture();
        }
    }

    private async Task PublishAsync()
    {
        if (_busy || !_ready || _closing || _paused) return;
        _busy = true;
        try
        {
            var snapshot = await Task.Run(() =>
            {
                var sample = _sensors.Read(_processes);
                var performance = _performance.Read(_sensors.TargetProcess, _overlaySettings.PingHost,
                    (_overlaySettings.Visible || _overlayPage) && _overlaySettings.Metrics.Contains("ping"));
                return sample with { Performance = performance };
            });
            if (_closing) return;
            _web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(snapshot, JsonOptions));
            _overlay.SetSnapshot(snapshot);
        }
        catch
        {
            if (!_closing) _web.CoreWebView2.PostWebMessageAsJson("{\"type\":\"sensor-error\",\"message\":\"A sensor update failed. Available readings will be retried on the next interval.\"}");
        }
        finally { _busy = false; if (_closing) _sensors.Dispose(); }
    }

    private void ConfigureCapture() => _performance.Configure(_selectedProcess, !_paused && (_overlaySettings.Visible || _overlayPage)
        && _overlaySettings.Metrics.Any(m => m is "fps" or "frametime"));
    private static bool IsColor(string? color) => color is { Length: 7 } && color[0] == '#' && color.Skip(1).All(Uri.IsHexDigit);
    private void ActionResult(string message) => _web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "action-result", message }, JsonOptions));
    private async Task InstallDriverAsync()
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "Tools", "PawnIO_setup.exe");
            if (!File.Exists(path)) { ActionResult("The driver installer is missing. Download the complete Geronimo installer."); return; }
            using var installer = Process.Start(new ProcessStartInfo(path) { UseShellExecute = true, Verb = "runas" });
            if (installer != null) await installer.WaitForExitAsync();
            if (!_closing) ActionResult("Driver setup closed. Restart Geronimo to detect the driver; restart Windows if setup requested it.");
        }
        catch (System.ComponentModel.Win32Exception) { if (!_closing) ActionResult("Driver setup was cancelled or could not start."); }
    }
    private void Restart(bool elevate)
    {
        try
        {
            var info = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = true, WorkingDirectory = AppContext.BaseDirectory };
            info.ArgumentList.Add("--restart-from"); info.ArgumentList.Add(Environment.ProcessId.ToString());
            if (elevate) info.Verb = "runas";
            using var restarted = Process.Start(info);
            if (restarted != null) Close();
        }
        catch (System.ComponentModel.Win32Exception) { ActionResult("Restart was cancelled or could not start. The current session is still running."); }
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0312 && message.WParam.ToInt32() == 1)
        {
            _overlaySettings.Visible = !_overlaySettings.Visible;
            _overlay.Configure(_overlaySettings);
            if (_overlaySettings.Visible) _overlay.Show(); else _overlay.Hide();
            ConfigureCapture();
            if (_ready) _web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "overlay-state", visible = _overlaySettings.Visible }, JsonOptions));
        }
        base.WndProc(ref message);
    }

    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
}

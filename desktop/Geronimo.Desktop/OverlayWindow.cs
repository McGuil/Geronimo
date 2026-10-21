using System.Runtime.InteropServices;
using System.Text.Json;

namespace Geronimo.Desktop;

internal sealed class OverlayWindow : Form
{
    private OverlaySettings _settings = new();
    private Snapshot? _snapshot;
    private static readonly Dictionary<string, Color> Colors = new() { ["cpu"] = Color.FromArgb(177, 237, 189), ["gpu"] = Color.FromArgb(183, 161, 236), ["ram"] = Color.FromArgb(131, 185, 235) };
    private readonly string _positionFile = Path.Combine(MainWindow.DataFolder, "overlay-position.json");
    protected override bool ShowWithoutActivation => true;
    protected override CreateParams CreateParams
    {
        get { var value = base.CreateParams; value.ExStyle |= 0x08000000 | 0x00000080 | 0x00080000; if (_settings.ClickThrough) value.ExStyle |= 0x20; return value; }
    }

    public OverlayWindow()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        DoubleBuffered = true;
        BackColor = Color.FromArgb(15, 21, 19);
        StartPosition = FormStartPosition.Manual;
        Size = new Size(250, 160);
        ResetPosition();
        try
        {
            if (File.Exists(_positionFile))
            {
                var point = JsonSerializer.Deserialize<int[]>(File.ReadAllText(_positionFile));
                if (point?.Length == 2) Location = Constrain(new Point(point[0], point[1]));
            }
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException) { }
    }

    public void Configure(OverlaySettings settings)
    {
        var styleChanged = _settings.ClickThrough != settings.ClickThrough;
        _settings = settings;
        var scale = settings.Scale / 100f;
        Size = settings.Layout == "inline" ? new Size((int)(Math.Max(1, settings.Metrics.Length) * 112 * scale), (int)(95 * scale)) : new Size((int)(250 * scale), (int)((45 + Math.Max(1, settings.Metrics.Length) * 36) * scale));
        Opacity = settings.Opacity / 100d;
        Location = Constrain(Location);
        if (styleChanged && IsHandleCreated)
        {
            var current = GetWindowLongPtr(Handle, -20).ToInt64();
            SetWindowLongPtr(Handle, -20, new IntPtr(settings.ClickThrough ? current | 0x20 : current & ~0x20));
        }
        Invalidate();
    }

    public void SetSnapshot(Snapshot snapshot) { _snapshot = snapshot; Invalidate(); }
    public void ResetPosition() { var area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1920, 1080); Location = new Point(area.Right - Width - 24, area.Top + 24); SavePosition(); }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var g = e.Graphics;
        var scale = _settings.Scale / 100f;
        g.ScaleTransform(scale, scale);
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        using var titleFont = new Font("Segoe UI", 7, FontStyle.Bold);
        using var labelFont = new Font("Segoe UI", 8, FontStyle.Bold);
        using var valueFont = new Font("Segoe UI", 10, FontStyle.Regular);
        using var muted = new SolidBrush(Color.FromArgb(155, 178, 164));
        using var text = new SolidBrush(Color.FromArgb(231, 242, 235));
        g.DrawString("GERONIMO  ·  LIVE", titleFont, muted, 13, 10);
        for (var i = 0; i < _settings.Metrics.Length; i++)
        {
            var metric = _settings.Metrics[i];
            var sample = _snapshot?.Readings.GetValueOrDefault(metric);
            var x = _settings.Layout == "inline" ? 13 + i * 112 : 13;
            var y = _settings.Layout == "inline" ? 35 : 34 + i * 36;
            using var accent = new SolidBrush(Colors[metric]);
            g.DrawString(metric.ToUpperInvariant(), labelFont, accent, x, y);
            var usage = sample?.Usage is float load ? $"{load:F0}%" : "—";
            var temperature = sample?.Temperature is float t ? $"{(_settings.Fahrenheit ? t * 9 / 5 + 32 : t):F0}°{(_settings.Fahrenheit ? 'F' : 'C')}" : "N/A";
            g.DrawString(usage, valueFont, text, x + (_settings.Layout == "inline" ? 0 : 52), y + (_settings.Layout == "inline" ? 20 : -2));
            g.DrawString(temperature, valueFont, muted, x + (_settings.Layout == "inline" ? 44 : 145), y + (_settings.Layout == "inline" ? 20 : -2));
        }
        using var border = new Pen(Color.FromArgb(66, 90, 75));
        g.ResetTransform();
        g.DrawRectangle(border, 0, 0, Width - 1, Height - 1);
    }

    private Point Constrain(Point position)
    {
        var area = Screen.FromPoint(position).WorkingArea;
        return new Point(Math.Clamp(position.X, area.Left, Math.Max(area.Left, area.Right - Width)), Math.Clamp(position.Y, area.Top, Math.Max(area.Top, area.Bottom - Height)));
    }
    private void SavePosition()
    {
        try { Directory.CreateDirectory(MainWindow.DataFolder); File.WriteAllText(_positionFile, JsonSerializer.Serialize(new[] { Left, Top })); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
    }
    protected override void WndProc(ref Message message)
    {
        base.WndProc(ref message);
        if (message.Msg == 0x0084 && !_settings.ClickThrough) message.Result = new IntPtr(2); // HTCAPTION: native window dragging.
        if (message.Msg == 0x0232) { Location = Constrain(Location); SavePosition(); } // WM_EXITSIZEMOVE.
    }
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
}

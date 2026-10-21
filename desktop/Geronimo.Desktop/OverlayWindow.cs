using System.Runtime.InteropServices;
using System.Text.Json;

namespace Geronimo.Desktop;

internal sealed class OverlayWindow : Form
{
    private OverlaySettings _settings = new();
    private Snapshot? _snapshot;
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
        var columns = settings.Layout == "inline" ? Math.Min(4, Math.Max(1, settings.Metrics.Length)) : 1;
        var rows = (int)Math.Ceiling(Math.Max(1, settings.Metrics.Length) / (double)columns);
        Size = settings.Layout == "inline" ? new Size((int)(columns * 170 * scale), (int)((34 + rows * 58) * scale)) : new Size((int)(290 * scale), (int)((36 + rows * 36) * scale));
        BackColor = ColorTranslator.FromHtml(settings.Background);
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
        var columns = _settings.Layout == "inline" ? Math.Min(4, Math.Max(1, _settings.Metrics.Length)) : 1;
        for (var i = 0; i < _settings.Metrics.Length; i++)
        {
            var metric = _settings.Metrics[i];
            var x = 13 + i % columns * 170;
            var y = _settings.Layout == "inline" ? 33 + i / columns * 58 : 32 + i * 36;
            using var accent = new SolidBrush(ColorTranslator.FromHtml(_settings.Color));
            var (label, value) = FormatMetric(metric);
            using var format = new StringFormat { Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap };
            g.DrawString(label, labelFont, accent, new RectangleF(x, y, _settings.Layout == "inline" ? 148 : 112, 18), format);
            g.DrawString(value, valueFont, text, new RectangleF(x + (_settings.Layout == "inline" ? 0 : 116), y + (_settings.Layout == "inline" ? 19 : -2), _settings.Layout == "inline" ? 148 : 145, 23), format);
        }
        using var border = new Pen(Color.FromArgb(66, 90, 75));
        g.ResetTransform();
        g.DrawRectangle(border, 0, 0, Width - 1, Height - 1);
    }

    internal static bool IsMetric(string metric) => metric is "cpu" or "gpu" or "ram" or "cpu-usage" or "cpu-temp" or "cpu-clock" or "cpu-power"
        or "gpu-usage" or "gpu-temp" or "gpu-clock" or "gpu-power" or "ram-usage" or "ram-temp" or "ram-used"
        or "fps" or "frametime" or "process" or "process-cpu" or "process-ram" or "ping" || metric.StartsWith("sensor:", StringComparison.Ordinal);

    private (string Label, string Value) FormatMetric(string metric)
    {
        string Number(double? n, string unit, string digits = "F0") => n.HasValue ? $"{n.Value.ToString(digits)}{unit}" : "N/A";
        string Temp(float? t) => t.HasValue ? Number(_settings.Fahrenheit ? t * 9 / 5 + 32 : t, _settings.Fahrenheit ? "°F" : "°C") : "N/A";
        var perf = _snapshot?.Performance;
        if (metric.StartsWith("sensor:", StringComparison.Ordinal))
        {
            var sensor = _snapshot?.Sensors.FirstOrDefault(s => s.Id == metric[7..]);
            return (sensor?.Name ?? "Sensor", Temp(sensor?.Temperature));
        }
        if (metric is "cpu" or "gpu" or "ram")
        { var r = _snapshot?.Readings.GetValueOrDefault(metric); return (metric.ToUpperInvariant(), $"{Number(r?.Usage, "%")}  {Temp(r?.Temperature)}"); }
        var key = metric.Split('-')[0];
        var sample = _snapshot?.Readings.GetValueOrDefault(key);
        return metric switch
        {
            "fps" => ("FPS", Number(perf?.Fps, "")),
            "frametime" => ("FRAME TIME", Number(perf?.FrameTime, " ms", "F1")),
            "ping" => ("PING", Number(perf?.Ping, " ms")),
            "process" => ("PROCESS", perf?.ProcessName ?? "Select a process"),
            "process-cpu" => ("PROCESS CPU", Number(perf?.ProcessCpu, "%", "F1")),
            "process-ram" => ("PROCESS RAM", Number(perf?.ProcessRam, " MB")),
            "ram-used" => ("RAM USED", Number(_snapshot?.UsedMemoryGb, " GB", "F1")),
            _ when metric.EndsWith("-usage") => ($"{key.ToUpperInvariant()} USAGE", Number(sample?.Usage, "%")),
            _ when metric.EndsWith("-temp") => ($"{key.ToUpperInvariant()} TEMP", Temp(sample?.Temperature)),
            _ when metric.EndsWith("-clock") => ($"{key.ToUpperInvariant()} CLOCK", Number(sample?.Clock, " GHz", "F2")),
            _ when metric.EndsWith("-power") => ($"{key.ToUpperInvariant()} POWER", Number(sample?.Power, " W")),
            _ => (metric.ToUpperInvariant(), "N/A")
        };
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

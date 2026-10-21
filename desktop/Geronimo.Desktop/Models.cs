namespace Geronimo.Desktop;

public sealed record HardwareMetadata(string Name, string Short, string Detail);
public sealed record Reading(float? Usage, float? Temperature, float? Clock, float? Power, string TemperatureLabel);
public sealed record SensorInfo(string Id, string Name, string Detail, string Icon, float? Temperature, float? Min, float? Max, string? Metric);
public sealed record DeviceInfo(string Id, string Name, string Kind);
public sealed record ProcessInfo(int Id, string Name, string Description, string Icon, double? Cpu, double Ram, double? Gpu);
public sealed record SensorDiagnostics(bool DriverInstalled, string? DriverVersion, bool Elevated, string Cpu, string Ram);
public sealed record PerformanceInfo(int? ProcessId, string? ProcessName, double? ProcessCpu, double? ProcessRam,
    double? Fps, double? FrameTime, double? Ping, string PingHost, string CaptureStatus, string PingStatus);
public sealed record Snapshot(
    string Type,
    long Timestamp,
    Dictionary<string, HardwareMetadata> Hardware,
    Dictionary<string, Reading> Readings,
    List<SensorInfo> Sensors,
    List<DeviceInfo> Devices,
    double TotalMemoryGb,
    double UsedMemoryGb,
    string Os,
    string StatusMessage,
    List<ProcessInfo>? Processes,
    SensorDiagnostics Diagnostics,
    PerformanceInfo? Performance = null);

public sealed class OverlaySettings
{
    public bool Visible { get; set; }
    public int Opacity { get; set; } = 90;
    public int Scale { get; set; } = 100;
    public string Layout { get; set; } = "stacked";
    public string[] Metrics { get; set; } = ["cpu", "gpu", "ram"];
    public bool ClickThrough { get; set; }
    public bool Fahrenheit { get; set; }
    public string PingHost { get; set; } = "1.1.1.1";
    public string Color { get; set; } = "#90e6b5";
    public string Background { get; set; } = "#0f1513";
}

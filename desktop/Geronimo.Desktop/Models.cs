namespace Geronimo.Desktop;

public sealed record HardwareMetadata(string Name, string Short, string Detail);
public sealed record Reading(float? Usage, float? Temperature, float? Clock, float? Power, string TemperatureLabel);
public sealed record SensorInfo(string Id, string Name, string Detail, string Icon, float? Temperature, float? Min, float? Max, string? Metric);
public sealed record DeviceInfo(string Id, string Name, string Kind);
public sealed record ProcessInfo(string Name, string Description, string Icon, double? Cpu, double Ram, double? Gpu);
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
    List<ProcessInfo>? Processes);

public sealed class OverlaySettings
{
    public bool Visible { get; set; }
    public int Opacity { get; set; } = 90;
    public int Scale { get; set; } = 100;
    public string Layout { get; set; } = "stacked";
    public string[] Metrics { get; set; } = ["cpu", "gpu", "ram"];
    public bool ClickThrough { get; set; }
    public bool Fahrenheit { get; set; }
}

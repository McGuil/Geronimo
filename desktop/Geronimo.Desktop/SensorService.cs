using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using LibreHardwareMonitor.Hardware;

namespace Geronimo.Desktop;

internal sealed class SensorService : IDisposable
{
    private readonly Computer _computer = new()
    {
        IsCpuEnabled = true, IsGpuEnabled = true, IsMemoryEnabled = true,
        IsMotherboardEnabled = true, IsStorageEnabled = true, IsNetworkEnabled = false,
        IsControllerEnabled = true, IsPsuEnabled = true, IsBatteryEnabled = true
    };
    private readonly Dictionary<int, (long Ticks, long Stamp)> _processTimes = [];
    private readonly bool _elevated = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
    private string? _openError;
    private bool _opened;
    public string? SelectedGpuId { get; set; }

    public void Open()
    {
        try { _computer.Open(); _opened = true; }
        catch { _openError = "The sensor provider could not initialize. CPU/GPU sensors may need administrator access or a supported signed hardware driver."; }
    }

    public Snapshot Read(bool includeProcesses)
    {
        var all = new List<IHardware>();
        foreach (var device in _computer.Hardware) Update(device, all);
        var cpu = all.FirstOrDefault(h => h.HardwareType == HardwareType.Cpu);
        var gpus = all.Where(h => h.HardwareType is HardwareType.GpuAmd or HardwareType.GpuNvidia or HardwareType.GpuIntel).ToList();
        var gpu = gpus.FirstOrDefault(h => h.Identifier.ToString() == SelectedGpuId) ?? gpus.FirstOrDefault();
        var memory = all.FirstOrDefault(h => h.HardwareType == HardwareType.Memory);
        var memoryStatus = new MemoryStatus();
        var hasMemory = GlobalMemoryStatusEx(ref memoryStatus);
        var total = hasMemory ? memoryStatus.TotalPhysical / Math.Pow(1024, 3) : 0;
        var used = hasMemory ? (memoryStatus.TotalPhysical - memoryStatus.AvailablePhysical) / Math.Pow(1024, 3) : 0;
        var inventory = new List<SensorInfo>();
        foreach (var device in all)
        {
            var metric = Kind(device);
            foreach (var sensor in device.Sensors.Where(s => s.SensorType == SensorType.Temperature))
            {
                var sensorMetric = metric ?? (IsMemoryTemperature(sensor.Name) ? "ram" : null);
                inventory.Add(new SensorInfo(sensor.Identifier.ToString(), sensor.Name, device.Name,
                    sensorMetric ?? (device.HardwareType == HardwareType.Storage ? "disk" : "cpu"),
                    Finite(sensor.Value), Finite(sensor.Min), Finite(sensor.Max), sensorMetric));
            }
        }
        var ramSensor = inventory.FirstOrDefault(s => s.Metric == "ram" && s.Temperature.HasValue);
        var cpuReading = ReadDevice(cpu, "cpu");
        var gpuReading = ReadDevice(gpu, "gpu");
        var ramReading = new Reading(hasMemory ? (float)(used / total * 100) : null, ramSensor?.Temperature,
            null, null, ramSensor?.Name ?? "Sensor unavailable");
        foreach (var kind in new[] { "cpu", "gpu", "ram" })
            if (!inventory.Any(s => s.Metric == kind)) inventory.Add(new SensorInfo($"unavailable/{kind}",
                $"{kind.ToUpperInvariant()} temperature", "No temperature sensor exposed by the provider", kind, null, null, null, kind));

        var metadata = new Dictionary<string, HardwareMetadata>
        {
            ["cpu"] = new(cpu?.Name ?? "Processor unavailable", cpu?.Name ?? "Processor unavailable", $"{Environment.ProcessorCount} logical processors"),
            ["gpu"] = new(gpu?.Name ?? "Graphics adapter unavailable", gpu?.Name ?? "Graphics adapter unavailable", $"{gpus.Count} graphics adapter(s) detected"),
            ["ram"] = new(memory?.Name ?? "System memory", hasMemory ? $"{total:F1} GB usable RAM" : "Memory unavailable", hasMemory ? $"{total:F1} GB usable physical memory" : "Memory details unavailable")
        };
        var devices = all.Where(h => Kind(h) != null).Select(h => new DeviceInfo(h.Identifier.ToString(), h.Name, Kind(h)!)).ToList();
        var status = _openError ?? (!_elevated ? "Some temperature sensors may require running Geronimo as administrator. Missing readings remain unavailable." : "Read-only hardware monitoring. Unsupported sensors remain unavailable.");
        return new Snapshot("telemetry", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), metadata,
            new() { ["cpu"] = cpuReading, ["gpu"] = gpuReading, ["ram"] = ramReading }, inventory, devices,
            total, used, Environment.OSVersion.Version.Build >= 22000 ? "Windows 11" : "Windows 10", status,
            includeProcesses ? ReadProcesses() : null);
    }

    private static void Update(IHardware device, List<IHardware> all)
    {
        try { device.Update(); } catch { return; /* Failed devices must not emit stale readings. */ }
        all.Add(device);
        foreach (var sub in device.SubHardware) Update(sub, all);
    }

    private static Reading ReadDevice(IHardware? device, string kind)
    {
        if (device is null) return new Reading(null, null, null, null, "Unavailable");
        var loads = device.Sensors.Where(s => s.SensorType == SensorType.Load).ToList();
        var load = loads.FirstOrDefault(s => kind == "cpu" ? s.Name.Contains("Total", StringComparison.OrdinalIgnoreCase) : s.Name.Equals("GPU Core", StringComparison.OrdinalIgnoreCase));
        var temperatures = device.Sensors.Where(s => s.SensorType == SensorType.Temperature && Finite(s.Value).HasValue).ToList();
        var temperature = temperatures.FirstOrDefault(s => kind == "cpu" ? s.Name.Contains("Package", StringComparison.OrdinalIgnoreCase) : s.Name.Equals("GPU Core", StringComparison.OrdinalIgnoreCase))
            ?? temperatures.OrderByDescending(s => s.Value).FirstOrDefault();
        var clocks = device.Sensors.Where(s => s.SensorType == SensorType.Clock && s.Name.Contains("Core", StringComparison.OrdinalIgnoreCase) && Finite(s.Value).HasValue).ToList();
        var clock = clocks.Count > 0 ? clocks.Average(s => s.Value!.Value) / 1000 : (float?)null;
        var power = device.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Power && (s.Name.Contains("Package", StringComparison.OrdinalIgnoreCase) || s.Name.Equals("GPU Power", StringComparison.OrdinalIgnoreCase)));
        return new Reading(Finite(load?.Value), Finite(temperature?.Value), Finite(clock), Finite(power?.Value), temperature?.Name ?? "Unavailable");
    }

    private List<ProcessInfo> ReadProcesses()
    {
        var result = new List<ProcessInfo>();
        var alive = new HashSet<int>();
        var stamp = Stopwatch.GetTimestamp();
        foreach (var process in Process.GetProcesses())
        {
            using (process)
            {
                try
                {
                    var ticks = process.TotalProcessorTime.Ticks;
                    double? usage = null;
                    if (_processTimes.TryGetValue(process.Id, out var previous) && ticks >= previous.Ticks && stamp > previous.Stamp)
                        usage = Math.Clamp((ticks - previous.Ticks) / (double)TimeSpan.TicksPerSecond / ((stamp - previous.Stamp) / (double)Stopwatch.Frequency) / Environment.ProcessorCount * 100, 0, 100);
                    _processTimes[process.Id] = (ticks, stamp);
                    alive.Add(process.Id);
                    result.Add(new ProcessInfo(process.ProcessName, $"PID {process.Id}", "windows", usage, process.WorkingSet64 / 1048576d, null));
                }
                catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException or NotSupportedException)
                { /* Processes can exit or deny access while being enumerated. */ }
            }
        }
        foreach (var id in _processTimes.Keys.Where(k => !alive.Contains(k)).ToList()) _processTimes.Remove(id);
        return result.OrderByDescending(p => p.Cpu ?? -1).ToList();
    }

    private static bool IsMemoryTemperature(string name) => name.Contains("DIMM", StringComparison.OrdinalIgnoreCase) || name.Contains("DRAM", StringComparison.OrdinalIgnoreCase);
    private static float? Finite(float? value) => value.HasValue && float.IsFinite(value.Value) ? value : null;
    private static string? Kind(IHardware h) => h.HardwareType switch { HardwareType.Cpu => "cpu", HardwareType.GpuAmd or HardwareType.GpuNvidia or HardwareType.GpuIntel => "gpu", HardwareType.Memory => "ram", _ => null };
    public void Dispose() { if (_opened) _computer.Close(); }

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatus
    {
        public uint Length = (uint)Marshal.SizeOf<MemoryStatus>();
        public uint MemoryLoad;
        public ulong TotalPhysical;
        public ulong AvailablePhysical;
        public ulong TotalPageFile;
        public ulong AvailablePageFile;
        public ulong TotalVirtual;
        public ulong AvailableVirtual;
        public ulong AvailableExtendedVirtual;
        public MemoryStatus() { }
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);
}

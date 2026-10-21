using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using LibreHardwareMonitor.Hardware;
using LibreHardwareMonitor.PawnIo;

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
    public int? TargetProcessId { get; set; }
    public ProcessInfo? TargetProcess { get; private set; }
    private readonly Version? _driverVersion = PawnIo.Version;
    private bool DriverReady => _driverVersion >= new Version(2, 0, 0, 0);

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
        var dimms = all.Where(h => h.Identifier.ToString().StartsWith("/memory/dimm/", StringComparison.OrdinalIgnoreCase)).ToList();
        var memoryStatus = new MemoryStatus();
        var hasMemory = GlobalMemoryStatusEx(ref memoryStatus);
        var total = hasMemory ? memoryStatus.TotalPhysical / Math.Pow(1024, 3) : 0;
        var used = hasMemory ? (memoryStatus.TotalPhysical - memoryStatus.AvailablePhysical) / Math.Pow(1024, 3) : 0;
        var inventory = new List<SensorInfo>();
        foreach (var device in all)
        {
            var metric = Kind(device);
            foreach (var sensor in device.Sensors.Where(s => s.SensorType == SensorType.Temperature && TemperaturePolicy.IsLive(device.Identifier.ToString(), s.Index, s.Name)))
            {
                var sensorMetric = metric ?? (IsMemoryTemperature(sensor.Name) ? "ram" : null);
                var value = sensorMetric == "cpu" && !DriverReady ? null : TemperaturePolicy.Normalize(sensor.Value, sensorMetric);
                inventory.Add(new SensorInfo(sensor.Identifier.ToString(), sensor.Name, device.Name,
                    sensorMetric ?? (device.HardwareType == HardwareType.Storage ? "disk" : "cpu"),
                    value, value.HasValue ? TemperaturePolicy.Normalize(sensor.Min, sensorMetric) : null,
                    value.HasValue ? TemperaturePolicy.Normalize(sensor.Max, sensorMetric) : null, sensorMetric));
            }
        }
        var ramSensor = inventory.Where(s => s.Metric == "ram" && s.Temperature.HasValue).OrderByDescending(s => s.Temperature).FirstOrDefault();
        var cpuReading = ReadDevice(cpu, "cpu", DriverReady);
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
            ["ram"] = new(dimms.Count > 0 ? string.Join(" + ", dimms.Select(d => d.Name).Distinct()) : "System memory", hasMemory ? $"{total:F1} GB usable RAM" : "Memory unavailable", $"{dimms.Count} DIMM module(s) exposed · " + (hasMemory ? $"{total:F1} GB usable physical memory" : "Memory details unavailable"))
        };
        var devices = all.Where(h => Kind(h) != null).Select(h => new DeviceInfo(h.Identifier.ToString(), h.Name, Kind(h)!)).ToList();
        var cpuStatus = cpuReading.Temperature.HasValue ? "CPU temperature is available."
            : !DriverReady ? "CPU temperature needs PawnIO 2.0 or later. Install the bundled sensor driver, then restart Geronimo."
            : !_elevated ? "CPU temperature is unreadable. Restart as administrator to allow hardware access."
            : "CPU temperature is still unreadable. Check the driver installation, restart Windows if required, and compare sensor support with LibreHardwareMonitor.";
        var ramStatus = ramSensor != null ? "RAM temperature is available; the summary shows the hottest exposed RAM sensor."
            : !DriverReady ? "RAM and motherboard sensor access also needs PawnIO. Install it before checking module support."
            : !_elevated ? "Restart as administrator to check RAM SPD/SMBus temperature access."
            : dimms.Count == 0 ? "No DIMM modules were exposed over SMBus. Board/firmware access or provider support may be limiting detection."
            : "Detected DIMMs expose no readable live temperature. A module sensor or supported motherboard DRAM sensor is required.";
        var status = _openError ?? (!DriverReady ? "Sensor driver missing or outdated: PawnIO 2.0+ is required for CPU, RAM and motherboard access."
            : !_elevated ? "PawnIO detected. Some hardware sensors and frame capture may need administrator access."
            : "PawnIO detected · administrator access · temperatures are shown only for readable sensors.");
        var processList = includeProcesses ? ReadProcesses() : null;
        TargetProcess = processList?.FirstOrDefault(p => p.Id == TargetProcessId) ?? (!includeProcesses && TargetProcessId.HasValue ? ReadTargetProcess(TargetProcessId.Value) : null);
        return new Snapshot("telemetry", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), metadata,
            new() { ["cpu"] = cpuReading, ["gpu"] = gpuReading, ["ram"] = ramReading }, inventory, devices,
            total, used, Environment.OSVersion.Version.Build >= 22000 ? "Windows 11" : "Windows 10", status,
            processList, new SensorDiagnostics(DriverReady, _driverVersion?.ToString(), _elevated, cpuStatus, ramStatus));
    }

    private static void Update(IHardware device, List<IHardware> all)
    {
        try { device.Update(); } catch { return; /* Failed devices must not emit stale readings. */ }
        all.Add(device);
        foreach (var sub in device.SubHardware) Update(sub, all);
    }

    private static Reading ReadDevice(IHardware? device, string kind, bool allowTemperature = true)
    {
        if (device is null) return new Reading(null, null, null, null, "Unavailable");
        var loads = device.Sensors.Where(s => s.SensorType == SensorType.Load).ToList();
        var load = loads.FirstOrDefault(s => kind == "cpu" ? s.Name.Contains("Total", StringComparison.OrdinalIgnoreCase) : s.Name.Equals("GPU Core", StringComparison.OrdinalIgnoreCase));
        var temperature = allowTemperature ? device.Sensors.Where(s => s.SensorType == SensorType.Temperature
            && TemperaturePolicy.IsLive(device.Identifier.ToString(), s.Index, s.Name) && TemperaturePolicy.Normalize(s.Value, kind).HasValue)
            .OrderBy(s => TemperaturePolicy.Priority(s.Name, kind)).ThenByDescending(s => s.Value).FirstOrDefault() : null;
        var clocks = device.Sensors.Where(s => s.SensorType == SensorType.Clock && s.Name.Contains("Core", StringComparison.OrdinalIgnoreCase) && Finite(s.Value).HasValue).ToList();
        var clock = clocks.Count > 0 ? clocks.Average(s => s.Value!.Value) / 1000 : (float?)null;
        var power = device.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Power && (s.Name.Contains("Package", StringComparison.OrdinalIgnoreCase) || s.Name.Equals("GPU Power", StringComparison.OrdinalIgnoreCase)));
        return new Reading(Finite(load?.Value), TemperaturePolicy.Normalize(temperature?.Value, kind), Finite(clock), Finite(power?.Value), temperature?.Name ?? "Sensor access needed");
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
                    result.Add(ReadProcess(process, stamp));
                    alive.Add(process.Id);
                }
                catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException or NotSupportedException)
                { /* Processes can exit or deny access while being enumerated. */ }
            }
        }
        foreach (var id in _processTimes.Keys.Where(k => !alive.Contains(k)).ToList()) _processTimes.Remove(id);
        return result.OrderByDescending(p => p.Cpu ?? -1).ToList();
    }

    private ProcessInfo ReadProcess(Process process, long stamp)
    {
        var ticks = process.TotalProcessorTime.Ticks;
        double? usage = null;
        if (_processTimes.TryGetValue(process.Id, out var previous) && ticks >= previous.Ticks && stamp > previous.Stamp)
            usage = Math.Clamp((ticks - previous.Ticks) / (double)TimeSpan.TicksPerSecond / ((stamp - previous.Stamp) / (double)Stopwatch.Frequency) / Environment.ProcessorCount * 100, 0, 100);
        _processTimes[process.Id] = (ticks, stamp);
        return new ProcessInfo(process.Id, process.ProcessName, $"PID {process.Id}", "windows", usage, process.WorkingSet64 / 1048576d, null);
    }

    private ProcessInfo? ReadTargetProcess(int id)
    {
        try { using var process = Process.GetProcessById(id); return ReadProcess(process, Stopwatch.GetTimestamp()); }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException or ArgumentException or NotSupportedException)
        { _processTimes.Remove(id); return null; }
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

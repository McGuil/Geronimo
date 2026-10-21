using System.Diagnostics;
using System.Net.NetworkInformation;

namespace Geronimo.Desktop;

internal sealed class PerformanceService : IDisposable
{
    private readonly object _sync = new();
    private Task _lifecycle = Task.CompletedTask;
    private Process? _capture;
    private string? _session;
    private FrameStatistics? _frames;
    private int? _target;
    private long _generation;
    private bool _enabled;
    private bool _disposed;
    private string _status = "Select a running process and enable FPS or frame time.";
    private string _pingHost = "";
    private double? _ping;
    private string _pingStatus = "Ping disabled.";
    private DateTimeOffset _lastPing;
    private bool _pingBusy;

    public void Configure(int? pid, bool enabled)
    {
        lock (_sync)
        {
            if (_disposed || (_target == pid && _enabled == enabled)) return;
            _target = pid; _enabled = enabled;
            _frames = null;
            var generation = ++_generation;
            _status = enabled && pid.HasValue ? "Starting PresentMon frame capture…" : "Select a running process and enable FPS or frame time.";
            _lifecycle = _lifecycle.ContinueWith(async _ =>
            {
                await StopCaptureAsync().ConfigureAwait(false);
                lock (_sync)
                {
                    if (_disposed || generation != _generation || !enabled || !pid.HasValue) return;
                    StartCapture(pid.Value, generation);
                }
            }, TaskScheduler.Default).Unwrap();
        }
    }

    private void StartCapture(int pid, long generation)
    {
        var executable = Path.Combine(AppContext.BaseDirectory, "Tools", "PresentMon.exe");
        if (!File.Exists(executable)) { _status = "PresentMon component is missing. Reinstall the complete Geronimo package."; return; }
        _session = $"Geronimo-{Environment.ProcessId}-{generation}";
        var start = StartInfo(executable, "--process_id", pid.ToString(), "--session_name", _session,
            "--output_stdout", "--no_console_stats", "--v1_metrics", "--no_track_gpu", "--no_track_display", "--no_track_input", "--terminate_on_proc_exit");
        var process = new Process { StartInfo = start, EnableRaisingEvents = true };
        var frames = new FrameStatistics(pid);
        _frames = frames;
        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is not string line) return;
            lock (_sync) { if (generation == _generation) frames.Add(line, DateTimeOffset.UtcNow); }
        };
        // Drain stderr so a denied ETW session cannot deadlock the child process.
        process.ErrorDataReceived += (_, _) => { };
        process.Exited += (_, _) =>
        {
            lock (_sync)
                if (generation == _generation && !_disposed)
                { _frames = null; _status = "Frame capture stopped. The process may have exited or ETW access was denied. Restart as administrator, then reselect the process to retry."; }
        };
        try
        {
            process.Start(); _capture = process;
            process.BeginOutputReadLine(); process.BeginErrorReadLine();
            _status = "PresentMon active. Waiting for frames from the selected process.";
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException)
        { process.Dispose(); _capture = null; _status = "PresentMon could not start. Check the installation and administrator access."; }
    }

    public PerformanceInfo Read(ProcessInfo? target, string host, bool pingEnabled)
    {
        lock (_sync)
        {
            if (!pingEnabled || !ValidHost(host))
            { _pingHost = ""; _ping = null; _pingStatus = pingEnabled ? "Enter a hostname or IP address without a URL or port." : "Ping disabled."; }
            else
            {
                if (_pingHost != host) { _pingHost = host; _ping = null; _lastPing = default; _pingStatus = "Checking host…"; }
                if (!_pingBusy && DateTimeOffset.UtcNow - _lastPing > TimeSpan.FromSeconds(5))
                { _pingBusy = true; _lastPing = DateTimeOffset.UtcNow; _ = PollPingAsync(host); }
            }
            var frames = _frames?.Read(DateTimeOffset.UtcNow) ?? (null, null);
            var status = frames.Item1.HasValue ? "Live PresentMon present rate · busiest swap chain · 2-second average."
                : _status;
            if (_capture is { HasExited: false } && !frames.Item1.HasValue)
                status = "No recent frames. The selected app may be idle, minimized, or use an unsupported graphics path.";
            return new PerformanceInfo(_target, target?.Name, target?.Cpu, target?.Ram,
                target is null ? null : frames.Item1, target is null ? null : frames.Item2, _ping, host, status, _pingStatus);
        }
    }

    public static bool ValidHost(string host) => host.Length is > 0 and <= 253 && Uri.CheckHostName(host) != UriHostNameType.Unknown;
    private async Task PollPingAsync(string host)
    {
        double? milliseconds = null;
        var status = "No ICMP response. The host or network may block ping.";
        try
        {
            using var ping = new Ping();
            var reply = await ping.SendPingAsync(host, 900).WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false);
            if (reply.Status == IPStatus.Success) { milliseconds = reply.RoundtripTime; status = $"ICMP round-trip time to {host}."; }
        }
        catch (Exception e) when (e is PingException or TimeoutException or InvalidOperationException or ArgumentException) { }
        lock (_sync) { if (_pingHost == host && !_disposed) { _ping = milliseconds; _pingStatus = status; } _pingBusy = false; }
    }

    private static ProcessStartInfo StartInfo(string file, params string[] arguments)
    {
        var info = new ProcessStartInfo(file) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        return info;
    }
    private async Task StopCaptureAsync()
    {
        Process? process; string? session;
        lock (_sync) { process = _capture; session = _session; _capture = null; _session = null; }
        if (process is null) return;
        try
        {
            // Stop only our uniquely named session; never stop another monitor's session.
            if (session != null)
            {
                using var stop = Process.Start(StartInfo(Path.Combine(AppContext.BaseDirectory, "Tools", "PresentMon.exe"), "--session_name", session, "--terminate_existing_session"));
                if (stop != null) { try { await stop.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false); } catch (TimeoutException) { stop.Kill(); } }
            }
            if (!process.HasExited) { try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false); } catch (TimeoutException) { process.Kill(); } }
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException) { try { if (!process.HasExited) process.Kill(); } catch (InvalidOperationException) { } }
        finally { process.Dispose(); }
    }
    public void Dispose()
    {
        Task cleanup;
        lock (_sync)
        {
            if (_disposed) return;
            _disposed = true; ++_generation;
            cleanup = _lifecycle.ContinueWith(_ => StopCaptureAsync(), TaskScheduler.Default).Unwrap();
        }
        cleanup.GetAwaiter().GetResult();
    }
}

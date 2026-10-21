namespace Geronimo.Desktop;

internal sealed record HistorySample(long Timestamp, float? Cpu, float? Gpu, float? Ram);
internal sealed class TelemetryHistory
{
    private readonly Queue<HistorySample> _samples = new();
    public void Add(long timestamp, float? cpu, float? gpu, float? ram)
    {
        _samples.Enqueue(new HistorySample(timestamp, cpu, gpu, ram));
        while (_samples.Count > 1800) _samples.Dequeue();
    }
    public HistorySample[] Snapshot() => _samples.ToArray();
    public void ClearGpu()
    {
        var samples = _samples.Select(s => s with { Gpu = null }).ToArray();
        _samples.Clear();
        foreach (var sample in samples) _samples.Enqueue(sample);
    }
}

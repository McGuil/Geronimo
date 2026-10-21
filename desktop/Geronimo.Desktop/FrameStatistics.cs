using System.Globalization;
using System.Text;

namespace Geronimo.Desktop;

// PresentMon's documented v1 CSV contract. Ignore other PIDs and aggregate one swap chain.
internal sealed class FrameStatistics(int processId)
{
    private string[]? _header;
    private readonly Queue<(DateTimeOffset Received, string Chain, double Ms)> _frames = new();
    public void Add(string line, DateTimeOffset received)
    {
        var fields = SplitCsv(line);
        if (fields.Contains("ProcessID") && fields.Contains("MsBetweenPresents")) { _header = fields; return; }
        if (_header is null || fields.Length != _header.Length) return;
        string Field(string key) { var index = Array.IndexOf(_header, key); return index < 0 ? "" : fields[index]; }
        if (!int.TryParse(Field("ProcessID"), out var pid) || pid != processId
            || !double.TryParse(Field("MsBetweenPresents"), NumberStyles.Float, CultureInfo.InvariantCulture, out var ms)
            || !double.IsFinite(ms) || ms <= 0 || ms > 10000) return;
        _frames.Enqueue((received, Field("SwapChainAddress"), ms));
        Prune(received);
    }
    public (double? Fps, double? FrameTime) Read(DateTimeOffset now)
    {
        Prune(now);
        var main = _frames.GroupBy(f => f.Chain).OrderByDescending(g => g.Count()).FirstOrDefault();
        if (main is null) return (null, null);
        var average = main.Average(f => f.Ms);
        return (1000 / average, average);
    }
    private void Prune(DateTimeOffset now)
    {
        while (_frames.Count > 4096 || _frames.TryPeek(out var first) && now - first.Received > TimeSpan.FromSeconds(2)) _frames.Dequeue();
    }
    internal static string[] SplitCsv(string line)
    {
        var result = new List<string>();
        var field = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                if (quoted && i + 1 < line.Length && line[i + 1] == '"') { field.Append('"'); i++; }
                else quoted = !quoted;
            }
            else if (c == ',' && !quoted) { result.Add(field.ToString()); field.Clear(); }
            else field.Append(c);
        }
        result.Add(field.ToString());
        return result.ToArray();
    }
}

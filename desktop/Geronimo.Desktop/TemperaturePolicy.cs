namespace Geronimo.Desktop;

// The provider also labels SPD limits/resolution as Temperature. They are not measurements.
internal static class TemperaturePolicy
{
    public static bool IsLive(string deviceId, int index, string name) =>
        !(deviceId.StartsWith("/memory/dimm/", StringComparison.OrdinalIgnoreCase) && index != 0)
        && !name.Contains("Limit", StringComparison.OrdinalIgnoreCase)
        && !name.Contains("Resolution", StringComparison.OrdinalIgnoreCase)
        && !name.Contains("Distance", StringComparison.OrdinalIgnoreCase);

    public static float? Normalize(float? value, string? metric) =>
        value is float t && float.IsFinite(t) && t > -273.15f && t < 300
        // Failed PawnIO reads can be returned as zero (including Ryzen Tctl/Tdie).
        && (metric is not ("cpu" or "gpu" or "ram") || t is > 0 and <= 150) ? value : null;

    public static int Priority(string name, string kind) => kind == "gpu"
        ? name.Equals("GPU Core", StringComparison.OrdinalIgnoreCase) ? 0 : 10
        : name.Contains("Package", StringComparison.OrdinalIgnoreCase) ? 0
        : name.Contains("Tctl/Tdie", StringComparison.OrdinalIgnoreCase) ? 1
        : name.Contains("Tdie", StringComparison.OrdinalIgnoreCase) ? 2
        : name.Contains("Average", StringComparison.OrdinalIgnoreCase) ? 3 : 10;
}

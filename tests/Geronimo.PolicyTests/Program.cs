using Geronimo.Desktop;

var checks = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
Check(TemperaturePolicy.Normalize(0, "cpu") is null, "Failed Ryzen SMN reads must not display 0°C.");
Check(TemperaturePolicy.Normalize(-49, "cpu") is null, "Failed offset readings must remain unknown.");
Check(TemperaturePolicy.Normalize(float.NaN, "gpu") is null, "Nonfinite hardware values must remain unknown.");
Check(TemperaturePolicy.Normalize(62, "cpu") == 62, "Valid CPU measurements must pass through unchanged.");
Check(TemperaturePolicy.Normalize(42.75f, "ram") == 42.75f, "Fractional DIMM readings must retain precision.");
Check(!TemperaturePolicy.IsLive("/memory/dimm/0", 3, "Thermal Sensor High Limit"), "SPD high limits are not live DIMM readings.");
Check(!TemperaturePolicy.IsLive("/memory/dimm/0", 1, "Temperature Sensor Resolution"), "SPD resolution is not a temperature measurement.");
Check(TemperaturePolicy.IsLive("/memory/dimm/0", 0, "DIMM #0"), "The live SPD thermal sensor must be available.");
Check(TemperaturePolicy.IsLive("/lpc/nct6796d", 3, "System"), "Motherboard temperatures must remain enumerable.");
var candidates = new[] { ("CCD1 (Tdie)", 72f), ("Core (Tctl/Tdie)", 62f), ("Core #1", 65f) };
Check(candidates.OrderBy(s => TemperaturePolicy.Priority(s.Item1, "cpu")).First().Item2 == 62, "Ryzen package/control selection must not switch to the hottest CCD.");
Check(TemperaturePolicy.Priority("GPU Core", "gpu") < TemperaturePolicy.Priority("GPU Hot Spot", "gpu"), "GPU summary must prefer core over hotspot.");
var now = DateTimeOffset.UtcNow;
var frames = new FrameStatistics(123);
frames.Add("Application,ProcessID,SwapChainAddress,TimeInSeconds,MsBetweenPresents", now);
frames.Add("\"Game, \"\"Test\"\".exe\",123,0x1,1.0,10", now);
frames.Add("game.exe,123,0x1,1.02,20", now);
frames.Add("game.exe,123,0x2,1.02,100", now); // Secondary swap chain must not double-count FPS.
frames.Add("other.exe,456,0x1,1.02,1", now);
frames.Add("game.exe,123,0x1,1.02,NaN", now);
frames.Add("game.exe,123,0x1,1.02,0", now);
var result = frames.Read(now);
Check(result.FrameTime == 15 && Math.Abs(result.Fps!.Value - 1000d / 15) < .0001, "FPS must use measured intervals from the selected process and busiest swap chain.");
Check(frames.Read(now.AddSeconds(3)) == (null, null), "Idle or exited applications must not retain stale FPS.");
Check(FrameStatistics.SplitCsv("\"Game, \"\"Test\"\".exe\",123")[0] == "Game, \"Test\".exe", "CSV parser must support quoted executable names.");
frames.Add("unexpected,error,text", now);
Check(frames.Read(now).Fps is null, "Diagnostics must not become fake frame data.");
Console.WriteLine($"Passed {checks} sensor and frame-capture regression checks.");

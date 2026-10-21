namespace Geronimo.Desktop;

internal static class BrandIcon
{
    public static Icon Create(Size size)
    {
        using var stream = typeof(BrandIcon).Assembly.GetManifestResourceStream("Geronimo.AppIcon.ico")
            ?? throw new InvalidOperationException("The Geronimo application icon resource is missing.");
        using var icon = new Icon(stream, size);
        return (Icon)icon.Clone();
    }
}

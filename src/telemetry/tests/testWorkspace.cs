namespace SpellBook.Telemetry;
public static class TestWorkspace
{
    public static string Create()
    {
        var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName,".git")) && !File.Exists(Path.Combine(directory.FullName,".git"))) directory = directory.Parent;
        if (directory is null) throw new InvalidOperationException("Run tests within the repository");
        var root = Path.Combine(directory.FullName,".artifacts","tmp","telemetry","tests",Guid.NewGuid().ToString());
        Directory.CreateDirectory(root);
        return root;
    }
}

using CoreHost.Runtime;

namespace CoreHost.Tests.Runtime;

public sealed class EnvFileTests
{
    [Fact]
    public void loadsInlineCommentsWithoutChangingQuotedHashesOrExistingEnvironment()
    {
        var prefix = $"SPELLBOOK_ENV_TEST_{Guid.NewGuid():N}_";
        var path = Path.Combine(Path.GetTempPath(), $"{prefix}.env");
        (string Value, string Expected)[] cases =
        [
            ("0 # Default: 1900", "0"),
            ("1900\t# Default", "1900"),
            ("\"text # literal\" # comment", "text # literal"),
            ("'text # literal' # comment", "text # literal"),
            ("value#literal", "value#literal"),
            ("'C:\\game\\' # path", "C:\\game\\")
        ];
        try
        {
            Environment.SetEnvironmentVariable(prefix + "existing", "keep");
            File.WriteAllLines(path, cases.Select((item, index) => $"export {prefix}{index}={item.Value}")
                .Append($"{prefix}existing=replace # comment"));
            EnvFile.Load(path);
            for (var index = 0; index < cases.Length; index++)
                Assert.Equal(cases[index].Expected, Environment.GetEnvironmentVariable(prefix + index));
            Assert.Equal("keep", Environment.GetEnvironmentVariable(prefix + "existing"));
        }
        finally
        {
            for (var index = 0; index < cases.Length; index++) Environment.SetEnvironmentVariable(prefix + index, null);
            Environment.SetEnvironmentVariable(prefix + "existing", null);
            File.Delete(path);
        }
    }
}

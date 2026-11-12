namespace CoreHost.Chivalry2;

internal static class IniFileStore
{
    internal static async Task<byte[]> read(string path, CancellationToken cancellationToken)
    {
        try
        {
            return await File.ReadAllBytesAsync(path, cancellationToken);
        }
        catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException)
        {
            throw new Chivalry2ConfigException("INI_FILE_NOT_FOUND", $"{Path.GetFileName(path)} was not found.", 404);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            throw new Chivalry2ConfigException("INI_READ_FAILED", $"Could not read {Path.GetFileName(path)}: {error.Message}", 500);
        }
    }

    internal static async Task replace(string path, byte[] original, byte[] updated, CancellationToken cancellationToken)
    {
        var temporaryPath = $"{path}.{Guid.NewGuid():N}.tmp";
        try
        {
            await using (var temporary = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await temporary.WriteAsync(updated, cancellationToken);
                await temporary.FlushAsync(cancellationToken);
                temporary.Flush(flushToDisk: true);
            }

            // Keep new writers out while checking the snapshot and replacing the file.
            await using var current = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete, 4096, FileOptions.Asynchronous);
            using var buffer = new MemoryStream();
            await current.CopyToAsync(buffer, cancellationToken);
            if (!original.AsSpan().SequenceEqual(buffer.ToArray()))
            {
                throw new Chivalry2ConfigException("INI_FILE_CHANGED", $"{Path.GetFileName(path)} changed before the update could be saved. Read it again before retrying.", 409);
            }

            cancellationToken.ThrowIfCancellationRequested();
            File.Replace(temporaryPath, path, null);
        }
        catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException)
        {
            throw new Chivalry2ConfigException("INI_FILE_CHANGED", $"{Path.GetFileName(path)} disappeared before the update could be saved.", 409);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            throw new Chivalry2ConfigException("INI_WRITE_FAILED", $"Could not update {Path.GetFileName(path)}: {error.Message}", 500);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
    }
}

namespace WizeLens.Capture;

/// <summary>Pass-through stream that counts bytes and keeps the first bytes written when asked to.</summary>
internal sealed class CaptureStream(Stream inner, int keepLimit, Func<bool>? shouldKeep = null) : Stream
{
    private readonly MemoryStream _kept = new();
    private bool? _keep;

    public long Count { get; private set; }

    public ReadOnlyMemory<byte> Kept => _kept.GetBuffer().AsMemory(0, (int)_kept.Length);

    public override bool CanRead => inner.CanRead;
    public override bool CanSeek => false;
    public override bool CanWrite => inner.CanWrite;
    public override long Length => throw new NotSupportedException();

    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    public override void Flush() => inner.Flush();
    public override Task FlushAsync(CancellationToken cancellationToken) => inner.FlushAsync(cancellationToken);
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();

    public override int Read(byte[] buffer, int offset, int count) => Counted(inner.Read(buffer, offset, count));

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
        Counted(await inner.ReadAsync(buffer, cancellationToken).ConfigureAwait(false));

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

    public override void Write(byte[] buffer, int offset, int count)
    {
        Keep(buffer.AsSpan(offset, count));
        inner.Write(buffer, offset, count);
    }

    public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        Keep(buffer.Span);
        return inner.WriteAsync(buffer, cancellationToken);
    }

    public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        WriteAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

    private int Counted(int read)
    {
        Count += read;
        return read;
    }

    private void Keep(ReadOnlySpan<byte> data)
    {
        Count += data.Length;
        _keep ??= keepLimit > 0 && (shouldKeep?.Invoke() ?? true);
        if (!_keep.Value) return;
        var room = keepLimit - (int)_kept.Length;
        if (room > 0) _kept.Write(data[..Math.Min(room, data.Length)]);
    }
}

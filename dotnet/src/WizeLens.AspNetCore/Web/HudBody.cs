using System.IO.Pipelines;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;

namespace WizeLens.Web;

/// <summary>The response body while the HUD may go in: a full HTML page gets the tag before its last <c>&lt;/body&gt;</c>, anything else passes through.</summary>
internal sealed class HudBody(HttpContext context, IHttpResponseBodyFeature inner, Func<byte[]> tag, Action? decided = null) : Stream, IHttpResponseBodyFeature
{
    private HtmlTail? _tail;
    private bool _decided;
    private bool _finished;
    private bool _completed;
    private PipeWriter? _writer;

    /// <summary>True once the answer is known to be a page that can take the tag.</summary>
    internal bool Injecting => _tail is not null;

    Stream IHttpResponseBodyFeature.Stream => this;

    public PipeWriter Writer => _writer ??= PipeWriter.Create(this, new StreamPipeWriterOptions(leaveOpen: true));

    public void DisableBuffering() => inner.DisableBuffering();

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        Decide();
        await SendReadyAsync(cancellationToken);
        await inner.StartAsync(cancellationToken);
    }

    public Task SendFileAsync(string path, long offset, long? count, CancellationToken cancellationToken = default)
    {
        Decide();
        // A page file is read through this stream so it gets the tag; any other file goes out the fast way.
        return _tail is null
            ? inner.SendFileAsync(path, offset, count, cancellationToken)
            : SendFileFallback.SendFileAsync(this, path, offset, count, cancellationToken);
    }

    public async Task CompleteAsync()
    {
        if (_completed) return;
        _completed = true;
        await FinishAsync();
        await inner.CompleteAsync();
    }

    /// <summary>Sends what is held, with the tag when a <c>&lt;/body&gt;</c> is held; the middleware calls it when the app is done.</summary>
    public async Task FinishAsync()
    {
        if (_finished) return;
        if (_writer is not null) await _writer.CompleteAsync();
        _finished = true;
        Decide();
        if (_tail is null) return;
        foreach (var part in _tail.Finish(tag()))
        {
            await inner.Stream.WriteAsync(part);
        }
        _tail.Drop(_tail.Held.Length);
        await inner.Stream.FlushAsync();
    }

    // Decided at the first byte or flush, when the status and headers are set but not sent, so Content-Length can still go.
    private void Decide()
    {
        if (_decided) return;
        _decided = true;
        decided?.Invoke();
        var response = context.Response;
        if (response.HasStarted || !HudMiddleware.IsFullPage(response)) return;
        response.Headers.ContentLength = null;
        _tail = new HtmlTail();
    }

    public override bool CanRead => false;
    public override bool CanSeek => false;
    public override bool CanWrite => true;
    public override long Length => throw new NotSupportedException();

    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();

    public override void Flush()
    {
        Decide();
        SendReady();
        inner.Stream.Flush();
    }

    public override async Task FlushAsync(CancellationToken cancellationToken)
    {
        Decide();
        await SendReadyAsync(cancellationToken);
        await inner.Stream.FlushAsync(cancellationToken);
    }

    public override void Write(byte[] buffer, int offset, int count) => Write(buffer.AsSpan(offset, count));

    public override void Write(ReadOnlySpan<byte> buffer)
    {
        Decide();
        if (_tail is null)
        {
            inner.Stream.Write(buffer);
            return;
        }
        _tail.Append(buffer);
        SendReady();
    }

    public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        WriteAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        Decide();
        if (_tail is null)
        {
            await inner.Stream.WriteAsync(buffer, cancellationToken);
            return;
        }
        _tail.Append(buffer.Span);
        await SendReadyAsync(cancellationToken);
    }

    public override void WriteByte(byte value) => Write([value]);

    private void SendReady()
    {
        var ready = _tail?.Ready() ?? 0;
        if (ready == 0) return;
        inner.Stream.Write(_tail!.Held.Span[..ready]);
        _tail.Drop(ready);
    }

    private async ValueTask SendReadyAsync(CancellationToken cancellationToken)
    {
        var ready = _tail?.Ready() ?? 0;
        if (ready == 0) return;
        await inner.Stream.WriteAsync(_tail!.Held[..ready], cancellationToken);
        _tail.Drop(ready);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _tail?.Dispose();
        base.Dispose(disposing);
    }
}

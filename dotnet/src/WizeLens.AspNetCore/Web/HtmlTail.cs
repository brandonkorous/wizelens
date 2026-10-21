using System.Buffers;

namespace WizeLens.Web;

/// <summary>Holds the end of a streamed HTML body: from the last <c>&lt;/body&gt;</c> seen, else the few bytes that may start one.</summary>
internal sealed class HtmlTail : IDisposable
{
    // Past this many bytes after a </body>, that one is not the page's last (a string in a script, say) and goes out as is.
    internal const int MaxHeld = 32 * 1024;

    private static readonly byte[] Marker = "</body>"u8.ToArray();

    private byte[] _buffer = ArrayPool<byte>.Shared.Rent(1024);
    private int _length;
    private int _marker = -1;

    /// <summary>The bytes held now; the first <see cref="Ready"/> of them can be sent.</summary>
    public ReadOnlyMemory<byte> Held => _buffer.AsMemory(0, _length);

    /// <summary>How many leading held bytes can be sent: all but the last <c>&lt;/body&gt;</c> onward, or a possible start of one.</summary>
    public int Ready()
    {
        if (_marker >= 0 && _length - _marker > MaxHeld) _marker = -1;
        return _marker >= 0 ? _marker : Math.Max(0, _length - (Marker.Length - 1));
    }

    /// <summary>Adds written bytes and notes a <c>&lt;/body&gt;</c> in them, also one that started in the bytes held before.</summary>
    public void Append(ReadOnlySpan<byte> data)
    {
        if (data.IsEmpty) return;
        Grow(_length + data.Length);
        var from = Math.Max(0, _length - (Marker.Length - 1));
        data.CopyTo(_buffer.AsSpan(_length));
        _length += data.Length;
        var found = LastMarker(_buffer.AsSpan(0, _length), from);
        if (found >= 0) _marker = found;
    }

    /// <summary>Forgets the first <paramref name="count"/> bytes once they are sent.</summary>
    public void Drop(int count)
    {
        if (count <= 0) return;
        _buffer.AsSpan(count, _length - count).CopyTo(_buffer);
        _length -= count;
        if (_marker >= 0) _marker -= count;
    }

    /// <summary>The last held bytes in order with <paramref name="tag"/> before the held <c>&lt;/body&gt;</c>, or as is when none is held.</summary>
    public IEnumerable<ReadOnlyMemory<byte>> Finish(ReadOnlyMemory<byte> tag)
    {
        if (_marker < 0)
        {
            yield return Held;
            yield break;
        }
        yield return _buffer.AsMemory(0, _marker);
        yield return tag;
        yield return _buffer.AsMemory(_marker, _length - _marker);
    }

    /// <summary>The start of the last <c>&lt;/body&gt;</c> (any case) that begins at or after <paramref name="from"/>, or -1.</summary>
    internal static int LastMarker(ReadOnlySpan<byte> data, int from)
    {
        for (var i = data.Length - Marker.Length; i >= from; i--)
        {
            if (IsMarkerAt(data, i)) return i;
        }
        return -1;
    }

    private static bool IsMarkerAt(ReadOnlySpan<byte> data, int at)
    {
        for (var j = 0; j < Marker.Length; j++)
        {
            byte b = data[at + j], m = Marker[j];
            // ASCII letters match in any case; '<', '/' and '>' must match exactly.
            if (b != m && !(m is >= (byte)'a' and <= (byte)'z' && (b | 0x20) == m)) return false;
        }
        return true;
    }

    private void Grow(int needed)
    {
        if (needed <= _buffer.Length) return;
        var next = ArrayPool<byte>.Shared.Rent(Math.Max(needed, _buffer.Length * 2));
        _buffer.AsSpan(0, _length).CopyTo(next);
        ArrayPool<byte>.Shared.Return(_buffer);
        _buffer = next;
    }

    public void Dispose()
    {
        if (_buffer.Length == 0) return;
        ArrayPool<byte>.Shared.Return(_buffer);
        _buffer = [];
        _length = 0;
    }
}

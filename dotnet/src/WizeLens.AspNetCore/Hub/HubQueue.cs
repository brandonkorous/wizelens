namespace WizeLens.Hub;

/// <summary>The items waiting to go to the hub. Bounded: the oldest are dropped first.</summary>
internal sealed class HubQueue(int max)
{
    private readonly LinkedList<HubItem> _items = new();
    private readonly object _lock = new();

    public long Dropped { get; private set; }

    public int Count
    {
        get
        {
            lock (_lock) return _items.Count;
        }
    }

    public void Add(HubItem item)
    {
        lock (_lock)
        {
            _items.AddLast(item);
            while (_items.Count > max)
            {
                _items.RemoveFirst();
                Dropped++;
            }
        }
    }

    public List<HubItem> Take(int count)
    {
        lock (_lock)
        {
            var taken = new List<HubItem>(Math.Min(count, _items.Count));
            while (taken.Count < count && _items.First is { } first)
            {
                taken.Add(first.Value);
                _items.RemoveFirst();
            }
            return taken;
        }
    }

    /// <summary>Puts a batch that could not be sent back at the front, in order.</summary>
    public void PutBack(List<HubItem> items)
    {
        lock (_lock)
        {
            for (var i = items.Count - 1; i >= 0; i--) _items.AddFirst(items[i]);
            while (_items.Count > max)
            {
                _items.RemoveFirst();
                Dropped++;
            }
        }
    }
}

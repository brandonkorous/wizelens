using Dapper;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WizeLens;
using WizeLens.Data;
using WizeLens.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddWizeLens(o =>
{
    o.ServiceName = "gateway-api";
    o.EnableMcp = true;
});

var connectionString = builder.Configuration.GetConnectionString("Gateway") ?? "Data Source=gateway.db";
builder.Services.AddDbContext<GatewayDb>(o => o.UseSqlite(connectionString).UseWizeLens());
builder.Services.AddHttpClient("orders", c =>
{
    c.BaseAddress = new Uri(builder.Configuration["OrdersApi:BaseUrl"] ?? "http://localhost:5200");
    c.Timeout = TimeSpan.FromSeconds(5);
});

var app = builder.Build();

app.UseWizeLens();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GatewayDb>();
    db.Database.EnsureCreated();
    if (!db.Customers.Any())
    {
        db.Customers.AddRange(
            new Customer { Name = "Ada Lovelace", Email = "ada@example.com", Tier = "gold" },
            new Customer { Name = "Grace Hopper", Email = "grace@example.com", Tier = "gold" },
            new Customer { Name = "Alan Turing", Email = "alan@example.com", Tier = "silver" },
            new Customer { Name = "Katherine Johnson", Email = "katherine@example.com", Tier = "silver" },
            new Customer { Name = "Linus Torvalds", Email = "linus@example.com", Tier = "bronze" },
            new Customer { Name = "Margaret Hamilton", Email = "margaret@example.com", Tier = "gold" },
            new Customer { Name = "Dennis Ritchie", Email = "dennis@example.com", Tier = "bronze" },
            new Customer { Name = "Barbara Liskov", Email = "barbara@example.com", Tier = "silver" });
        db.SaveChanges();
    }
}

// A server-rendered page. Open http://localhost:5100/ to see the HUD that WizeLens puts on it.
app.MapGet("/", () => Results.Content(HomePage.Html, "text/html; charset=utf-8"));

app.MapGet("/api/health",() => Results.Ok(new { status = "ok", service = "gateway-api" }));

// Deliberate N+1: one query for the list, then one EF query AND one HTTP call per customer.
app.MapGet("/api/customers-with-orders", async (GatewayDb db, IHttpClientFactory httpClientFactory, ILogger<Program> logger, CancellationToken ct) =>
{
    WizeLensRequest.Tag("catalog");
    var ids = await db.Customers.Select(c => c.Id).ToListAsync(ct);
    logger.LogInformation("Loading orders for {Count} customers", ids.Count);

    var orders = httpClientFactory.CreateClient("orders");
    var result = new List<object>();
    var ordersApiDown = false;

    foreach (var id in ids)
    {
        var customer = await db.Customers.AsNoTracking().FirstAsync(c => c.Id == id, ct);

        object? customerOrders = null;
        if (!ordersApiDown)
        {
            try
            {
                customerOrders = await orders.GetFromJsonAsync<object>($"/orders?customerId={id}", ct);
            }
            catch (HttpRequestException ex)
            {
                ordersApiDown = true;
                logger.LogWarning(ex, "orders-api is not reachable. Returning customers without orders.");
            }
        }

        result.Add(new { customer.Id, customer.Name, customer.Email, customer.Tier, orders = customerOrders });
    }

    return Results.Ok(result);
});

// Driver-level capture: raw ADO.NET + Dapper through ProfiledDbConnection. The gold count is cached for 30 s.
var goldCache = new GoldCountCache();
app.MapGet("/api/raw-sql", async (CancellationToken ct) =>
{
    await using var connection = new ProfiledDbConnection(new SqliteConnection(connectionString));
    await connection.OpenAsync(ct);
    var tiers = await connection.QueryAsync<TierCount>(
        "SELECT Tier, COUNT(*) AS Count FROM Customers WHERE Tier <> @excluded GROUP BY Tier ORDER BY Count DESC",
        new { excluded = "platinum" });
    var gold = await goldCache.GetAsync(() =>
        connection.ExecuteScalarAsync<long>("SELECT COUNT(*) FROM Customers WHERE Tier = @tier", new { tier = "gold" }));
    WizeLensRequest.Tag("report");
    return Results.Ok(new { tiers, gold });
});

app.MapGet("/api/boom", (ILogger<Program> logger) =>
{
    logger.LogError("About to throw on purpose");
    throw new InvalidOperationException("Boom! This error was thrown on purpose to test WizeLens.");
});

app.Run();

public sealed class GatewayDb(DbContextOptions<GatewayDb> options) : DbContext(options)
{
    public DbSet<Customer> Customers => Set<Customer>();
}

public sealed class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Tier { get; set; } = "";
}

public sealed record TierCount(string Tier, long Count);

public sealed class GoldCountCache
{
    private long _value;
    private DateTime _expires = DateTime.MinValue;

    public async Task<long> GetAsync(Func<Task<long>> load)
    {
        var hit = DateTime.UtcNow < _expires;
        WizeLensRequest.Tag("cache", hit ? "hit" : "miss");
        if (hit) return _value;
        _value = await load();
        _expires = DateTime.UtcNow.AddSeconds(30);
        return _value;
    }
}

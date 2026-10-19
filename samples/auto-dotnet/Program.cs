using Microsoft.EntityFrameworkCore;

// This app has no WizeLens code. Start it with DOTNET_STARTUP_HOOKS pointing at WizeLens.AutoInstrumentation.dll and it is traced.
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<ShopDb>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Shop") ?? "Data Source=shop.db"));
builder.Services.AddHttpClient();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ShopDb>();
    db.Database.EnsureCreated();
    if (!db.Products.Any())
    {
        db.Products.AddRange(new Product { Name = "Keyboard", Price = 49 }, new Product { Name = "Mouse", Price = 19 }, new Product { Name = "Monitor", Price = 229 });
        db.SaveChanges();
    }
}

app.MapGet("/api/products", async (ShopDb db, ILogger<Program> logger) =>
{
    logger.LogInformation("Listing products");
    return await db.Products.OrderBy(p => p.Id).ToListAsync();
});

// Deliberate N+1: one query for the ids, then one query per product.
app.MapGet("/api/products/{id:int}/related", async (int id, ShopDb db) =>
{
    var ids = await db.Products.Where(p => p.Id != id).Select(p => p.Id).ToListAsync();
    var related = new List<Product>();
    foreach (var other in ids) related.Add(await db.Products.AsNoTracking().FirstAsync(p => p.Id == other));
    return related;
});

// An outgoing call: the HttpClient span joins this request's trace.
app.MapGet("/api/catalog", async (HttpContext context, IHttpClientFactory http) =>
{
    var client = http.CreateClient();
    var products = await client.GetFromJsonAsync<List<Product>>($"{context.Request.Scheme}://{context.Request.Host}/api/products");
    return new { count = products?.Count ?? 0, products };
});

app.MapGet("/api/boom", () =>
{
    throw new InvalidOperationException("Boom! Thrown on purpose to test the auto install.");
});

app.Run();

public sealed class ShopDb(DbContextOptions<ShopDb> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();
}

public sealed class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
}

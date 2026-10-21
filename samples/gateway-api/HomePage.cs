// A page the server renders: WizeLens puts the HUD on it in development, with no browser package.
public static class HomePage
{
    public const string Html = """
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>gateway-api</title>
          <style>
            body { font: 15px/1.5 system-ui, sans-serif; max-width: 720px; margin: 48px auto; padding: 0 16px; color: #1d2025; }
            .wl-sample-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
            .wl-sample-row button { font: inherit; padding: 8px 14px; border: 1px solid #c9ced6; border-radius: 8px; background: #fff; cursor: pointer; }
            .wl-sample-out { background: #f4f5f7; border-radius: 8px; padding: 12px; min-height: 48px; overflow: auto; font-size: 13px; }
          </style>
        </head>
        <body>
          <h1>gateway-api</h1>
          <p>
            ASP.NET Core renders this page. In development, WizeLens puts the HUD in its corner with no code:
            click a button and watch the card. The full trace is one click away, or at <a href="/_wizelens/">/_wizelens</a>.
          </p>
          <div class="wl-sample-row">
            <button type="button" data-url="/api/customers-with-orders">Customers with orders (N+1)</button>
            <button type="button" data-url="/api/raw-sql">Raw SQL with Dapper</button>
            <button type="button" data-url="/api/boom">Throw an error</button>
          </div>
          <pre class="wl-sample-out" id="out">Click a button.</pre>
          <script>
            const out = document.getElementById("out");
            for (const button of document.querySelectorAll("button[data-url]")) {
              button.addEventListener("click", async () => {
                out.textContent = "Loading…";
                const res = await fetch(button.dataset.url, { headers: { Accept: "application/json" } });
                const text = await res.text();
                out.textContent = `${res.status} ${button.dataset.url}\n\n${text.slice(0, 2000)}`;
              });
            }
          </script>
        </body>
        </html>
        """;
}

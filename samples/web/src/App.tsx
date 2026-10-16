import { Home } from "./Home";
import { ProductDetail, Products } from "./Products";
import { Link, match, usePath } from "./router";

function Route({ path }: { path: string }) {
  if (path === "/products") return <Products />;
  const detail = match("/products/:id", path);
  if (detail) return <ProductDetail id={Number(detail.id)} />;
  return <Home />;
}

export function App() {
  const path = usePath();
  return (
    <main className="page">
      <header>
        <h1>WizeLens sample shop</h1>
        <nav className="nav">
          <Link to="/" className={path === "/" ? "active" : undefined}>
            Home
          </Link>
          <Link to="/products" className={path.startsWith("/products") ? "active" : undefined}>
            Products
          </Link>
        </nav>
        <p>
          Click around. Then open the HUD in the bottom-right corner, or the <a href="/_wizelens/" target="_blank" rel="noreferrer">dashboard ↗</a>.
        </p>
      </header>
      <Route path={path} />
      <footer>
        Flow: <code>web :5173</code> → <code>gateway-api :5100</code> (.NET, EF Core) → <code>orders-api :5200</code> (Node, SQLite)
      </footer>
    </main>
  );
}

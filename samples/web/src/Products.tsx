import { ImageGallery, PriceTag, ProductCard } from "./components";
import { findProduct, PRODUCTS } from "./catalog";
import { Link } from "./router";
import { TickerProvider, useTicker } from "./ticker";

/** Reads the ticker itself, so the whole grid re-renders twice a second. */
function ProductGrid() {
  const tick = useTicker();
  return (
    <>
      <p className="muted">Prices refreshed {tick} times.</p>
      <div className="grid">
        {PRODUCTS.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </>
  );
}

export function Products() {
  return (
    <TickerProvider>
      <h2>Products</h2>
      <ProductGrid />
    </TickerProvider>
  );
}

export function ProductDetail({ id }: { id: number }) {
  const product = findProduct(id);
  if (!product) {
    return (
      <p>
        No product {id}. <Link to="/products">Back to products</Link>
      </p>
    );
  }
  return (
    <article className="detail">
      <Link to="/products">← All products</Link>
      <h2>{product.name}</h2>
      <ImageGallery name={product.name} />
      <p>{product.blurb}</p>
      <PriceTag price={product.price} />
    </article>
  );
}

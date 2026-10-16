import { Link } from "./router";
import type { Product } from "./catalog";
import { LiveBadge } from "./ticker";

/** Not memoized on purpose: it re-renders with the same props whenever its parent does. */
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/products/${product.id}`} className="card">
      <span className="swatch" style={{ background: product.color }} />
      <strong>{product.name}</strong>
      <PriceTag price={product.price} />
      <LiveBadge />
    </Link>
  );
}

export function PriceTag({ price }: { price: number }) {
  return <span className="price">${price.toFixed(2)}</span>;
}

/** The first image is far bigger than shown and not lazy. WizeLens counts it as a large image. */
export function ImageGallery({ name }: { name: string }) {
  return (
    <div className="gallery">
      <img src="/hero.svg" alt={`${name}, large photo`} width={320} height={213} />
      <div className="thumbs">
        {[1, 2, 3].map((n) => (
          <img key={n} src="/hero.svg" alt={`${name}, view ${n}`} width={96} height={64} loading="lazy" />
        ))}
      </div>
    </div>
  );
}

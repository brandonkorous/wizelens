export interface Product {
  id: number;
  name: string;
  price: number;
  color: string;
  blurb: string;
}

export const PRODUCTS: readonly Product[] = [
  { id: 1, name: "Keyboard", price: 89, color: "#2563eb", blurb: "Low-profile mechanical keys." },
  { id: 2, name: "Mouse", price: 49, color: "#22c55e", blurb: "Light, wireless, and quiet." },
  { id: 3, name: "Monitor", price: 329, color: "#f4b400", blurb: "27 inch, 1440p, 144 Hz." },
  { id: 4, name: "Headset", price: 119, color: "#f97316", blurb: "Closed-back with a boom mic." },
  { id: 5, name: "Webcam", price: 79, color: "#e63946", blurb: "1080p with auto focus." },
  { id: 6, name: "Dock", price: 159, color: "#64748b", blurb: "One cable for everything." },
];

export const findProduct = (id: number) => PRODUCTS.find((p) => p.id === id);

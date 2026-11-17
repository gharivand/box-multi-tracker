// A tiny fake storefront domain shared by the features. Plain TypeScript: no
// React and no analytics.

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly description: string;
}

export const PRODUCTS: readonly Product[] = [
  { id: "box-m", name: "Cardboard Box (Medium)", price: 4.5, description: "Double-wall, 40 x 30 x 25 cm." },
  { id: "tape-6", name: "Packing Tape (6 pack)", price: 12, description: "Clear, 48 mm x 66 m per roll." },
  { id: "wrap-l", name: "Bubble Wrap Roll", price: 18.75, description: "50 m roll, 10 mm bubbles." },
];

const LATENCY_MS = 300;

/** Simulates fetching a product from a backend. */
export async function fetchProduct(id: string): Promise<Product> {
  await new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));
  const product = PRODUCTS.find((candidate) => candidate.id === id);
  if (product === undefined) {
    throw new Error(`Product not found: ${id}`);
  }
  return product;
}

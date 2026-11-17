export interface Product {
  id: string;
  name: string;
  description: string;
  /** Whole US dollars, so totals need no rounding. */
  price: number;
  emoji: string;
  color: string;
}

export const PRODUCTS: readonly Product[] = [
  { id: "p-lamp", name: "Desk Lamp", description: "Warm, dimmable LED lamp with a flexible arm.", price: 49, emoji: "💡", color: "#fff4d6" },
  { id: "p-headphones", name: "Wireless Headphones", description: "Over-ear headphones with 30 hours of battery life.", price: 129, emoji: "🎧", color: "#e3ecff" },
  { id: "p-backpack", name: "Canvas Backpack", description: "Water-resistant backpack with a padded laptop sleeve.", price: 79, emoji: "🎒", color: "#e6f4ea" },
  { id: "p-bottle", name: "Steel Water Bottle", description: "Insulated bottle that keeps drinks cold for a full day.", price: 24, emoji: "🥤", color: "#e0f5f7" },
  { id: "p-notebook", name: "Dot Grid Notebook", description: "Hardcover notebook with 160 pages of thick paper.", price: 18, emoji: "📓", color: "#fdeceb" },
  { id: "p-keyboard", name: "Mechanical Keyboard", description: "Compact keyboard with tactile switches and a USB-C cable.", price: 99, emoji: "⌨️", color: "#efe9fb" },
];

export function findProduct(productId: string): Product | undefined {
  return PRODUCTS.find((product) => product.id === productId);
}

/** Case-insensitive match on name or description. An empty query matches everything. */
export function searchProducts(query: string): readonly Product[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return PRODUCTS;
  return PRODUCTS.filter(
    (product) => product.name.toLowerCase().includes(needle) || product.description.toLowerCase().includes(needle),
  );
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatPrice(price: number): string {
  return usd.format(price);
}

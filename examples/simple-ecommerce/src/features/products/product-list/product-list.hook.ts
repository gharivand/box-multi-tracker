import { useState } from "react";
import { useShop } from "../../../app/providers/shop.context";
import { trackProductViewed, trackSearchPerformed } from "../../../analytics/tracking";
import { searchProducts } from "../../../domain/catalog";
import type { Product } from "../../../domain/catalog";

export function useProductList() {
  const { navigate } = useShop();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  function search(): void {
    const trimmed = draft.trim();
    setQuery(trimmed);
    // Only a real search is tracked: clearing the box is not a search.
    if (trimmed !== "") {
      trackSearchPerformed(trimmed, searchProducts(trimmed).length);
    }
  }

  function clear(): void {
    setDraft("");
    setQuery("");
  }

  function openProduct(product: Product): void {
    trackProductViewed(product.id, product.name, product.price);
    navigate({ page: "product", productId: product.id });
  }

  return { draft, query, products: searchProducts(query), setDraft, search, clear, openProduct };
}

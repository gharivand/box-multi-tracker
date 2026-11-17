import { describe, expect, it } from "vitest";
import { cartItemCount, cartReducer, cartTotal, detailLines, emptyCart } from "./cart";

describe("cartReducer", () => {
  it("adds a product and merges repeated adds", () => {
    let cart = cartReducer(emptyCart, { type: "add", productId: "p-lamp", quantity: 1 });
    cart = cartReducer(cart, { type: "add", productId: "p-lamp", quantity: 2 });
    expect(cart).toEqual([{ productId: "p-lamp", quantity: 3 }]);
  });

  it("caps the quantity", () => {
    const cart = cartReducer(emptyCart, { type: "add", productId: "p-lamp", quantity: 50 });
    expect(cart).toEqual([{ productId: "p-lamp", quantity: 10 }]);
  });

  it("removes a line when its quantity drops below one", () => {
    const cart = cartReducer([{ productId: "p-lamp", quantity: 1 }], {
      type: "setQuantity",
      productId: "p-lamp",
      quantity: 0,
    });
    expect(cart).toEqual([]);
  });

  it("removes and clears", () => {
    const cart = [
      { productId: "p-lamp", quantity: 1 },
      { productId: "p-bottle", quantity: 2 },
    ];
    expect(cartReducer(cart, { type: "remove", productId: "p-lamp" })).toEqual([{ productId: "p-bottle", quantity: 2 }]);
    expect(cartReducer(cart, { type: "clear" })).toEqual([]);
  });
});

describe("cart totals", () => {
  it("computes the total and item count from the catalog", () => {
    const lines = detailLines([
      { productId: "p-lamp", quantity: 2 }, // 49
      { productId: "p-bottle", quantity: 1 }, // 24
    ]);
    expect(cartTotal(lines)).toBe(122);
    expect(cartItemCount(lines)).toBe(3);
  });

  it("ignores lines for unknown products", () => {
    expect(detailLines([{ productId: "missing", quantity: 1 }])).toEqual([]);
  });
});

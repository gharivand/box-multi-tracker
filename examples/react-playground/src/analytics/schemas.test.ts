import { describe, expect, it } from "vitest";
import { appEventValidator } from "./schemas";

function validate<K extends Parameters<typeof appEventValidator.validate>[0]>(
  name: K,
  payload: Parameters<typeof appEventValidator.validate<K>>[1],
) {
  return appEventValidator.validate(name, payload);
}

describe("appEventValidator", () => {
  it("transforms a text total into a number", () => {
    expect(validate("order_completed", { orderId: "A-1", totalPrice: "500", itemsCount: 2 })).toEqual({
      success: true,
      data: { orderId: "A-1", totalPrice: 500, itemsCount: 2 },
    });
  });

  it("keeps a numeric total as it is", () => {
    expect(validate("order_completed", { orderId: "A-1", totalPrice: 12.5, itemsCount: 1 })).toEqual({
      success: true,
      data: { orderId: "A-1", totalPrice: 12.5, itemsCount: 1 },
    });
  });

  it("trims names and converts text prices", () => {
    expect(validate("product_viewed", { productId: "p", productName: "  Box  ", price: "4.50" })).toEqual({
      success: true,
      data: { productId: "p", productName: "Box", price: 4.5 },
    });
  });

  it("reports every problem of an invalid order with its path", () => {
    const result = validate("order_completed", { orderId: "", totalPrice: 10, itemsCount: -1 });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((issue) => issue.path)).toEqual([["orderId"], ["itemsCount"]]);
  });

  it("rejects a price that is not a number", () => {
    const result = validate("product_viewed", { productId: "p", productName: "Box", price: "abc" });

    expect(result.success).toBe(false);
  });

  it("accepts payloadless and enumerated events", () => {
    expect(validate("user_signed_out", undefined)).toEqual({ success: true, data: undefined });
    expect(validate("user_signed_in", { userId: "u-1", method: "google" })).toEqual({
      success: true,
      data: { userId: "u-1", method: "google" },
    });
  });
});

describe("appEventValidator messages", () => {
  it("explains an invalid price in one readable message", () => {
    const result = validate("product_viewed", { productId: "p", productName: "Box", price: "abc" });

    expect(result).toEqual({
      success: false,
      issues: [{ message: "must be a non-negative number, or text such as 12.50", path: ["price"] }],
    });
  });

  it("rejects a negative numeric price", () => {
    expect(validate("product_viewed", { productId: "p", productName: "Box", price: -1 }).success).toBe(false);
  });
});

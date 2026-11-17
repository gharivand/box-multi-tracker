import type { ValidationScenario } from "./validation-demo.types";

export const SCENARIOS: readonly ValidationScenario[] = [
  {
    id: "order-text-total",
    title: "Valid order, total sent as text",
    description:
      'Tracks totalPrice: "500" (text). Providers receive totalPrice: 500 (a number): validation passed and transformed the payload.',
    outcome: "delivered-transformed",
    send: (tracking) => tracking.orderCompleted({ orderId: "A-100", totalPrice: "500", itemsCount: 2 }),
  },
  {
    id: "product-text-price",
    title: "Valid product, messy input",
    description:
      'Tracks a padded name and price: "4.50". Providers receive the trimmed name and price: 4.5.',
    outcome: "delivered-transformed",
    send: (tracking) =>
      tracking.productViewed({ productId: "box-m", productName: "  Cardboard Box (Medium)  ", price: "4.50" }),
  },
  {
    id: "order-invalid",
    title: "Invalid order",
    description:
      "Tracks an empty orderId and itemsCount: -1. Validation fails with two issues; no provider receives the event.",
    outcome: "rejected",
    send: (tracking) => tracking.orderCompleted({ orderId: "", totalPrice: 10, itemsCount: -1 }),
  },
  {
    id: "product-invalid-price",
    title: "Invalid product price",
    description:
      'Tracks price: "abc". Validation fails; no provider receives the event, including providers that are enabled.',
    outcome: "rejected",
    send: (tracking) => tracking.productViewed({ productId: "box-m", productName: "Cardboard Box", price: "abc" }),
  },
];

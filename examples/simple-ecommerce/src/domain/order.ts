/** A mock order number. There is no backend that assigns real ones. */
export function createOrderId(): string {
  return `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

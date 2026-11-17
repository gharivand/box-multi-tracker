/**
 * The application's event map. Event names and payloads belong to the
 * consuming application, never to the SDK.
 *
 * An `interface` is accepted by the SDK's `EventMap` constraint.
 */
export interface AppEvents {
  user_signed_in: {
    userId: string;
    method: "email" | "google";
  };

  product_viewed: {
    productId: string;
    productName: string;
    price: number;
  };

  order_completed: {
    orderId: string;
    totalPrice: number;
    itemsCount: number;
  };

  /** No payload. */
  user_signed_out: undefined;
}

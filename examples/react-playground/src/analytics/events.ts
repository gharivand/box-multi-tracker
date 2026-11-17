/**
 * The application's event map: the payloads providers receive, after
 * validation and transformation. Event names and payloads belong to the
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

/**
 * What callers may pass to `track`. It differs from `AppEvents` where the
 * validator transforms a payload: prices may arrive as text ("4.50") and are
 * converted to numbers before providers see them.
 *
 * `schemas.ts` must produce exactly `AppEvents` from exactly these inputs;
 * the compiler checks it.
 */
export interface AppEventInputs {
  user_signed_in: {
    userId: string;
    method: "email" | "google";
  };

  product_viewed: {
    productId: string;
    productName: string;
    price: number | string;
  };

  order_completed: {
    orderId: string;
    totalPrice: number | string;
    itemsCount: number;
  };

  user_signed_out: undefined;
}

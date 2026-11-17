/**
 * Events of the Application Analytics instance: general user and application
 * activity. `undefined` marks a payloadless event.
 */
export interface ApplicationEvents {
  user_signed_in: { userId: string };
  user_signed_out: undefined;
  product_viewed: { productId: string; productName: string; price: number };
  search_performed: { query: string; resultCount: number };
}

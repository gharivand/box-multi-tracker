import { applicationAnalytics } from "./instances/application-analytics";
import { commerceAnalytics } from "./instances/commerce-analytics";

/**
 * Semantic tracking functions. Features call these; they do not know the SDK,
 * the providers, or which instance handles which event.
 */

// Application Analytics

export function trackUserSignedIn(userId: string): void {
  applicationAnalytics.track("user_signed_in", { userId });
}

export function trackUserSignedOut(): void {
  applicationAnalytics.track("user_signed_out");
}

export function trackProductViewed(productId: string, productName: string, price: number): void {
  applicationAnalytics.track("product_viewed", { productId, productName, price });
}

export function trackSearchPerformed(query: string, resultCount: number): void {
  applicationAnalytics.track("search_performed", { query, resultCount });
}

// Commerce Analytics

export function trackProductAddedToCart(productId: string, quantity: number, price: number): void {
  commerceAnalytics.track("product_added_to_cart", { productId, quantity, price });
}

export function trackCheckoutStarted(total: number, itemCount: number): void {
  commerceAnalytics.track("checkout_started", { total, itemCount });
}

export function trackOrderCompleted(orderId: string, total: number, itemCount: number): void {
  commerceAnalytics.track("order_completed", { orderId, total, itemCount });
}

/**
 * Demo only: a payload that satisfies the TypeScript type but breaks a runtime
 * rule (`quantity` must be at least 1), so the Zod validator rejects it.
 */
export function trackInvalidCartEventForDemo(): void {
  commerceAnalytics.track("product_added_to_cart", { productId: "demo", quantity: 0, price: 10 });
}

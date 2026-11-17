import type { AnalyticsInstance } from "box-multi-tracker";
import type { AppEventInputs, AppEvents } from "./events";

/**
 * Semantic tracking API used by features. Features depend on this interface,
 * not on the SDK or on any provider, so the analytics stack can change without
 * touching feature code.
 *
 * Payload types are the validator's input types: callers may pass what the
 * validator accepts (for example a price as text), and providers receive the
 * validated output declared by `AppEvents`.
 */
export interface Tracking {
  userSignedIn(payload: AppEventInputs["user_signed_in"]): void;
  productViewed(payload: AppEventInputs["product_viewed"]): void;
  orderCompleted(payload: AppEventInputs["order_completed"]): void;
  userSignedOut(): void;
}

/**
 * Wraps a single `track` call. The default just performs it; the playground
 * passes an implementation that records the dispatch for the live event log.
 */
export type TrackingScope = (eventName: keyof AppEvents, payload: unknown, send: () => void) => void;

const directly: TrackingScope = (_eventName, _payload, send) => send();

/** Maps semantic methods onto a configured analytics instance. */
export function createTracking(
  analytics: AnalyticsInstance<AppEvents, AppEventInputs>,
  scope: TrackingScope = directly,
): Tracking {
  return {
    userSignedIn: (payload) =>
      scope("user_signed_in", payload, () => analytics.track("user_signed_in", payload)),
    productViewed: (payload) =>
      scope("product_viewed", payload, () => analytics.track("product_viewed", payload)),
    orderCompleted: (payload) =>
      scope("order_completed", payload, () => analytics.track("order_completed", payload)),
    userSignedOut: () =>
      scope("user_signed_out", undefined, () => analytics.track("user_signed_out")),
  };
}

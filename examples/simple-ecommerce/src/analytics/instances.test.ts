import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventLog } from "./event-log";
import type { EventLog } from "./event-log";
import { createApplicationAnalytics } from "./instances/application-analytics";
import { createCommerceAnalytics } from "./instances/commerce-analytics";
import type { FaultSwitch } from "./providers/commerce.providers";

const BACKEND_LATENCY_MS = 300;

describe("the two analytics instances", () => {
  let log: EventLog;
  let backendFault: FaultSwitch;
  let application: ReturnType<typeof createApplicationAnalytics>;
  let commerce: ReturnType<typeof createCommerceAnalytics>;

  /** `instance/provider` for every entry that was delivered, in log order. */
  const delivered = (): string[] =>
    log
      .getEntries()
      .filter((entry) => entry.status === "delivered")
      .map((entry) => `${entry.instance}/${entry.provider}`);

  beforeEach(() => {
    vi.useFakeTimers();
    log = createEventLog();
    backendFault = { failing: false };
    application = createApplicationAnalytics(log);
    commerce = createCommerceAnalytics(log, backendFault);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with every provider enabled", () => {
    expect(application.isProviderEnabled("analyticsProvider")).toBe(true);
    expect(application.isProviderEnabled("activityLogProvider")).toBe(true);
    expect(commerce.isProviderEnabled("backendProvider")).toBe(true);
    expect(commerce.isProviderEnabled("commerceLogProvider")).toBe(true);
  });

  it("delivers an application event only through the application providers", async () => {
    application.track("product_viewed", { productId: "p-lamp", productName: "Desk Lamp", price: 49 });
    await vi.advanceTimersByTimeAsync(BACKEND_LATENCY_MS);

    expect(delivered()).toEqual(["application/analyticsProvider", "application/activityLogProvider"]);
  });

  it("delivers a commerce event only through the commerce providers, the async one later", async () => {
    commerce.track("checkout_started", { total: 100, itemCount: 2 });
    expect(delivered()).toEqual(["commerce/commerceLogProvider"]);

    await vi.advanceTimersByTimeAsync(BACKEND_LATENCY_MS);
    expect(delivered()).toEqual(["commerce/commerceLogProvider", "commerce/backendProvider"]);
  });

  it("accepts payloadless events", () => {
    application.track("user_signed_out");
    expect(delivered()).toEqual(["application/analyticsProvider", "application/activityLogProvider"]);
  });

  it("disabling a provider in one instance does not affect the other", async () => {
    application.disableProvider("activityLogProvider");

    expect(application.isProviderEnabled("activityLogProvider")).toBe(false);
    expect(application.isProviderEnabled("analyticsProvider")).toBe(true);
    expect(commerce.isProviderEnabled("backendProvider")).toBe(true);
    expect(commerce.isProviderEnabled("commerceLogProvider")).toBe(true);

    application.track("search_performed", { query: "lamp", resultCount: 1 });
    commerce.track("order_completed", { orderId: "ORD-1", total: 49, itemCount: 1 });
    await vi.advanceTimersByTimeAsync(BACKEND_LATENCY_MS);

    expect(delivered()).toEqual([
      "application/analyticsProvider",
      "commerce/commerceLogProvider",
      "commerce/backendProvider",
    ]);
  });

  it("disabling a commerce provider does not affect the application instance", () => {
    commerce.disableProvider("commerceLogProvider");
    commerce.disableProvider("backendProvider");

    application.track("user_signed_in", { userId: "demo-user" });

    expect(application.isProviderEnabled("analyticsProvider")).toBe(true);
    expect(delivered()).toEqual(["application/analyticsProvider", "application/activityLogProvider"]);
  });

  it("keeps a failing backend from affecting the other commerce provider", async () => {
    backendFault.failing = true;

    commerce.track("order_completed", { orderId: "ORD-2", total: 20, itemCount: 1 });
    await vi.advanceTimersByTimeAsync(BACKEND_LATENCY_MS);

    expect(delivered()).toEqual(["commerce/commerceLogProvider"]);
    const errors = log.getEntries().filter((entry) => entry.status === "provider-error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ instance: "commerce", provider: "backendProvider", eventName: "order_completed" });
  });

  it("rejects a commerce payload that breaks a runtime rule, before any provider", async () => {
    commerce.track("product_added_to_cart", { productId: "p-lamp", quantity: 0, price: 49 });
    await vi.advanceTimersByTimeAsync(BACKEND_LATENCY_MS);

    expect(delivered()).toEqual([]);
    const [entry] = log.getEntries();
    expect(entry).toMatchObject({ instance: "commerce", provider: null, status: "rejected" });
    expect(entry?.detail).toContain("quantity");
  });
});

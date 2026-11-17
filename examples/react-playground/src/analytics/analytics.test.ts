import { describe, expect, it } from "vitest";
import { createAppAnalytics } from "./analytics";
import { createDispatchLog, samePayload } from "./dispatch-log";

function setup() {
  const log = createDispatchLog();
  const app = createAppAnalytics({
    instanceId: "a",
    label: "A",
    log,
    providers: [
      { kind: "mock-analytics", enabled: true },
      { kind: "console", enabled: true },
    ],
  });
  return { log, app };
}

describe("validation in the playground analytics", () => {
  it("delivers the transformed payload to every provider and keeps the tracked input", () => {
    const { log, app } = setup();

    app.tracking.orderCompleted({ orderId: "A-1", totalPrice: "500", itemsCount: 2 });

    const [entry] = log.getSnapshot();
    expect(entry?.payload).toEqual({ orderId: "A-1", totalPrice: "500", itemsCount: 2 });
    expect(entry?.validationIssues).toBeUndefined();
    expect(entry?.deliveries.map((delivery) => delivery.receivedPayload)).toEqual([
      { orderId: "A-1", totalPrice: 500, itemsCount: 2 },
      { orderId: "A-1", totalPrice: 500, itemsCount: 2 },
    ]);
    expect(samePayload(entry?.payload, entry?.deliveries[0]?.receivedPayload)).toBe(false);
  });

  it("delivers an already valid payload unchanged", () => {
    const { log, app } = setup();

    app.tracking.orderCompleted({ orderId: "A-1", totalPrice: 500, itemsCount: 2 });

    const [entry] = log.getSnapshot();
    expect(entry?.deliveries).toHaveLength(2);
    expect(samePayload(entry?.payload, entry?.deliveries[0]?.receivedPayload)).toBe(true);
  });

  it("rejects an invalid event: issues are recorded and no provider receives it", () => {
    const { log, app } = setup();

    app.tracking.orderCompleted({ orderId: "", totalPrice: 10, itemsCount: -1 });

    const [entry] = log.getSnapshot();
    expect(entry?.deliveries).toEqual([]);
    expect(entry?.validationIssues?.map((issue) => issue.path)).toEqual([["orderId"], ["itemsCount"]]);
  });

  it("keeps delivering valid events after a rejected one", () => {
    const { log, app } = setup();

    app.tracking.productViewed({ productId: "p", productName: "Box", price: "abc" });
    app.tracking.productViewed({ productId: "p", productName: "Box", price: "4.50" });

    const [rejected, delivered] = log.getSnapshot();
    expect(rejected?.validationIssues).toBeDefined();
    expect(delivered?.validationIssues).toBeUndefined();
    expect(delivered?.deliveries).toHaveLength(2);
  });
});

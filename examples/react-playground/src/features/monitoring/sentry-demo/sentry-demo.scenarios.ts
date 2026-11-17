import type { SentryDemoContext, SentryScenario } from "./sentry-demo.types";

/** Personal data tracked in the privacy scenario. It must not reach Sentry. */
export const PRIVATE_USER_ID = "ada.private@example.com";

/** Runs `action` while the flaky provider throws, then restores its previous mode. */
function withFlakyProviderThrowing(context: SentryDemoContext, action: () => void): void {
  const previous = context.failure.getMode();
  context.failure.setMode("throw");
  try {
    action();
  } finally {
    context.failure.setMode(previous);
  }
}

export const SCENARIOS: readonly SentryScenario[] = [
  {
    id: "provider-error",
    title: "Provider error",
    description:
      "A valid order is tracked while flaky-service throws. The SDK isolates the failure (the other providers still receive the event) and reports it through onError, which the adapter sends to Sentry.",
    expectation: "reported",
    needsFlakyProvider: true,
    run: (context) =>
      withFlakyProviderThrowing(context, () =>
        context.tracking.orderCompleted({ orderId: "A-100", totalPrice: "500", itemsCount: 2 }),
      ),
  },
  {
    id: "validator-exception",
    title: "Validator exception",
    description:
      "A valid product is tracked while the validator itself crashes. The SDK fails closed (no provider receives the event) and reports it through onValidationError with a cause, which the adapter sends to Sentry.",
    expectation: "reported",
    needsFlakyProvider: false,
    run: (context) => {
      context.validatorFault.arm();
      try {
        context.tracking.productViewed({ productId: "box-m", productName: "Cardboard Box", price: "4.50" });
      } finally {
        context.validatorFault.disarm();
      }
    },
  },
  {
    id: "ordinary-validation-failure",
    title: "Ordinary validation failure",
    description:
      "An invalid order (empty orderId, itemsCount -1). Validation rejects it and onValidationError is called, but this is expected input, not a bug, so the adapter sends nothing to Sentry. The event log still shows it.",
    expectation: "not-reported",
    needsFlakyProvider: false,
    run: (context) => context.tracking.orderCompleted({ orderId: "", totalPrice: 10, itemsCount: -1 }),
  },
  {
    id: "payload-privacy",
    title: "Personal data in the payload",
    description: `A sign-in whose payload contains "${PRIVATE_USER_ID}" is tracked while flaky-service throws. The provider error is reported to Sentry, and every captured event is searched for that text.`,
    expectation: "reported",
    needsFlakyProvider: true,
    privateText: PRIVATE_USER_ID,
    run: (context) =>
      withFlakyProviderThrowing(context, () =>
        context.tracking.userSignedIn({ userId: PRIVATE_USER_ID, method: "email" }),
      ),
  },
];

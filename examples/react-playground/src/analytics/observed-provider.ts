import type { AnalyticsProvider } from "box-multi-tracker";
import type { DeliveryHandle } from "./dispatch-log";
import type { AppEvents } from "./events";

export interface DeliveryRecorder {
  start(providerName: string, event: { name: string; payload: unknown }): DeliveryHandle;
}

const noop = (): void => {};
const NO_RECORDING: DeliveryHandle = { succeed: noop, fail: noop };

/**
 * Starts recording a delivery. Recording is a side concern: if the recorder
 * throws, whether on `start` or later on `succeed` / `fail`, the provider's own
 * outcome must stay exactly as it was, so those failures are swallowed.
 */
function startDelivery(
  recorder: DeliveryRecorder,
  providerName: string,
  event: { name: string; payload: unknown },
): DeliveryHandle {
  try {
    const delivery = recorder.start(providerName, event);
    return {
      succeed: () => {
        try {
          delivery.succeed();
        } catch {
          // Never let logging affect the provider.
        }
      },
      fail: (error) => {
        try {
          delivery.fail(error);
        } catch {
          // Never let logging affect the provider.
        }
      },
    };
  } catch {
    return NO_RECORDING;
  }
}

/**
 * Records the outcome of a provider result the same way the SDK observes it:
 * objects and functions are passed through `Promise.resolve`, so native
 * promises and other thenables are followed, and anything else counts as an
 * immediate success.
 *
 * The derived promise cannot reject: both callbacks are non-throwing, so this
 * never produces an unhandled rejection. The provider's own promise is not
 * modified; its rejection is still delivered to whoever holds it (the SDK).
 */
function observeOutcome(result: unknown, delivery: DeliveryHandle): void {
  const objectLike = (typeof result === "object" && result !== null) || typeof result === "function";
  if (!objectLike) {
    delivery.succeed();
    return;
  }
  try {
    Promise.resolve(result).then(
      () => delivery.succeed(),
      (error: unknown) => delivery.fail(error),
    );
  } catch (error) {
    // Inspecting an unusual object can throw synchronously; the SDK hits the same error.
    delivery.fail(error);
  }
}

/**
 * Decorator that records every invocation and outcome of a provider.
 *
 * It is transparent to the SDK (Liskov): same `name`, the provider's own return
 * value is returned untouched (same object), and a synchronous throw is
 * rethrown unchanged. The SDK therefore still sees exactly what the provider
 * produced and reports failures to `onError` itself.
 *
 * Observing a custom thenable calls its `then` once more, exactly as the SDK
 * does when it observes the same value.
 */
export function observeProvider(
  provider: AnalyticsProvider<AppEvents>,
  recorder: DeliveryRecorder,
): AnalyticsProvider<AppEvents> {
  return {
    name: provider.name,
    track(event) {
      const delivery = startDelivery(recorder, provider.name, event);

      let result: unknown;
      try {
        result = provider.track(event);
      } catch (error) {
        delivery.fail(error);
        throw error;
      }

      observeOutcome(result, delivery);
      return result as void | Promise<void>;
    },
  };
}

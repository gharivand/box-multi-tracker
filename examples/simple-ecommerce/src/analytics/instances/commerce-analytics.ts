import { createAnalytics } from "box-multi-tracker";
import { eventLog, logProviderError, logValidationError } from "../event-log";
import type { EventLog } from "../event-log";
import { commerceValidator } from "../events/commerce.events";
import type { CommerceEvents } from "../events/commerce.events";
import { createBackendProvider, createCommerceLogProvider } from "../providers/commerce.providers";
import type { FaultSwitch } from "../providers/commerce.providers";

/**
 * Commerce Analytics: shopping and checkout activity. A separate instance from
 * Application Analytics, with its own Event Map, providers and enabled flags.
 * Events are validated with Zod before any provider sees them.
 */
export function createCommerceAnalytics(log: EventLog, backendFault: FaultSwitch) {
  return createAnalytics<CommerceEvents, CommerceEvents>({
    providers: [{ provider: createBackendProvider(log, backendFault) }, { provider: createCommerceLogProvider(log) }],
    validator: commerceValidator,
    onError: (error) => logProviderError(log, "commerce", error),
    onValidationError: (error) => logValidationError(log, "commerce", error),
  });
}

/** Turned on from the analytics panel to simulate a backend outage. */
export const backendFault: FaultSwitch = { failing: false };

export const commerceAnalytics = createCommerceAnalytics(eventLog, backendFault);

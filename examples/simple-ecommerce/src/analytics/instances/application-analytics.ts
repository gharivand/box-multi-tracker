import { createAnalytics } from "box-multi-tracker";
import { eventLog, logProviderError } from "../event-log";
import type { EventLog } from "../event-log";
import type { ApplicationEvents } from "../events/application.events";
import { createActivityLogProvider, createAnalyticsProvider } from "../providers/application.providers";

/**
 * Application Analytics: general user and application activity. Its Event Map,
 * providers and enabled flags belong to this instance alone.
 */
export function createApplicationAnalytics(log: EventLog) {
  return createAnalytics<ApplicationEvents>({
    providers: [{ provider: createAnalyticsProvider(log) }, { provider: createActivityLogProvider(log) }],
    onError: (error) => logProviderError(log, "application", error),
  });
}

export const applicationAnalytics = createApplicationAnalytics(eventLog);

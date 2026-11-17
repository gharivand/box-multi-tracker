import * as Sentry from "@sentry/browser";
import type { SentryCaptureLog } from "./sentry-capture-log";

/**
 * A syntactically valid DSN that points nowhere. The Sentry client needs a DSN
 * to be enabled; with the in-memory transport below it is never contacted.
 * Replace both to send real events to a real project.
 */
const LOCAL_DSN = "https://playground@sentry.invalid/1";

/**
 * Initializes Sentry for the playground. Initialization belongs to the
 * application, never to the `box-multi-tracker/sentry` adapter, which only calls
 * `captureException`.
 *
 * This setup is local on purpose: the transport keeps every envelope in memory
 * (in `log`) instead of sending it, so the playground can show what Sentry would
 * send without a real project and without sending anything.
 *
 * Default integrations are off. They include breadcrumbs for `console` calls,
 * clicks and `fetch`, and this app's console provider prints every analytics
 * payload: with the defaults, those payloads would be attached to error events.
 * An application that logs payloads should do the same (or filter breadcrumbs).
 */
export function initSentry(log: SentryCaptureLog): void {
  Sentry.init({
    dsn: LOCAL_DSN,
    environment: "playground",
    defaultIntegrations: false,
    integrations: [],
    maxBreadcrumbs: 0,
    transport: () => ({
      send: (envelope) => {
        log.record(envelope);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    }),
  });
}

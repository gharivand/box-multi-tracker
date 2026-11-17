import { captureException } from "@sentry/browser";
import type { ProviderError, ValidationError } from "../types.js";

/** Options of `createSentryReporter`. */
export interface SentryReporterOptions {
  /** Identifies the analytics instance in Sentry (tag `instance`). Choose any stable string. */
  instanceId: string;
}

/**
 * Handlers to pass to `createAnalytics`. Both are safe to hand over directly:
 * they never throw and never create an unhandled rejection.
 */
export interface SentryReporter {
  /** For `onError`: reports every provider failure (sync throw or async rejection). */
  onProviderError(error: ProviderError): void;
  /**
   * For `onValidationError`: reports only validator exceptions (a validator that
   * threw). Ordinary validation failures are expected and are not reported.
   */
  onValidationError(error: ValidationError): void;
}

type ErrorType = "provider_error" | "validator_exception";

const noop = (): void => {};

/**
 * Sends `exception` to Sentry. May throw (Sentry itself, or inspecting what it
 * returned): the handlers below isolate every call, and never report such a
 * failure anywhere, which could loop and must not affect tracking.
 */
function send(exception: Error, tags: Record<string, string>, context: Record<string, unknown>): void {
  // `captureException` returns an event id. The result is still observed in case
  // a replacement implementation returns a promise: a rejection must not go unhandled.
  const result: unknown = captureException(exception, {
    level: "error",
    tags,
    contexts: { box_multi_tracker: context },
  });
  if ((typeof result === "object" && result !== null) || typeof result === "function") {
    Promise.resolve(result).then(undefined, noop);
  }
}

/**
 * Real errors keep their stack and message, which is what makes a report useful.
 * Any other thrown value (a string, an object, `undefined`) is replaced by a fixed
 * message: it can hold arbitrary data, and Sentry would serialize it.
 */
function toException(thrown: unknown, fallbackMessage: string): { exception: Error; wasError: boolean } {
  return thrown instanceof Error
    ? { exception: thrown, wasError: true }
    : { exception: new Error(fallbackMessage), wasError: false };
}

/**
 * Creates handlers that report the SDK's own failures to Sentry. Initialize
 * Sentry yourself (`Sentry.init`) before events are tracked; this adapter never
 * initializes, flushes or configures it.
 *
 * What is reported, and what is not:
 * - Provider errors: always. Tags `provider`, `event`, `instance`, `error_type: "provider_error"`.
 * - Validator exceptions (a validator that threw): always. Tag `error_type: "validator_exception"`;
 *   context holds the number of issues, not their text.
 * - Ordinary validation failures (invalid payload): never.
 *
 * Privacy: only the SDK's own error metadata is sent (event name, provider name,
 * instance id, the number of issues). The analytics payload and the event object
 * are never read, because the SDK's error types do not carry them.
 */
export function createSentryReporter(options: SentryReporterOptions): SentryReporter {
  const { instanceId } = options;
  const baseTags = { source: "box-multi-tracker", instance: instanceId };

  return {
    onProviderError(report) {
      try {
        // Destructured inside the `try`: even a malformed argument must not throw.
        const { providerName, eventName, error } = report;
        const { exception, wasError } = toException(
          error,
          `Analytics provider "${providerName}" failed with a non-Error value`,
        );
        send(
          exception,
          { ...baseTags, error_type: "provider_error", provider: providerName, event: eventName },
          { thrown_value_was_error: wasError },
        );
      } catch {
        // Swallowed on purpose (for example a Proxy that throws on `instanceof`).
      }
    },

    onValidationError(error) {
      try {
        // Presence of `cause`, not its value: a validator may throw `undefined`.
        // Only a validator that threw sets it; ordinary failures never do.
        if (!Object.hasOwn(error, "cause")) return;

        const { exception, wasError } = toException(error.cause, "Validator threw a non-Error value");
        send(
          exception,
          { ...baseTags, error_type: "validator_exception", event: error.eventName },
          // Issue messages are deliberately not sent: for a validator that threw, the
          // issue only wraps the exception and its text may be derived from the thrown
          // value, which is replaced above whenever it is not an Error.
          { thrown_value_was_error: wasError, issue_count: error.issues.length },
        );
      } catch {
        // Swallowed on purpose.
      }
    },
  };
}

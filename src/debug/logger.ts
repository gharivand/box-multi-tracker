import type { ProviderError, ValidationError } from "../types.js";

/** How much `createDebugLogger` writes: `"error"` < `"warn"` < `"debug"`. */
export type DebugLogLevel = "error" | "warn" | "debug";

/** Options of `createDebugLogger`. */
export interface DebugLoggerOptions {
  /** Whether anything is logged. Default: `false`. */
  enabled?: boolean;
  /**
   * `"error"`: errors only. `"warn"`: warnings and errors. `"debug"`: warnings and
   * errors, each followed by a `console.debug` line with structured details.
   * Default: `"debug"`.
   */
  level?: DebugLogLevel;
}

/**
 * Handlers to pass to `createAnalytics`. Both are safe to hand over directly:
 * they never throw, never return a promise and never log their own failures.
 */
export interface DebugLogger {
  /** For `onError`: logs every provider failure (`console.error`). */
  onProviderError(error: ProviderError): void;
  /**
   * For `onValidationError`: logs a validator exception with `console.error`, and an
   * ordinary validation failure with `console.warn`.
   */
  onValidationError(error: ValidationError): void;
}

const PREFIX = "[box-multi-tracker]";

// The SDK compiles without DOM or Node typings, so the three console methods used are
// declared here. Module-scoped: it is neither exported nor emitted, and the runtime
// value is the host's global `console`.
declare const console: Record<"error" | "warn" | "debug", (...data: unknown[]) => void>;

/** Severity of what a level lets through: `error` only, plus `warn`, plus debug details. */
const ERRORS = 0;
const WARNINGS = 1;
const DETAILS = 2;

function resolveLevel(level: unknown): number {
  switch (level) {
    case "error":
      return ERRORS;
    case "warn":
      return WARNINGS;
    default:
      return DETAILS; // the default, also for a value a JavaScript caller got wrong
  }
}

/** A one-line description of a thrown value. Never throws, never calls `String` on arbitrary values. */
function describeThrown(thrown: unknown): string {
  try {
    return thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : "a non-Error value was thrown";
  } catch {
    return "an unreadable value was thrown"; // hostile `name` or `message` getter
  }
}

/** Calls one console method. A failing console is swallowed: logging must never affect tracking. */
function write(method: "error" | "warn" | "debug", message: string, details?: object): void {
  try {
    if (details === undefined) {
      console[method](`${PREFIX} ${message}`);
    } else {
      console[method](`${PREFIX} ${message}`, details);
    }
  } catch {
    // swallowed on purpose: never logged again, which could loop
  }
}

/**
 * Creates a development logger for the SDK's two error callbacks. It logs failures
 * only (not successful dispatches or provider state changes) and never the tracked
 * payload or event: it cannot, because the callbacks do not carry them.
 *
 * Disabled by default; a disabled logger returns immediately and writes nothing.
 * The received error objects are only read.
 */
export function createDebugLogger(options: DebugLoggerOptions = {}): DebugLogger {
  // Read once: a logger behaves the same for its whole life.
  const enabled = options.enabled === true;
  const level = resolveLevel(options.level);

  return {
    onProviderError(report) {
      if (!enabled) return;
      try {
        const { providerName, eventName, error } = report; // inside try on purpose: malformed input
        write("error", `Provider "${providerName}" failed while tracking "${eventName}": ${describeThrown(error)}`);
        if (level >= DETAILS) write("debug", "details", { providerName, eventName, error });
      } catch {
        // swallowed on purpose
      }
    },

    onValidationError(report) {
      if (!enabled) return;
      try {
        const { eventName, issues } = report;
        // The presence of `cause` marks a validator exception, not its value: a validator can throw `undefined`.
        const validatorException = Object.hasOwn(report, "cause");

        if (validatorException) {
          write("error", `Validator threw while validating "${eventName}": ${describeThrown(report.cause)}`);
        } else if (level >= WARNINGS) {
          write("warn", `Validation failed for "${eventName}" (${issues.length} ${issues.length === 1 ? "issue" : "issues"})`);
        }

        // Details only for what was logged above.
        if (level >= DETAILS) {
          write(
            "debug",
            "details",
            validatorException
              ? { eventName, issues, validatorException, cause: report.cause }
              : { eventName, issues, validatorException },
          );
        }
      } catch {
        // swallowed on purpose
      }
    },
  };
}

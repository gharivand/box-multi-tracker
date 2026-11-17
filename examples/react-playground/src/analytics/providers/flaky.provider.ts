import type { AnalyticsProvider } from "box-multi-tracker";
import type { AppEvents } from "../events";

/**
 * - `none`: behaves like a healthy asynchronous provider.
 * - `throw`: throws synchronously from `track`.
 * - `reject`: returns a promise that rejects.
 */
export type FailureMode = "none" | "throw" | "reject";

/** Mutable switch the playground uses to make a provider misbehave on demand. */
export interface FailureControl {
  getMode(): FailureMode;
  setMode(mode: FailureMode): void;
}

/** Registered name of the failure-capable provider. */
export const FLAKY_PROVIDER_NAME = "flaky-service";

export function createFailureControl(initial: FailureMode = "none"): FailureControl {
  let mode = initial;
  return {
    getMode: () => mode,
    setMode: (next) => {
      mode = next;
    },
  };
}

/**
 * A provider that fails on demand, so the playground can show how the SDK
 * isolates provider errors. The failure is deliberate: a well-behaved provider
 * should not throw, and this one exists to prove that the SDK copes when one does.
 */
export function createFlakyProvider(control: FailureControl, latencyMs = 400): AnalyticsProvider<AppEvents> {
  return {
    name: FLAKY_PROVIDER_NAME,
    track(event) {
      const mode = control.getMode();
      if (mode === "throw") {
        throw new Error(`Simulated synchronous failure while sending "${event.name}"`);
      }
      return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          if (mode === "reject") {
            reject(new Error(`Simulated asynchronous rejection while sending "${event.name}"`));
          } else {
            resolve();
          }
        }, latencyMs);
      });
    },
  };
}

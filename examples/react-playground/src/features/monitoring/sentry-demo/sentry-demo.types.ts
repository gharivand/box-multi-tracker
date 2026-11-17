import type { FailureControl } from "../../../analytics/providers/flaky.provider";
import type { Tracking } from "../../../analytics/tracking";
import type { ValidatorFault } from "../../../analytics/validator-fault";

/** The only part of the tracking API this feature needs. */
export type SentryDemoTracking = Pick<Tracking, "userSignedIn" | "productViewed" | "orderCompleted">;

/** What a scenario may touch on the active analytics instance. */
export interface SentryDemoContext {
  tracking: SentryDemoTracking;
  /** Makes the flaky provider fail. */
  failure: FailureControl;
  /** Makes the validator crash. */
  validatorFault: ValidatorFault;
}

/** Whether Sentry should receive an error event for the scenario. */
export type SentryExpectation = "reported" | "not-reported";

export interface SentryScenario {
  readonly id: string;
  readonly title: string;
  /** What is done, and what to look for in the Sentry captures. */
  readonly description: string;
  readonly expectation: SentryExpectation;
  /** The scenario needs the flaky provider to be enabled on the active instance. */
  readonly needsFlakyProvider: boolean;
  /** Text that must never appear in anything Sent to Sentry (a piece of the tracked payload). */
  readonly privateText?: string;
  run(context: SentryDemoContext): void;
}

/** Outcome of the most recent run. */
export interface SentryDemoRun {
  readonly scenario: SentryScenario;
  readonly instanceLabel: string;
  /** How many events Sentry had captured when the scenario ran. */
  readonly capturedBefore: number;
}

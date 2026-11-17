import type { Tracking } from "../../../analytics/tracking";

/** The only part of the tracking API this feature needs. */
export type ValidationTracking = Pick<Tracking, "productViewed" | "orderCompleted">;

/** What the playground should show for a scenario once it has run. */
export type ScenarioOutcome = "delivered-transformed" | "rejected";

export interface ValidationScenario {
  readonly id: string;
  readonly title: string;
  /** What is sent and what to look for in the event log. */
  readonly description: string;
  readonly outcome: ScenarioOutcome;
  /** Tracks the scenario's event through the application's tracking layer. */
  send(tracking: ValidationTracking): void;
}

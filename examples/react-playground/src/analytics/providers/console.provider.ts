import type { AnalyticsProvider } from "box-multi-tracker";
import type { AppEvents } from "../events";

export interface ConsoleProviderOptions {
  /** Where lines are written. Defaults to `console.info`. */
  write?: (line: string) => void;
}

/**
 * Synchronous provider that prints every event it receives. It handles all
 * events generically, so a new event needs no change here.
 */
export function createConsoleProvider(options: ConsoleProviderOptions = {}): AnalyticsProvider<AppEvents> {
  const write = options.write ?? ((line: string) => console.info(line));

  return {
    name: "console",
    track(event) {
      write(`${event.name} ${JSON.stringify(event.payload ?? null)}`);
    },
  };
}

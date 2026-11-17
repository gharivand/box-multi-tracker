import { useState, useSyncExternalStore } from "react";
import { usePlayground } from "../../../app/providers/playground.context";
import { FLAKY_PROVIDER_NAME } from "../../../analytics/providers/flaky.provider";
import { eventContains } from "../../../monitoring/sentry-capture-log";
import { SCENARIOS } from "./sentry-demo.scenarios";
import type { SentryDemoRun, SentryScenario } from "./sentry-demo.types";

export function useSentryDemo() {
  const { activeInstance, sentryLog } = usePlayground();
  const captured = useSyncExternalStore(sentryLog.subscribe, sentryLog.getSnapshot);
  const [lastRun, setLastRun] = useState<SentryDemoRun | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(scenario: SentryScenario): void {
    // Checked when clicked: providers can be enabled and disabled at any time.
    if (scenario.needsFlakyProvider && !activeInstance.analytics.isProviderEnabled(FLAKY_PROVIDER_NAME)) {
      setNotice(`Enable ${FLAKY_PROVIDER_NAME} on ${activeInstance.label} first: this scenario needs it to fail.`);
      return;
    }
    setNotice(null);
    setLastRun({ scenario, instanceLabel: activeInstance.label, capturedBefore: sentryLog.getSnapshot().length });
    scenario.run({
      tracking: activeInstance.tracking,
      failure: activeInstance.failure,
      validatorFault: activeInstance.validatorFault,
    });
  }

  // Sentry processes events asynchronously, so these update live after the click.
  const capturedSinceRun = lastRun === null ? 0 : Math.max(0, captured.length - lastRun.capturedBefore);
  const privateText = lastRun?.scenario.privateText;
  const privateTextMatches = privateText === undefined ? null : captured.filter((event) => eventContains(event, privateText)).length;

  return { scenarios: SCENARIOS, lastRun, notice, capturedSinceRun, privateText, privateTextMatches, run };
}

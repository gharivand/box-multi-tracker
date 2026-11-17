import { useReducer, useState, useSyncExternalStore } from "react";
import type { AppAnalytics } from "../../analytics/analytics";
import { countDeliveries } from "../../analytics/dispatch-log";
import { FLAKY_PROVIDER_NAME } from "../../analytics/providers/flaky.provider";
import type { FailureMode } from "../../analytics/providers/flaky.provider";
import { usePlayground } from "../../app/providers/playground.context";
import type { ProviderRow } from "./provider-controls.types";

const UNKNOWN_PROVIDER = "does-not-exist";

export function useProviderControls(instance: AppAnalytics) {
  const { log } = usePlayground();
  const entries = useSyncExternalStore(log.subscribe, log.getSnapshot);
  // The SDK holds the enabled state; this only re-renders after a change.
  const [, refresh] = useReducer((version: number) => version + 1, 0);
  const [notice, setNotice] = useState<string | null>(null);

  const rows: ProviderRow[] = instance.providerNames.map((name, index) => ({
    name,
    position: index + 1,
    enabled: instance.analytics.isProviderEnabled(name),
    canFail: name === FLAKY_PROVIDER_NAME,
    ...countDeliveries(entries, instance.instanceId, name),
  }));

  function setEnabled(name: string, enabled: boolean): void {
    if (enabled) {
      instance.analytics.enableProvider(name);
    } else {
      instance.analytics.disableProvider(name);
    }
    setNotice(null);
    refresh();
  }

  function setFailureMode(mode: FailureMode): void {
    instance.failure.setMode(mode);
    refresh();
  }

  /** Shows how the SDK treats a provider name that was never registered. */
  function tryUnknownProvider(): void {
    let message: string;
    try {
      instance.analytics.enableProvider(UNKNOWN_PROVIDER);
      message = "No error thrown.";
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    const enabled = instance.analytics.isProviderEnabled(UNKNOWN_PROVIDER);
    setNotice(`enableProvider("${UNKNOWN_PROVIDER}") threw: ${message} — isProviderEnabled("${UNKNOWN_PROVIDER}") = ${enabled}`);
  }

  return {
    rows,
    failureMode: instance.failure.getMode(),
    notice,
    setEnabled,
    setFailureMode,
    tryUnknownProvider,
  };
}

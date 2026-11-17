import { useReducer, useSyncExternalStore } from "react";
import { eventLog } from "../../analytics/event-log";
import type { InstanceId } from "../../analytics/event-log";
import { applicationAnalytics } from "../../analytics/instances/application-analytics";
import { backendFault, commerceAnalytics } from "../../analytics/instances/commerce-analytics";
import { applicationProviderNames } from "../../analytics/providers/application.providers";
import { commerceProviderNames } from "../../analytics/providers/commerce.providers";
import { trackInvalidCartEventForDemo } from "../../analytics/tracking";
import type { InstanceSectionView, LogRowView } from "./analytics-panel.types";

/** The part of an analytics instance the panel needs: the SDK's own provider controls. */
interface ProviderControls {
  isProviderEnabled(name: string): boolean;
  enableProvider(name: string): void;
  disableProvider(name: string): void;
}

function formatTime(time: number): string {
  const date = new Date(time);
  const pad = (value: number, size = 2): string => String(value).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function useAnalyticsPanel() {
  const entries = useSyncExternalStore(eventLog.subscribe, eventLog.getEntries);
  // The SDK holds the enabled state; this only re-renders after a change.
  const [, refresh] = useReducer((version: number) => version + 1, 0);

  function section(
    instance: InstanceId,
    title: string,
    names: readonly string[],
    analytics: ProviderControls,
  ): InstanceSectionView {
    return {
      instance,
      title,
      providers: names.map((name) => {
        const enabled = analytics.isProviderEnabled(name);
        return {
          name,
          enabled,
          toggle: () => {
            if (enabled) analytics.disableProvider(name);
            else analytics.enableProvider(name);
            refresh();
          },
        };
      }),
    };
  }

  const sections: InstanceSectionView[] = [
    section("application", "Application Analytics", applicationProviderNames, applicationAnalytics),
    section("commerce", "Commerce Analytics", commerceProviderNames, commerceAnalytics),
  ];

  // Newest first.
  const rows: LogRowView[] = [...entries].reverse().map((entry) => ({ ...entry, timeLabel: formatTime(entry.time) }));

  return {
    sections,
    rows,
    backendFailing: backendFault.failing,
    setBackendFailing(failing: boolean): void {
      backendFault.failing = failing;
      refresh();
    },
    sendInvalidEvent: trackInvalidCartEventForDemo,
    clearLog: () => eventLog.clear(),
  };
}

import { useSyncExternalStore } from "react";
import { usePlayground } from "../../app/providers/playground.context";

export function useSentryCaptures() {
  const { sentryLog } = usePlayground();
  const events = useSyncExternalStore(sentryLog.subscribe, sentryLog.getSnapshot);

  return {
    // Newest first; `event.id` is the order Sentry was asked to send them.
    events: [...events].reverse(),
    clear: () => sentryLog.clear(),
  };
}

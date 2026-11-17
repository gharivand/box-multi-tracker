import { useSyncExternalStore } from "react";
import { usePlayground } from "../../app/providers/playground.context";

export function useEventLog() {
  const { log, instances } = usePlayground();
  const entries = useSyncExternalStore(log.subscribe, log.getSnapshot);

  const labels = new Map(instances.map((instance) => [instance.instanceId, instance.label]));

  return {
    // Newest first; `entry.id` is the global dispatch order.
    entries: [...entries].reverse(),
    instanceLabel: (instanceId: string) => labels.get(instanceId) ?? instanceId,
    clear: () => log.clear(),
  };
}

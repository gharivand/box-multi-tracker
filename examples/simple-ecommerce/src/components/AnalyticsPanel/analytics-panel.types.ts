import type { InstanceId, LogEntry } from "../../analytics/event-log";

export interface ProviderRow {
  name: string;
  /** Read from the SDK (`isProviderEnabled`) on every render. */
  enabled: boolean;
  toggle(): void;
}

export interface InstanceSectionView {
  instance: InstanceId;
  title: string;
  providers: ProviderRow[];
}

/** A log entry with its time already formatted for display. */
export interface LogRowView extends LogEntry {
  timeLabel: string;
}

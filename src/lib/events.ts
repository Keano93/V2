export const EVENT_TYPES = ["change", "delay", "instruction", "access", "late_information"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  change: "Change / variation",
  delay: "Delay / disruption",
  instruction: "Instruction",
  access: "Site access issue",
  late_information: "Late information",
};

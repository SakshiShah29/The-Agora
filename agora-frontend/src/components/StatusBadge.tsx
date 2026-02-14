import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] || status;
  const color = STATUS_COLORS[status] || "#6b7280";
  const isLive = ["preaching", "in_debate", "awaiting_verdict"].includes(status);

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: `${color}18`, color }}
    >
      {isLive && (
        <span
          className="h-1.5 w-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </span>
  );
}
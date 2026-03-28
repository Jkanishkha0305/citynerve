import { Badge } from "@/components/ui/badge";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface SeverityBadgeProps {
  severity: Severity;
  score: number;
}

const severityColors: Record<Severity, string> = {
  CRITICAL: "bg-[#ff3b3b] text-white",
  HIGH: "bg-[#ff8c00] text-white",
  MEDIUM: "bg-[#ffd700] text-black",
  LOW: "bg-[#6b7280] text-white",
};

export function SeverityBadge({ severity, score }: SeverityBadgeProps) {
  const isCritical = severity === "CRITICAL";

  return (
    <Badge
      className={`${severityColors[severity]} ${
        isCritical ? "critical-pulse" : ""
      } px-3 py-1 text-sm font-semibold`}
    >
      {severity === "CRITICAL" && "🔴 "}
      {severity} — {score}/100
    </Badge>
  );
}

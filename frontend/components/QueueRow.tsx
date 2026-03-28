"use client";

import { motion } from "framer-motion";
import { Report } from "@/hooks/useQueue";

interface QueueRowProps {
  report: Report;
  onClick: () => void;
}

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const severityColors: Record<Severity, { border: string; text: string; badge: string; dot: string }> = {
  CRITICAL: {
    border: "border-l-[#ff3b3b]",
    text: "text-[#ff3b3b]",
    badge: "bg-[#ff3b3b]",
    dot: "bg-[#ff3b3b]",
  },
  HIGH: {
    border: "border-l-[#ff8c00]",
    text: "text-[#ff8c00]",
    badge: "bg-[#ff8c00]",
    dot: "bg-[#ff8c00]",
  },
  MEDIUM: {
    border: "border-l-[#ffd700]",
    text: "text-[#ffd700]",
    badge: "bg-[#ffd700]",
    dot: "bg-[#ffd700]",
  },
  LOW: {
    border: "border-l-[#6b7280]",
    text: "text-[#6b7280]",
    badge: "bg-[#6b7280]",
    dot: "bg-[#6b7280]",
  },
};

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1m ago";
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1h ago";
  return `${diffHours}h ago`;
}

export function QueueRow({ report, onClick }: QueueRowProps) {
  const colors = severityColors[report.label as Severity];
  const isCritical = report.label === "CRITICAL";

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, backgroundColor: "rgba(255,59,59,0.3)" }}
      animate={{ opacity: 1, y: 0, backgroundColor: "rgba(255,255,255,0.05)" }}
      transition={{ duration: 0.5 }}
      onClick={onClick}
      className={`glass-card rounded-lg p-4 cursor-pointer hover:bg-white/10 transition-colors border-l-4 ${colors.border}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${colors.dot} ${isCritical ? "critical-pulse" : ""}`} />
          <span className="text-white font-bold">{report.severity}</span>
          <span className={`font-medium capitalize ${colors.text}`}>
            {report.complaint_type.replace("_", " ")}
          </span>
        </div>
        <span className="text-gray-500 text-sm">{formatTimeAgo(report.submitted_at)}</span>
      </div>
      
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-gray-400">{report.address}</span>
        <span className="text-[#00ff88]">{report.department}</span>
      </div>
    </motion.div>
  );
}

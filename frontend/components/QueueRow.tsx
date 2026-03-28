"use client";

import { motion } from "framer-motion";
import { Report } from "@/hooks/useQueue";

interface QueueRowProps {
  report: Report;
  onClick: () => void;
}

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const severityColors: Record<Severity, { border: string; text: string; bg: string; dot: string; glow: string }> = {
  CRITICAL: {
    border: "border-l-[#ff3b3b]",
    text: "text-[#ff3b3b]",
    bg: "bg-[#ff3b3b]/10",
    dot: "bg-[#ff3b3b]",
    glow: "shadow-[0_0_10px_rgba(255,59,59,0.5)]",
  },
  HIGH: {
    border: "border-l-[#ff8c00]",
    text: "text-[#ff8c00]",
    bg: "bg-[#ff8c00]/10",
    dot: "bg-[#ff8c00]",
    glow: "shadow-[0_0_10px_rgba(255,140,0,0.5)]",
  },
  MEDIUM: {
    border: "border-l-[#ffd700]",
    text: "text-[#ffd700]",
    bg: "bg-[#ffd700]/10",
    dot: "bg-[#ffd700]",
    glow: "shadow-[0_0_10px_rgba(255,215,0,0.5)]",
  },
  LOW: {
    border: "border-l-[#6b7280]",
    text: "text-[#6b7280]",
    bg: "bg-[#6b7280]/10",
    dot: "bg-[#6b7280]",
    glow: "shadow-none",
  },
};

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "JUST NOW";
  if (diffMins === 1) return "1M AGO";
  if (diffMins < 60) return `${diffMins}M AGO`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1H AGO";
  return `${diffHours}H AGO`;
}

export function QueueRow({ report, onClick }: QueueRowProps) {
  const colors = severityColors[report.label as Severity] || severityColors.LOW;
  const isCritical = report.label === "CRITICAL";

  // Check for specific infrastructure in reasons
  const hasHospital = report.reasons?.some(r => r.toLowerCase().includes("hospital"));
  const hasSchool = report.reasons?.some(r => r.toLowerCase().includes("school"));
  const hasSubway = report.reasons?.some(r => r.toLowerCase().includes("subway"));
  const isRushHour = report.reasons?.some(r => r.toLowerCase().includes("rush hour"));

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ scale: 1.01, backgroundColor: "rgba(255,255,255,0.08)" }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={`glass-card rounded-xl p-4 cursor-pointer transition-all border-l-4 ${colors.border} relative overflow-hidden group`}
    >
      <div className={`absolute inset-0 ${colors.bg} opacity-0 group-hover:opacity-100 transition-opacity`} />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className={`relative`}>
              <span className={`block w-2.5 h-2.5 rounded-full ${colors.dot} ${colors.glow} ${isCritical ? "critical-pulse" : ""}`} />
            </div>
            <span className="text-white font-black tracking-tighter text-lg">{report.severity}</span>
            <span className={`font-bold uppercase tracking-widest text-xs px-2 py-0.5 rounded border border-current ${colors.text} bg-black/40`}>
              {report.complaint_type.replace("_", " ")}
            </span>
          </div>
          <span className="text-[10px] font-bold text-gray-500 tracking-tighter">{formatTimeAgo(report.submitted_at)}</span>
        </div>
        
        <p className="text-gray-300 text-sm font-medium mb-3 line-clamp-1">{report.description}</p>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-tighter">Location:</span>
              <span className="text-xs text-white/70 font-medium truncate max-w-[150px]">{report.address}</span>
            </div>
            
            <div className="flex items-center gap-1">
              {hasHospital && <span title="Near Hospital" className="text-sm">🏥</span>}
              {hasSchool && <span title="Near School" className="text-sm">🏫</span>}
              {hasSubway && <span title="Near Subway" className="text-sm">🚇</span>}
              {isRushHour && <span title="Rush Hour" className="text-sm">🕒</span>}
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-[#00ff88]" />
            <span className="text-[10px] font-black text-[#00ff88] uppercase tracking-widest">{report.department}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

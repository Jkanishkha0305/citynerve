"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useQueue, Report } from "@/hooks/useQueue";
import { QueueRow } from "@/components/QueueRow";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-zinc-900 flex items-center justify-center">
      <div className="text-gray-500">Loading map...</div>
    </div>
  ),
});

export default function DashboardPage() {
  const { queue, connected, reconnecting, reconnect } = useQueue();
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [simulating, setSimulating] = useState(false);

  const sortedQueue = useMemo(() => {
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...queue].sort((a, b) => {
      const severityDiff = severityOrder[a.label] - severityOrder[b.label];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
    });
  }, [queue]);

  useEffect(() => {
    if (queue.length > 0) {
      const latestReport = queue[queue.length - 1];
      if (latestReport.label === "CRITICAL") {
        toast.warning(
          `⚠️ CRITICAL: ${latestReport.complaint_type.replace("_", " ")} at ${latestReport.address} → ${latestReport.department}`,
          { duration: 8000 }
        );
      } else if (latestReport.label === "HIGH") {
        toast.warning(
          `🟠 HIGH: ${latestReport.complaint_type.replace("_", " ")} at ${latestReport.address} → ${latestReport.department}`,
          { duration: 5000 }
        );
      }
    }
  }, [queue.length]);

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      await fetch(`${API_BASE_URL}/api/simulate`, {
        method: "POST",
      });
    } catch (error) {
      console.error("Failed to simulate:", error);
    } finally {
      setTimeout(() => setSimulating(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🏙</div>
            <div>
              <h1 className="text-xl font-bold text-white">Smart311 AI Triage</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? "bg-[#00ff88] critical-pulse" : "bg-red-500"
                }`}
              />
              <span className="text-sm text-gray-400">
                {reconnecting ? "Reconnecting..." : connected ? "LIVE" : "Disconnected"}
              </span>
            </div>

            <span className="text-gray-400 text-sm">
              {queue.length} reports
            </span>

            <Button
              onClick={handleSimulate}
              disabled={simulating}
              className="bg-[#00ff88] text-black hover:bg-[#00cc6a] font-medium"
            >
              {simulating ? "Simulating..." : "+ SIMULATE"}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex h-[calc(100vh-73px)]">
        <div className="w-1/2 h-full">
          <LiveMap reports={queue} />
        </div>

        <div className="w-1/2 h-full overflow-y-auto p-4">
          <h2 className="text-xl font-bold text-white mb-4">Report Queue</h2>

          <div className="space-y-3">
            <AnimatePresence>
              {sortedQueue.map((report) => (
                <motion.div
                  key={report.id}
                  layout
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <QueueRow
                    report={report}
                    onClick={() => setSelectedReport(report)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {sortedQueue.length === 0 && (
              <div className="text-center text-gray-500 py-12">
                No reports in queue
              </div>
            )}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {selectedReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedReport(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="glass-card rounded-2xl max-w-lg w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Report Details</h2>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Type</span>
                  <span className="font-medium capitalize text-white">
                    {selectedReport.complaint_type.replace("_", " ")}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Severity</span>
                  <span
                    className={`px-3 py-1 rounded-full text-white text-sm font-semibold ${
                      selectedReport.label === "CRITICAL"
                        ? "bg-[#ff3b3b]"
                        : selectedReport.label === "HIGH"
                          ? "bg-[#ff8c00]"
                          : selectedReport.label === "MEDIUM"
                            ? "bg-[#ffd700] text-black"
                            : "bg-[#6b7280]"
                    }`}
                  >
                    {selectedReport.label} ({selectedReport.severity}/100)
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Department</span>
                  <span className="font-medium text-[#00ff88]">{selectedReport.department}</span>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <span className="text-sm text-gray-400 block mb-2">Description</span>
                  <p className="text-white">{selectedReport.description}</p>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <span className="text-sm text-gray-400 block mb-2">Location</span>
                  <p className="text-white">{selectedReport.address}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedReport.lat.toFixed(4)}, {selectedReport.lon.toFixed(4)}
                  </p>
                </div>

                {selectedReport.reasons && selectedReport.reasons.length > 0 && (
                  <div className="pt-4 border-t border-white/10">
                    <span className="text-sm text-gray-400 block mb-2">Severity Factors</span>
                    <ul className="space-y-1">
                      {selectedReport.reasons.map((reason, i) => (
                        <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                          <span className="text-[#00ff88] mt-1">•</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

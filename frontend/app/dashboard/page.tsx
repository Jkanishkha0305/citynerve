"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useQueue, Report } from "@/hooks/useQueue";
import { useAgentEvents, PipelineRun, COLOR_MAP } from "@/hooks/useAgentEvents";
import { QueueRow } from "@/components/QueueRow";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/10 rounded-2xl">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
        <div className="text-[#00ff88] font-black tracking-widest text-[10px] uppercase">Initializing Map Engine...</div>
      </div>
    </div>
  ),
});

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface DispatchPlan {
  summary: string;
  priority: "IMMEDIATE" | "HIGH" | "ROUTINE";
  steps: Array<{ step: number; action: string; agent: string; eta: string }>;
  notifications: string[];
  resources: string[];
}

function formatTimeAgo(isoString: string): string {
  if (!isoString) return "UNKNOWN";
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

const statusDot: Record<string, string> = {
  running: "bg-yellow-400 animate-pulse",
  tool_call: "bg-blue-400",
  tool_result: "bg-purple-400",
  done: "bg-[#00ff88]",
  error: "bg-red-500",
};

function PipelineCard({ run, isDispatch }: { run: PipelineRun; isDispatch?: boolean }) {
  const [expanded, setExpanded] = useState(!run.isComplete || isDispatch);

  const borderColor = isDispatch
    ? "border-red-500/40"
    : run.isComplete
    ? "border-[#00ff88]/20"
    : "border-yellow-400/30";

  const headerBg = isDispatch
    ? "bg-red-500/10"
    : run.isComplete
    ? "bg-[#00ff88]/5"
    : "bg-yellow-400/5";

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className={`w-full px-3 py-2.5 flex items-center justify-between ${headerBg} hover:brightness-110 transition-all`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">{isDispatch ? "🚨" : "⚡"}</span>
          <div className="text-left min-w-0">
            <div className="text-[9px] font-black tracking-widest uppercase text-gray-500">
              {isDispatch ? "DISPATCH" : "PIPELINE"} #{run.report_id.slice(0, 6)}
            </div>
            {run.finalLabel && (
              <div className={`text-[10px] font-black uppercase tracking-tight ${run.isComplete ? "text-[#00ff88]" : "text-yellow-400"}`}>
                {run.finalLabel} → {run.finalDept?.split(" ")[0]}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!run.isComplete && (
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          )}
          <span className="text-gray-600 text-[10px]">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 py-2 space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
          {run.events.map((ev, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[ev.status] || "bg-gray-500"}`} />
              <div className="min-w-0">
                <span className={`text-[9px] font-black tracking-tighter ${COLOR_MAP[ev.color] || "text-gray-400"} uppercase`}>
                  {ev.icon} {ev.agent}
                </span>
                <p className="text-[9px] text-gray-300 leading-tight mt-0.5 break-words">{ev.msg}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const priorityColors: Record<string, string> = {
  IMMEDIATE: "text-red-500 border-red-500/40 bg-red-500/10",
  HIGH: "text-orange-400 border-orange-400/40 bg-orange-400/10",
  ROUTINE: "text-[#00ff88] border-[#00ff88]/40 bg-[#00ff88]/10",
};

export default function DashboardPage() {
  const { queue, connected, reconnecting } = useQueue();
  const { runs } = useAgentEvents();
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loading311, setLoading311] = useState(false);
  const [dispatchPlan, setDispatchPlan] = useState<DispatchPlan | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchedId, setDispatchedId] = useState<string | null>(null);

  const sortedQueue = useMemo(() => {
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...queue].sort((a, b) => {
      const aLab = (a.label || "LOW") as Severity;
      const bLab = (b.label || "LOW") as Severity;
      const severityDiff = severityOrder[aLab] - severityOrder[bLab];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime();
    });
  }, [queue]);

  // Separate dispatch runs from pipeline runs
  const dispatchRuns = useMemo(() => runs.filter((r) => r.report_id.startsWith("dispatch-")), [runs]);
  const pipelineRuns = useMemo(() => runs.filter((r) => !r.report_id.startsWith("dispatch-")), [runs]);

  useEffect(() => {
    if (queue.length > 0) {
      const latestReport = queue[queue.length - 1];
      if (latestReport.label === "CRITICAL") {
        toast.error(
          `CRITICAL: ${(latestReport.complaint_type || "INCIDENT").toUpperCase()} @ ${(latestReport.address || "?").toUpperCase()}`,
          { className: "glass-card border-red-500/50 text-red-500 font-bold", duration: 8000 }
        );
      }
    }
  }, [queue.length]);

  const handleLoad311 = async () => {
    setLoading311(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/load-311`, { method: "POST" });
      const data = await response.json();
      toast.success(`DATA INGESTION COMPLETE: +${data.loaded} RECORDS`, {
        className: "glass-card border-[#00ff88]/50 text-[#00ff88] font-bold",
      });
    } catch {
      toast.error("Failed to load NYC 311 data");
    } finally {
      setLoading311(false);
    }
  };

  const handleSimulate = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/simulate`, { method: "POST" });
      toast.success("CLUSTER SIMULATION TRIGGERED — 5 gas leak reports near Times Square", {
        className: "glass-card border-orange-400/50 text-orange-400 font-bold",
      });
    } catch {
      toast.error("Simulate failed");
    }
  };

  const handleDispatch = async () => {
    if (!selectedReport) return;
    setDispatching(true);
    setDispatchPlan(null);
    setDispatchedId(selectedReport.id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dispatch/${selectedReport.id}`, { method: "POST" });
      const data = await res.json();
      setDispatchPlan(data.plan || null);
      toast.success(`DISPATCH INITIATED → ${selectedReport.department}`, {
        className: "glass-card border-red-500/50 text-red-400 font-bold",
      });
    } catch {
      toast.error("Dispatch failed");
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] cyber-grid relative overflow-hidden scanline">
      {/* HUD Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center text-2xl shadow-[0_0_15px_rgba(0,255,136,0.2)]">
                🏙
              </div>
              <div>
                <h1 className="text-xl font-black text-white tracking-tighter uppercase leading-none">
                  Smart311 <span className="text-[#00ff88]">Command</span>
                </h1>
                <p className="text-[9px] text-gray-500 font-black tracking-[0.3em] uppercase mt-1">
                  AI-Powered Emergency Triage System
                </p>
              </div>
            </div>

            <div className="flex items-center gap-10">
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1">Status</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${connected ? "bg-[#00ff88] shadow-[0_0_8px_#00ff88]" : "bg-red-500"}`} />
                  <span className="text-[11px] font-black text-white tracking-widest uppercase">
                    {reconnecting ? "RECONNECTING" : connected ? "OPERATIONAL" : "OFFLINE"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1">Active Units</span>
                <span className="text-[11px] font-black text-[#00ff88] tracking-widest">
                  {queue.length.toString().padStart(3, "0")}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1">Agent Runs</span>
                <span className="text-[11px] font-black text-purple-400 tracking-widest">
                  {runs.length.toString().padStart(3, "0")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSimulate}
              className="bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 font-black tracking-widest text-[10px] uppercase h-10 px-4 rounded-md border border-orange-500/30 transition-all"
            >
              Sim Cluster
            </Button>
            <Button
              onClick={handleLoad311}
              disabled={loading311}
              className="bg-[#00ff88] text-black hover:bg-[#00cc6a] font-black tracking-widest text-[10px] uppercase h-10 px-6 rounded-md shadow-[0_0_20px_rgba(0,255,136,0.2)] transition-all border-none"
            >
              {loading311 ? "INGESTING..." : "Sync NYC Data"}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex h-[calc(100vh-73px)] p-6 gap-6">
        {/* LEFT COLUMN: Queue */}
        <div className="w-80 h-full flex flex-col gap-4">
          <div className="flex items-center gap-2 px-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" />
            <h2 className="text-[10px] font-black text-white tracking-[0.3em] uppercase">Priority Queue</h2>
            <span className="ml-auto text-[9px] text-gray-500 font-black">{sortedQueue.length} REPORTS</span>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {sortedQueue.map((report) => (
                <QueueRow
                  key={report.id}
                  report={report}
                  onClick={() => {
                    setSelectedReport(report);
                    setDispatchPlan(null);
                  }}
                />
              ))}
            </AnimatePresence>

            {sortedQueue.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                <div className="text-gray-600 font-black tracking-widest text-[9px] uppercase animate-pulse">
                  Waiting for signals...
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CENTER COLUMN: Map */}
        <div className="flex-1 h-full relative">
          <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded bg-black/80 border border-white/10 backdrop-blur-md flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
            <span className="text-[9px] text-[#00ff88] font-black tracking-[0.3em] uppercase">Tactical Visualizer</span>
          </div>
          <div className="h-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl glass-card">
            <LiveMap reports={queue} />
          </div>
        </div>

        {/* RIGHT COLUMN: Live Agent Intelligence */}
        <div className="w-80 h-full flex flex-col gap-4">
          <div className="flex items-center gap-2 px-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-[10px] font-black text-white tracking-[0.3em] uppercase">Agent Intelligence</h2>
            <span className="ml-auto text-[9px] text-gray-500 font-black">{runs.length} RUNS</span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
            <AnimatePresence initial={false}>
              {/* Dispatch runs first (highest priority) */}
              {dispatchRuns.map((run) => (
                <motion.div
                  key={run.report_id}
                  initial={{ opacity: 0, x: 20, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  <PipelineCard run={run} isDispatch />
                </motion.div>
              ))}

              {/* Regular pipeline runs */}
              {pipelineRuns.map((run) => (
                <motion.div
                  key={run.report_id}
                  initial={{ opacity: 0, x: 20, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  <PipelineCard run={run} />
                </motion.div>
              ))}
            </AnimatePresence>

            {runs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 border border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                <div className="text-gray-600 font-black tracking-widest text-[9px] uppercase animate-pulse">
                  Awaiting agent signals...
                </div>
                <div className="text-gray-700 text-[8px] mt-2 text-center px-4">
                  Submit a report to see agents working live
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Report Detail Modal */}
      <AnimatePresence>
        {selectedReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-8 z-[100]"
            onClick={() => setSelectedReport(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-card rounded-3xl max-w-2xl w-full relative overflow-hidden border-[#00ff88]/20 shadow-[0_0_50px_rgba(0,255,136,0.1)] max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#00ff88]/5 rounded-full blur-[100px] -mr-32 -mt-32" />

              <div className="relative z-10 p-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <span className="text-5xl font-black text-white tracking-tighter">{selectedReport.severity}</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#00ff88] font-black tracking-[0.2em] uppercase mb-1">Priority Score</span>
                      <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                        {(selectedReport.complaint_type || "OTHER").replace("_", " ")}
                      </h2>
                      <span className={`text-xs font-black uppercase mt-1 ${
                        selectedReport.label === "CRITICAL" ? "text-red-500" :
                        selectedReport.label === "HIGH" ? "text-orange-400" :
                        selectedReport.label === "MEDIUM" ? "text-yellow-400" : "text-gray-500"
                      }`}>{selectedReport.label}</span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedReport(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <svg className="w-6 h-6 text-gray-500 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase block mb-1">Location</span>
                    <p className="text-base font-bold text-white leading-snug">{selectedReport.address || "UNKNOWN"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase block mb-1">Assigned Agency</span>
                    <p className="text-lg font-black text-[#00ff88] uppercase tracking-tighter">{selectedReport.department}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase block mb-1">Status</span>
                    <span className={`px-3 py-1 rounded text-[10px] font-black tracking-widest uppercase border ${
                      selectedReport.status === "DISPATCHED"
                        ? "bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/20"
                        : "bg-yellow-400/10 text-yellow-400 border-yellow-400/20 animate-pulse"
                    }`}>
                      {selectedReport.status || "PENDING"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase block mb-1">Reported</span>
                    <p className="text-xs font-bold text-white">{selectedReport.submitted_at ? new Date(selectedReport.submitted_at).toLocaleString() : "—"}</p>
                  </div>
                </div>

                {/* Description */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 mb-6">
                  <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase block mb-2">Report</span>
                  <p className="text-gray-300 text-sm leading-relaxed italic">"{selectedReport.description}"</p>
                </div>

                {/* Triage Factors */}
                {selectedReport.reasons && selectedReport.reasons.length > 0 && (
                  <div className="mb-6">
                    <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase block mb-3">Triage Factors</span>
                    <div className="flex flex-wrap gap-2">
                      {selectedReport.reasons.map((reason, i) => (
                        <div key={i} className="px-3 py-1.5 rounded bg-white/[0.03] border border-white/10 text-[9px] font-bold text-gray-400 uppercase tracking-tight flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-[#00ff88]" />
                          {reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dispatch Plan */}
                {dispatchPlan && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/5"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">🚨</span>
                      <span className="text-[10px] font-black tracking-widest uppercase text-red-400">Dispatch Plan Active</span>
                      <span className={`ml-auto px-2 py-0.5 rounded text-[9px] font-black uppercase border ${priorityColors[dispatchPlan.priority] || "text-gray-400 border-gray-400/30 bg-gray-400/10"}`}>
                        {dispatchPlan.priority}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 mb-4 italic">"{dispatchPlan.summary}"</p>

                    <div className="space-y-2 mb-4">
                      {dispatchPlan.steps.map((step) => (
                        <div key={step.step} className="flex items-start gap-3 p-2.5 rounded-lg bg-black/30 border border-white/5">
                          <span className="text-[10px] font-black text-red-400 bg-red-500/20 rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                            {step.step}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-white leading-snug">{step.action}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[9px] text-[#00ff88] font-black uppercase">{step.agent}</span>
                              <span className="text-[9px] text-gray-500 font-bold">ETA: {step.eta}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block mb-1.5">Notifications</span>
                        {dispatchPlan.notifications.slice(0, 4).map((n, i) => (
                          <div key={i} className="text-[9px] text-blue-400 font-bold flex items-center gap-1.5 mb-1">
                            <span>📢</span>{n}
                          </div>
                        ))}
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block mb-1.5">Resources</span>
                        {dispatchPlan.resources.slice(0, 4).map((r, i) => (
                          <div key={i} className="text-[9px] text-orange-400 font-bold flex items-center gap-1.5 mb-1">
                            <span>🚒</span>{r}
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Dispatch Button */}
                {!dispatchPlan && (
                  <Button
                    onClick={handleDispatch}
                    disabled={dispatching}
                    className={`w-full h-12 font-black tracking-widest text-[11px] uppercase rounded-xl transition-all border-none ${
                      dispatching
                        ? "bg-red-500/20 text-red-400 cursor-not-allowed"
                        : "bg-red-500 text-white hover:bg-red-600 shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:shadow-[0_0_40px_rgba(239,68,68,0.6)]"
                    }`}
                  >
                    {dispatching ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        AI PLANNING DISPATCH...
                      </span>
                    ) : (
                      "🚨 DISPATCH RESPONSE"
                    )}
                  </Button>
                )}

                {dispatchPlan && (
                  <Button
                    onClick={() => { setSelectedReport(null); setDispatchPlan(null); }}
                    className="w-full h-10 font-black tracking-widest text-[10px] uppercase rounded-xl bg-[#00ff88]/10 text-[#00ff88] hover:bg-[#00ff88]/20 border border-[#00ff88]/30 transition-all"
                  >
                    ✓ CLOSE — DISPATCH ACTIVE
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

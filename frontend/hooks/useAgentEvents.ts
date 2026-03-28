"use client";

import { useState, useEffect } from "react";

export interface AgentEvent {
  agent: string;
  status: "running" | "done" | "error" | "tool_call" | "tool_result";
  msg: string;
  report_id: string;
  ts: string;
  icon: string;
  color: string;
}

export interface PipelineRun {
  report_id: string;
  events: AgentEvent[];
  startedAt: string;
  isComplete: boolean;
  finalLabel?: string;
  finalDept?: string;
}

const COLOR_MAP: Record<string, string> = {
  blue: "text-blue-400",
  purple: "text-purple-400",
  green: "text-[#00ff88]",
  orange: "text-orange-400",
  gray: "text-gray-400",
};

const WS_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080")
  .replace("https://", "wss://")
  .replace("http://", "ws://");

export { COLOR_MAP };

export function useAgentEvents() {
  const [runs, setRuns] = useState<PipelineRun[]>([]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const connect = () => {
      try {
        ws = new WebSocket(`${WS_BASE}/ws/agents`);

        ws.onmessage = (e) => {
          try {
            const ev: AgentEvent = JSON.parse(e.data);
            if (!isMounted) return;

            setRuns((prev) => {
              const idx = prev.findIndex((r) => r.report_id === ev.report_id);
              const isComplete =
                ev.agent === "Orchestrator" && ev.status === "done";
              const isDone = ev.agent === "Orchestrator" && ev.status === "done";

              // Extract final label/dept from SeverityEngine done event
              let finalLabel: string | undefined;
              let finalDept: string | undefined;
              if (ev.agent === "SeverityEngine" && ev.status === "done") {
                const match = ev.msg.match(/→ (\w+) → (.+)$/);
                if (match) {
                  finalLabel = match[1];
                  finalDept = match[2];
                }
              }

              if (idx === -1) {
                // New pipeline run
                return [
                  {
                    report_id: ev.report_id,
                    events: [ev],
                    startedAt: ev.ts,
                    isComplete: isDone,
                    finalLabel,
                    finalDept,
                  },
                  ...prev,
                ].slice(0, 20);
              } else {
                // Append to existing run
                const updated = [...prev];
                updated[idx] = {
                  ...updated[idx],
                  events: [...updated[idx].events, ev],
                  isComplete: updated[idx].isComplete || isComplete,
                  finalLabel: finalLabel || updated[idx].finalLabel,
                  finalDept: finalDept || updated[idx].finalDept,
                };
                return updated;
              }
            });
          } catch {}
        };

        ws.onerror = () => {};
        ws.onclose = () => {
          if (isMounted) reconnectTimer = setTimeout(connect, 3000);
        };
      } catch {}
    };

    connect();
    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return { runs };
}

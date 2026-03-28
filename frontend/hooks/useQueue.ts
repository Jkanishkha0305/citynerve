"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface Report {
  id: string;
  complaint_type: string;
  description: string;
  lat: number;
  lon: number;
  address: string;
  severity: number;
  label: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  department: string;
  reasons: string[];
  submitted_at: string;
  status: "PENDING" | "DISPATCHED";
}

interface UseQueueReturn {
  queue: Report[];
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
  reconnect: () => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
const MAX_RECONNECT_DELAY = 8000;
const POLL_INTERVAL = 3000;

export function useQueue(): UseQueueReturn {
  const [queue, setQueue] = useState<Report[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const wsFailedRef = useRef(false);

  // REST polling fallback — used when WebSocket is unavailable (e.g. Cloud Run HTTP/2)
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/queue`);
        if (res.ok) {
          const data = await res.json();
          setQueue(data);
          setConnected(true);
          setReconnecting(false);
          setError(null);
        }
      } catch {
        setConnected(false);
      }
    };
    poll();
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsFailedRef.current) { startPolling(); return; }

    if (reconnectAttemptRef.current > 0) setReconnecting(true);

    try {
      const wsUrl = `${API_BASE_URL.replace("https", "wss").replace("http", "ws")}/ws/queue`;
      const ws = new WebSocket(wsUrl);

      const failTimer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          wsFailedRef.current = true;
          startPolling();
        }
      }, 5000);

      ws.onopen = () => {
        clearTimeout(failTimer);
        setConnected(true);
        setReconnecting(false);
        setError(null);
        reconnectAttemptRef.current = 0;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "queue_update" && Array.isArray(data.queue)) {
            setQueue(data.queue);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        clearTimeout(failTimer);
        setConnected(false);
        wsRef.current = null;
        if (wsFailedRef.current) { startPolling(); return; }
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), MAX_RECONNECT_DELAY);
        reconnectAttemptRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        clearTimeout(failTimer);
        wsFailedRef.current = true;
        setConnected(false);
        startPolling();
      };

      wsRef.current = ws;
    } catch {
      wsFailedRef.current = true;
      startPolling();
    }
  }, [startPolling]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    wsFailedRef.current = false;
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (wsRef.current) wsRef.current.close();
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { queue, connected, reconnecting, error, reconnect };
}

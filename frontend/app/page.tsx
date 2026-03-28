"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { DraftCard } from "@/components/DraftCard";
import { useGeminiLive } from "@/hooks/useGeminiLive";

type AppState = "idle" | "conversation" | "analyzing" | "draft" | "success";
type Mode = "voice" | "vision";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

interface Coordinates {
  lat: number;
  lon: number;
}

export default function CitizenApp() {
  const router = useRouter();
  const [state, setState] = useState<AppState>("idle");
  const [mode, setMode] = useState<Mode>("voice");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [isDemoLocation, setIsDemoLocation] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [isVisionScan, setIsVisionScan] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startSession, stopSession, messages, getTranscript } = useGeminiLive();

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoordinates({ lat: position.coords.latitude, lon: position.coords.longitude });
          setIsDemoLocation(false);
        },
        () => {
          setCoordinates({ lat: 40.7580, lon: -73.9855 });
          setIsDemoLocation(true);
        }
      );
    }
  }, []);

  const submitReport = useCallback(async (description: string, imageB64?: string) => {
    if (!coordinates) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: description,
          lat: coordinates.lat,
          lon: coordinates.lon,
          image_b64: imageB64,
        }),
      });
      const data = await response.json();
      setDraft(data);
      setState("draft");
    } catch (error) {
      console.error("Report failed:", error);
      setState("idle");
    } finally {
      setIsVisionScan(false);
    }
  }, [coordinates]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsVisionScan(true);
    setState("analyzing");

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = (reader.result as string).split(",")[1];
      await submitReport("Visual report submitted via photo upload.", base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleStart = async () => {
    if (mode === "vision") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setVideoStream(stream);
      } catch (e) { console.error(e); }
    }
    setState("conversation");
    await startSession(mode);
  };

  const handleStop = useCallback(async () => {
    stopSession();
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      setVideoStream(null);
    }
    const text = getTranscript();
    if (text) {
      setState("analyzing");
      await submitReport(text);
    } else {
      setState("idle");
    }
  }, [stopSession, videoStream, getTranscript, submitReport]);

  const handleConfirm = async () => {
    if (!draft) return;
    try {
      await fetch(`${API_BASE_URL}/api/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: draft.id }),
      });
      setState("success");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-hidden relative cyber-grid scanline">
      {mode === "vision" && state === "conversation" && videoStream && (
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale" />
      )}

      <div className="relative z-10 min-h-screen flex flex-col items-center">
        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="mb-12">
                <h1 className="text-6xl font-black tracking-tighter uppercase mb-2">Smart<span className="text-[#00ff88]">311</span> AI</h1>
                <p className="text-gray-500 font-bold tracking-[0.3em] uppercase text-xs">Emergency Response Portal</p>
              </div>

              <div className="glass-card p-1 rounded-xl mb-16 flex gap-1">
                <button onClick={() => setMode("voice")} className={`px-8 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${mode === "voice" ? "bg-[#00ff88] text-black shadow-[0_0_20px_rgba(0,255,136,0.3)]" : "text-gray-500 hover:text-white"}`}>Voice</button>
                <button onClick={() => setMode("vision")} className={`px-8 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${mode === "vision" ? "bg-[#00ff88] text-black shadow-[0_0_20px_rgba(0,255,136,0.3)]" : "text-gray-500 hover:text-white"}`}>Vision</button>
                <button onClick={() => fileInputRef.current?.click()} className="px-8 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all">Upload</button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <motion.div 
                onClick={handleStart}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-40 h-40 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center cursor-pointer relative group"
              >
                <div className="absolute inset-0 rounded-full bg-[#00ff88]/20 animate-ping opacity-20" />
                <div className="w-24 h-24 rounded-full bg-[#00ff88] shadow-[0_0_40px_rgba(0,255,136,0.4)] flex items-center justify-center">
                  <span className="text-black font-black text-xs uppercase tracking-tighter group-hover:scale-110 transition-transform">Report</span>
                </div>
              </motion.div>

              <p className="mt-12 text-gray-500 font-bold text-[10px] uppercase tracking-[0.2em] animate-pulse">Tap to initiate AI triage</p>
            </motion.div>
          )}

          {state === "conversation" && (
            <motion.div key="conversation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 w-full max-w-lg flex flex-col p-6 pt-12">
              <div className="flex items-center gap-3 mb-8 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-full w-fit mx-auto">
                <div className="w-2 h-2 rounded-full bg-red-500 critical-pulse" />
                <span className="text-red-500 font-black text-[10px] uppercase tracking-widest">Live Uplink — Gemini Node active</span>
              </div>

              <div className="flex-1 overflow-y-auto flex flex-col gap-4 mb-8 custom-scrollbar">
                {messages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm font-medium ${msg.role === "user" ? "self-end glass-card border-white/20" : "self-start bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20"}`}>
                    {msg.text}
                  </motion.div>
                ))}
              </div>

              <button onClick={handleStop} className="w-full py-5 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-xs hover:bg-[#00ff88] transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)] active:scale-[0.98]">End & Analyze Report</button>
            </motion.div>
          )}

          {state === "analyzing" && (
            <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 border-4 border-[#00ff88]/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-[#00ff88] rounded-full border-t-transparent animate-spin" />
                {isVisionScan && (
                  <motion.div 
                    initial={{ top: 0 }}
                    animate={{ top: "100%" }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 right-0 h-0.5 bg-[#00ff88] shadow-[0_0_10px_#00ff88] z-10"
                  />
                )}
              </div>
              <div className="text-center">
                <p className="text-[#00ff88] font-black tracking-[0.3em] uppercase text-xs mb-2">
                  {isVisionScan ? "Neural Vision Scan" : "Neural Processing"}
                </p>
                <p className="text-gray-500 font-bold text-[10px] uppercase tracking-widest">
                  {isVisionScan ? "Analyzing visual evidence..." : "Enriching spatial context data..."}
                </p>
              </div>
            </motion.div>
          )}

          {state === "draft" && draft && (
            <motion.div key="draft" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col p-6 pt-12 w-full max-w-lg">
              <p className="text-gray-500 font-black text-[10px] uppercase tracking-[0.3em] text-center mb-6">Review Generated Report</p>
              <DraftCard
                severity={draft.label}
                score={draft.severity}
                complaintType={draft.complaint_type}
                description={draft.description}
                facilities={[]}
                department={draft.department}
                onConfirm={handleConfirm}
                onEdit={() => { setState("idle"); setDraft(null); }}
                fireStation={draft.nearby?.fire_stations?.[0] ? { name: draft.nearby.fire_stations[0].name, distance: draft.nearby.fire_stations[0].distance_m } : null}
                priorComplaints={draft.nearby?.prior_complaints_30d ?? 0}
              />
            </motion.div>
          )}

          {state === "success" && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 rounded-full bg-[#00ff88] flex items-center justify-center mb-8 shadow-[0_0_50px_rgba(0,255,136,0.3)]">
                <svg className="w-12 h-12 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-4xl font-black uppercase tracking-tighter mb-2">Transmitted</h2>
              <p className="text-gray-500 font-bold tracking-[0.2em] uppercase text-[10px]">Signal locked • Redirecting to Command Center</p>
            </motion.div>
          )}
        </AnimatePresence>

        {state === "idle" && coordinates && (
          <div className="p-8">
            <div className="px-4 py-2 rounded bg-black/40 border border-white/5 backdrop-blur-md">
              <p className="text-[9px] text-gray-500 font-black tracking-widest uppercase">
                GPS LOCK: {coordinates.lat.toFixed(4)}, {coordinates.lon.toFixed(4)} {isDemoLocation && "• SIMULATED"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

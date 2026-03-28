"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { WaveformVisualizer } from "@/components/WaveformVisualizer";
import { DraftCard } from "@/components/DraftCard";
import { useGeminiLive } from "@/hooks/useGeminiLive";

type AppState = "idle" | "recording" | "draft" | "success";
type Mode = "voice" | "vision";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

interface Coordinates {
  lat: number;
  lon: number;
}

interface DraftData {
  severity: number;
  label: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  complaint_type: string;
  description: string;
  department: string;
  reasons: string[];
  facilities: Array<{
    type: "hospital" | "subway" | "school";
    name: string;
    distance: number;
  }>;
  nearby?: {
    fire_stations?: Array<{name: string; distance_m: number}>;
    prior_complaints_30d?: number;
    hospitals?: Array<{name: string; distance_m: number}>;
    schools?: Array<{name: string; distance_m: number}>;
    subway_entrances?: Array<{name: string; distance_m: number}>;
  };
}

export default function CitizenApp() {
  const router = useRouter();
  const [state, setState] = useState<AppState>("idle");
  const [mode, setMode] = useState<Mode>("voice");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [isDemoLocation, setIsDemoLocation] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState<DraftData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { startSession, stopSession, isActive, agentMessage, mode: geminiMode } = useGeminiLive();

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoordinates({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
          setIsDemoLocation(false);
        },
        () => {
          setCoordinates({ lat: 40.7580, lon: -73.9855 });
          setIsDemoLocation(true);
        }
      );
    } else {
      setCoordinates({ lat: 40.7580, lon: -73.9855 });
      setIsDemoLocation(true);
    }
  }, []);

  useEffect(() => {
    const handleAction = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const action = customEvent.detail;

      if (action.action === "submit") {
        await submitReport(action.description || transcript);
      }
    };

    window.addEventListener("gemini-action", handleAction);
    return () => window.removeEventListener("gemini-action", handleAction);
  }, [transcript]);

  useEffect(() => {
    if (agentMessage && state === "recording") {
      setTranscript(agentMessage);
    }
  }, [agentMessage, state]);

  useEffect(() => {
    if (videoStream && videoRef.current) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream]);

  const submitReport = async (description: string) => {
    if (!coordinates) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: description,
          lat: coordinates.lat,
          lon: coordinates.lon,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit report");
      }

      const data = await response.json();
      setDraft(data);
      setState("draft");
    } catch (error) {
      console.error("Failed to submit report:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartRecording = async () => {
    setState("recording");
    setTranscript("");
    setDraft(null);

    if (mode === "vision") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setVideoStream(stream);
      } catch (error) {
        console.error("Failed to get video stream:", error);
      }
    }

    await startSession(mode);
  };

  const handleStopRecording = useCallback(() => {
    stopSession();
    
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      setVideoStream(null);
    }

    if (transcript && state === "recording") {
      submitReport(transcript);
    }
  }, [stopSession, videoStream, transcript, state]);

  const handleConfirm = async () => {
    if (!draft) return;

    setIsLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: draft.complaint_type }),
      });

      setState("success");
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (error) {
      console.error("Failed to confirm report:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    setState("recording");
    setDraft(null);
  };

  return (
    <div 
      className="min-h-screen bg-[#0a0a0a] text-white overflow-hidden relative"
      onClick={() => state === "recording" && handleStopRecording()}
    >
      {mode === "vision" && state === "recording" && videoStream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
      )}

      <div className="relative z-10 min-h-screen flex flex-col">
        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-6"
            >
              <h1 className="text-5xl font-bold mb-2">Smart311 AI</h1>
              <p className="text-gray-400 text-lg mb-12">Your city. Protected by AI.</p>

              <div className="flex gap-3 mb-16">
                <button
                  onClick={() => setMode("voice")}
                  className={`px-6 py-2 rounded-full font-medium transition-all ${
                    mode === "voice"
                      ? "bg-white/10 backdrop-blur-xl border border-white/20 text-white"
                      : "text-gray-500 hover:text-white"
                  }`}
                >
                  VOICE
                </button>
                <button
                  onClick={() => setMode("vision")}
                  className={`px-6 py-2 rounded-full font-medium transition-all ${
                    mode === "vision"
                      ? "bg-white/10 backdrop-blur-xl border border-white/20 text-white"
                      : "text-gray-500 hover:text-white"
                  }`}
                >
                  VISION
                </button>
              </div>

              <motion.div
                className="w-32 h-32 rounded-full bg-[#00ff88] mb-8 cursor-pointer"
                onClick={handleStartRecording}
                animate={{
                  boxShadow: [
                    "0 0 20px #00ff88",
                    "0 0 40px #00ff88",
                    "0 0 60px #00ff88",
                    "0 0 40px #00ff88",
                    "0 0 20px #00ff88",
                  ],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              <p className="text-gray-400 text-center">Tap to report an emergency</p>
            </motion.div>
          )}

          {state === "recording" && (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center p-6 pt-16"
            >
              <div className="flex items-center gap-2 mb-12">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-500 font-medium">LIVE — Gemini is listening</span>
              </div>

              <WaveformVisualizer isActive={isActive} />

              <p className="text-gray-400 mt-8 mb-4">
                {mode === "vision" ? "Describe what you see..." : "Describe the emergency..."}
              </p>

              <div className="flex-1 w-full max-w-md overflow-y-auto mb-8">
                <p className="text-white text-lg leading-relaxed">{transcript || "Listening..."}</p>
              </div>

              <p className="text-gray-500 text-sm">Tap anywhere to stop</p>
            </motion.div>
          )}

          {state === "draft" && draft && (
            <motion.div
              key="draft"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="fixed inset-x-0 bottom-0 p-6"
            >
              <DraftCard
                severity={draft.label}
                score={draft.severity}
                complaintType={draft.complaint_type.replace("_", " ")}
                description={draft.description}
                facilities={draft.facilities}
                department={draft.department}
                onConfirm={handleConfirm}
                onEdit={handleEdit}
                fireStation={draft.nearby?.fire_stations?.[0] ? {
                  name: draft.nearby.fire_stations[0].name,
                  distance: draft.nearby.fire_stations[0].distance_m
                } : null}
                priorComplaints={draft.nearby?.prior_complaints_30d ?? 0}
              />
            </motion.div>
          )}

          {state === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="w-32 h-32 rounded-full bg-[#00ff88] flex items-center justify-center mb-8"
              >
                <svg className="w-16 h-16 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              <h2 className="text-2xl font-bold text-white mb-2">Report Submitted!</h2>
              <p className="text-gray-400">Redirecting to dashboard...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {state === "idle" && coordinates && (
          <div className="p-6 text-center">
            <p className="text-gray-500 text-sm">
              GPS: {coordinates.lat.toFixed(4)}, {coordinates.lon.toFixed(4)}
              {isDemoLocation && " (demo location)"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

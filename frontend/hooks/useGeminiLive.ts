"use client";

import { useState, useRef, useCallback } from "react";

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

const SYSTEM_PROMPT = `You are Smart311, NYC's AI emergency triage assistant. Gather information through a SHORT natural conversation to file a 311 report.

When user describes a problem:
- Ask 1-2 short follow-up questions: location, severity, duration. One question at a time.
- Once you have complaint type + location + key details, say: "Got it, generating your report now." then on a NEW LINE output ONLY this JSON (nothing else on that line):
{"action":"submit","description":"<full description combining everything the user told you>"}
- Never output JSON mid-sentence. Confirmation phrase first, then JSON on its own line.
- Sound like a professional dispatcher. Be concise.`;

interface GeminiAction {
  action: "submit" | "correct";
  complaint_type?: string;
  description?: string;
}

export interface Message {
  role: "user" | "assistant";
  text: string;
}

interface UseGeminiLiveReturn {
  startSession: (mode: "voice" | "vision") => Promise<void>;
  stopSession: () => void;
  isActive: boolean;
  messages: Message[];
  agentMessage: string;
  mode: "voice" | "vision" | null;
  getTranscript: () => string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
const VERTEX_API_KEY = process.env.NEXT_PUBLIC_VERTEX_API_KEY || "";
const VERTEX_ENDPOINT = process.env.NEXT_PUBLIC_VERTEX_ENDPOINT || "https://aiplatform.googleapis.com/v1/publishers/google/models";
const VERTEX_MODEL = process.env.NEXT_PUBLIC_VERTEX_MODEL || "gemini-2.5-flash-lite";

export function useGeminiLive(): UseGeminiLiveReturn {
  const [isActive, setIsActive] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentMessage, setAgentMessage] = useState("");
  const [mode, setMode] = useState<"voice" | "vision" | null>(null);

  const sessionRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agentMessageRef = useRef("");
  const interimTranscriptRef = useRef("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isActiveRef = useRef(false);

  const fetchApiKey = async (): Promise<string> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/config`);
      const data = await response.json();
      return data.geminiApiKey || "";
    } catch {
      return "";
    }
  };

  const startSession = useCallback(async (sessionMode: "voice" | "vision") => {
    try {
      const apiKey = await fetchApiKey();

      if (!apiKey) {
        console.error("No API key found, falling back to Web Speech API");
      }

      setMode(sessionMode);
      setMessages([]);
      setAgentMessage("");
      agentMessageRef.current = "";
      setIsActive(true);
      isActiveRef.current = true;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: sessionMode === "vision",
      });

      mediaStreamRef.current = stream;

      if (sessionMode === "vision") {
        videoRef.current = document.createElement("video");
        videoRef.current.srcObject = stream;
        videoRef.current.play();

        canvasRef.current = document.createElement("canvas");
        canvasRef.current.width = 640;
        canvasRef.current.height = 480;
      }

      // Always use Web Speech API for reliable STT in browser
      // Use Gemini REST API for follow-up questions after each utterance
      const askGemini = async (history: Message[], userText: string) => {
        if (!isActiveRef.current) return;
        // Use Vertex AI key from env (works even if backend key is exhausted)
        const vertexKey = VERTEX_API_KEY || apiKey;
        if (!vertexKey) return;
        try {
          const contents = [
            ...history.map(m => ({
              role: m.role === "user" ? "user" : "model",
              parts: [{ text: m.text }]
            })),
            { role: "user", parts: [{ text: userText }] }
          ];
          const res = await fetch(
            `${VERTEX_ENDPOINT}/${VERTEX_MODEL}:generateContent?key=${vertexKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents,
              }),
            }
          );
          const data = await res.json();
          const reply: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (!reply || !isActiveRef.current) return;

          // Speak the reply (strip JSON line before speaking)
          const spokenText = reply.replace(/\{[^{}]*\}/g, "").trim();
          if (spokenText) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(spokenText);
            utterance.rate = 1.1;
            window.speechSynthesis.speak(utterance);
          }

          setMessages(prev => [...prev, { role: "assistant", text: spokenText || reply }]);

          // Check for submit action
          const jsonMatch = reply.match(/\{[^{}]*"action"[^{}]*\}/);
          if (jsonMatch) {
            try {
              const action: GeminiAction = JSON.parse(jsonMatch[0]);
              if (action.action === "submit" || action.action === "correct") {
                window.dispatchEvent(new CustomEvent("gemini-action", { detail: action }));
              }
            } catch { /* ignore */ }
          }
        } catch (e) {
          console.error("Gemini REST error:", e);
        }
      };

      if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
        const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognitionClass();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let finalTranscript = "";
          let interimTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptText = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcriptText + " ";
            } else {
              interimTranscript += transcriptText;
            }
          }
          if (finalTranscript) {
            const trimmed = finalTranscript.trim();
            interimTranscriptRef.current = "";
            setMessages(prev => {
              const updated = [...prev, { role: "user" as const, text: trimmed }];
              // Ask Gemini after updating messages
              askGemini(prev, trimmed);
              return updated;
            });
          } else if (interimTranscript) {
            interimTranscriptRef.current = interimTranscript;
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
        };

        recognition.onend = () => {
          if (isActiveRef.current) {
            try { recognition.start(); } catch { /* stopped */ }
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      }
    } catch (error) {
      console.error("Failed to start session:", error);
      setIsActive(false);
      isActiveRef.current = false;
    }
  }, []);

  const stopSession = useCallback(() => {
    isActiveRef.current = false;

    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    videoRef.current = null;
    canvasRef.current = null;

    setIsActive(false);
    setMode(null);
  }, []);

  const getTranscript = useCallback((): string => {
    const fromMessages = messages.filter(m => m.role === "user").map(m => m.text).join(" ");
    return (fromMessages + " " + interimTranscriptRef.current).trim();
  }, [messages]);

  return {
    startSession,
    stopSession,
    isActive,
    messages,
    agentMessage,
    mode,
    getTranscript,
  };
}

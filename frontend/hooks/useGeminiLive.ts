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
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

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

      if (apiKey) {
        const wsUrl = `wss://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-live-001:streamConnect?key=${apiKey}`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("Gemini Live WebSocket opened");

          const setupMsg = {
            setup: {
              model: "gemini-2.0-flash-live-001",
              systemInstruction: {
                role: "user",
                parts: [{ text: SYSTEM_PROMPT }],
              },
              modalities: ["AUDIO", "TEXT"],
              inputAudioFormat: "PCM_16K",
              outputAudioFormat: "PCM_16K",
              speechConfig: {
                languageCode: "en-US",
              },
            },
          };
          ws.send(JSON.stringify(setupMsg));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.serverContent?.modelTurn?.parts) {
              for (const part of data.serverContent.modelTurn.parts) {
                if (part.text) {
                  agentMessageRef.current += part.text;
                  setAgentMessage(agentMessageRef.current);

                  const utterance = new SpeechSynthesisUtterance(part.text);
                  utterance.rate = 1.0;
                  window.speechSynthesis.speak(utterance);

                  const jsonMatch = part.text.match(/\{[^{}]*\}/);
                  if (jsonMatch) {
                    try {
                      const action: GeminiAction = JSON.parse(jsonMatch[0]);
                      if (action.action === "submit" || action.action === "correct") {
                        window.dispatchEvent(
                          new CustomEvent("gemini-action", { detail: action })
                        );
                      }
                    } catch (e) {
                      console.error("Failed to parse JSON action:", e);
                    }
                  }
                }
              }
            }

            if (data.serverContent?.turnComplete) {
              const completedText = agentMessageRef.current;
              agentMessageRef.current = "";
              if (completedText) {
                setMessages((prev) => [...prev, { role: "assistant", text: completedText }]);
              }
            }
          } catch (e) {
            console.error("Error parsing WebSocket message:", e);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
          console.log("WebSocket closed");
        };

        sessionRef.current = ws;

        if (sessionMode === "vision" && canvasRef.current && videoRef.current) {
          frameIntervalRef.current = setInterval(() => {
            if (!sessionRef.current || !canvasRef.current || !videoRef.current) return;
            if (sessionRef.current.readyState !== WebSocket.OPEN) return;

            const ctx = canvasRef.current.getContext("2d");
            if (!ctx) return;

            ctx.drawImage(videoRef.current, 0, 0, 640, 480);
            const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.7);
            const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

            const msg = {
              clientContent: {
                turns: [{
                  role: "user",
                  parts: [{
                    mimeType: "image/jpeg",
                    data: base64,
                  }],
                }],
                turnComplete: false,
              },
            };
            sessionRef.current.send(JSON.stringify(msg));
          }, 2000);
        }
      } else {
        if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
          const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          const recognition = new SpeechRecognitionClass();

          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "en-US";

          recognition.onresult = (event: any) => {
            let finalTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcriptText = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += transcriptText + " ";
              }
            }
            if (finalTranscript) {
              const trimmed = finalTranscript.trim();
              setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
            }
          };

          recognition.onerror = (event: any) => {
            console.error("Speech recognition error:", event.error);
          };

          recognition.onend = () => {
            if (isActiveRef.current) {
              try {
                recognition.start();
              } catch {
                // Recognition stopped
              }
            }
          };

          recognitionRef.current = recognition;
          recognition.start();
        }
      }

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      const sendAudioChunk = (audioData: Float32Array) => {
        if (!sessionRef.current) return;
        if (sessionRef.current.readyState !== WebSocket.OPEN) return;

        const int16Array = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          int16Array[i] = Math.max(-32768, Math.min(32767, Math.floor(audioData[i] * 32767)));
        }

        const base64 = btoa(String.fromCharCode(...new Uint8Array(int16Array.buffer)));

        const msg = {
          clientContent: {
            turns: [{
              role: "user",
              parts: [{
                mimeType: "audio/pcm;rate=16000",
                data: base64,
              }],
            }],
            turnComplete: false,
          },
        };
        sessionRef.current.send(JSON.stringify(msg));
      };

      let audioBuffer: Float32Array[] = [];

      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        audioBuffer.push(new Float32Array(data));

        if (audioBuffer.length >= 6) {
          const combined = new Float32Array(audioBuffer.reduce((acc, arr) => acc + arr.length, 0));
          let offset = 0;
          audioBuffer.forEach((arr) => {
            combined.set(arr, offset);
            offset += arr.length;
          });
          audioBuffer = [];
          sendAudioChunk(combined);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
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

  return {
    startSession,
    stopSession,
    isActive,
    messages,
    agentMessage,
    mode,
  };
}

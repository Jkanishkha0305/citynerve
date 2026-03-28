"use client";

import { useEffect, useRef } from "react";

interface RecordButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  isRecording?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
}

export function RecordButton({
  onTranscript,
  disabled = false,
  isRecording = false,
  onStartRecording,
  onStopRecording,
}: RecordButtonProps) {
  const recognitionRef = useRef<{ stop: () => void; start: () => void } | null>(null);
  const accumulatedRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RecognitionClass = SpeechRecognition as any;
    const recognition = new RecognitionClass();
    
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: { resultIndex: number; results: { length: number; item: (i: number) => { isFinal: boolean; [index: number]: { transcript: string } } } }) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        finalTranscript += event.results.item(i)[0].transcript + " ";
      }
      accumulatedRef.current += finalTranscript;
      onTranscript(accumulatedRef.current.trim());
    };

    recognition.onerror = () => {
      recognition.stop();
    };

    recognition.onend = () => {
      if (isRecording) {
        try {
          recognition.start();
        } catch {
          // Already started
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isRecording) {
      accumulatedRef.current = "";
      try {
        recognition.start();
      } catch {
        // Already started
      }
    } else {
      recognition.stop();
    }
  }, [isRecording]);

  const handleClick = () => {
    if (disabled) return;
    if (isRecording) {
      onStopRecording?.();
    } else {
      onStartRecording?.();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`
        relative w-32 h-32 rounded-full flex items-center justify-center
        transition-all duration-300 transform
        ${
          disabled
            ? "bg-zinc-300 cursor-not-allowed scale-100"
            : isRecording
              ? "bg-red-500 scale-110 shadow-lg shadow-red-500/50 animate-pulse"
              : "bg-zinc-800 hover:bg-zinc-700 hover:scale-105 cursor-pointer"
        }
      `}
      aria-label={isRecording ? "Stop recording" : "Start recording"}
    >
      <div
        className={`
          w-12 h-12 rounded-full transition-colors
          ${disabled ? "bg-zinc-400" : isRecording ? "bg-white" : "bg-zinc-200"}
        `}
      />

      {isRecording && (
        <span className="absolute -bottom-8 text-sm text-red-500 font-medium">
          Recording...
        </span>
      )}
    </button>
  );
}

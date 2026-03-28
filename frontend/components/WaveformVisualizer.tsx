"use client";

import { motion, type Variants } from "framer-motion";

interface WaveformVisualizerProps {
  isActive: boolean;
}

const barVariants = (index: number): Variants => ({
  initial: { height: 8 },
  animate: {
    height: [8, 16, 24, 32, 24, 16, 8],
    transition: {
      duration: 0.8,
      repeat: Infinity,
      delay: index * 0.1,
      ease: "easeInOut" as const,
    },
  },
});

export function WaveformVisualizer({ isActive }: WaveformVisualizerProps) {
  if (!isActive) return null;

  return (
    <div className="flex items-end justify-center gap-2 h-16">
      {[0, 1, 2, 3, 4].map((index) => (
        <motion.div
          key={index}
          className="w-3 bg-[#00ff88] rounded-full"
          variants={barVariants(index)}
          initial="initial"
          animate="animate"
        />
      ))}
    </div>
  );
}

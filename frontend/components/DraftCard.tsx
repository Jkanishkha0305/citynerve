"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "./SeverityBadge";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface Facility {
  type: "hospital" | "subway" | "school";
  name: string;
  distance: number;
}

interface DraftCardProps {
  severity: Severity;
  score: number;
  complaintType: string;
  description: string;
  facilities: Facility[];
  department: string;
  onConfirm: () => void;
  onEdit: () => void;
  fireStation?: { name: string; distance: number } | null;
  priorComplaints?: number;
}

const facilityIcons: Record<string, string> = {
  hospital: "🏥",
  subway: "🚇",
  school: "🏫",
};

export function DraftCard({
  severity,
  score,
  complaintType,
  description,
  facilities,
  department,
  onConfirm,
  onEdit,
  fireStation,
  priorComplaints,
}: DraftCardProps) {
  return (
    <Card className="glass-card p-8 rounded-3xl w-full border-[#00ff88]/20 shadow-[0_0_40px_rgba(0,255,136,0.1)] relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#00ff88]/5 rounded-full blur-3xl -mr-16 -mt-16" />
      
      <div className="relative z-10 flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="text-4xl font-black text-white tracking-tighter">{score}</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-[#00ff88] font-black tracking-[0.2em] uppercase">Priority</span>
              <span className={`text-xs font-bold uppercase tracking-widest ${severity === "CRITICAL" ? "text-red-500" : "text-white"}`}>{severity}</span>
            </div>
          </div>
          <div className="px-3 py-1 rounded border border-white/10 bg-white/5">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Draft Node v2.0</span>
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">{complaintType.replace("_", " ")}</h3>
          <p className="text-gray-400 text-sm italic leading-relaxed">"{description}"</p>
        </div>

        <div className="space-y-3 p-4 rounded-2xl bg-black/40 border border-white/5">
          <span className="text-[9px] text-gray-500 font-black tracking-widest uppercase block mb-1">Infrastructure Analysis</span>
          <div className="grid grid-cols-1 gap-2">
            {facilities.map((facility, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span>{facilityIcons[facility.type]}</span>
                  <span className="text-white font-bold uppercase tracking-tight">{facility.name}</span>
                </div>
                <span className="text-[#00ff88] font-mono text-[10px]">{facility.distance}m</span>
              </div>
            ))}
            
            {fireStation && (
              <div className="flex items-center justify-between text-xs border-t border-white/5 pt-2 mt-1">
                <div className="flex items-center gap-2">
                  <span>🚒</span>
                  <span className="text-orange-400 font-bold uppercase tracking-tight">{fireStation.name}</span>
                </div>
                <span className="text-orange-400 font-mono text-[10px]">{fireStation.distance}m</span>
              </div>
            )}

            {!facilities.length && !fireStation && (
              <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">No immediate proximity risks detected</span>
            )}
          </div>
        </div>

        {priorComplaints && priorComplaints >= 5 && (
          <div className="px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-3">
            <span className="text-xl">🔄</span>
            <div>
              <p className="text-yellow-500 font-black text-[10px] uppercase tracking-widest">Cluster Warning</p>
              <p className="text-white/80 text-[10px] font-medium">{priorComplaints} similar reports in 30d window</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88]" />
          <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase">Routing to:</span>
          <span className="text-sm font-black text-[#00ff88] uppercase tracking-tighter">{department}</span>
        </div>

        <div className="flex gap-3 mt-4">
          <Button
            onClick={onConfirm}
            className="flex-1 bg-[#00ff88] text-black hover:bg-[#00cc6a] font-black tracking-widest text-[10px] uppercase h-12 shadow-[0_0_20px_rgba(0,255,136,0.2)] border-none"
          >
            Confirm Transmission
          </Button>
          <Button
            onClick={onEdit}
            variant="outline"
            className="px-6 border-white/10 text-white hover:bg-white/5 font-black tracking-widest text-[10px] uppercase h-12"
          >
            Abort
          </Button>
        </div>
      </div>
    </Card>
  );
}

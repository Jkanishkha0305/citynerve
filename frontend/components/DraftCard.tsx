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

const facilityEmojis: Record<string, string> = {
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
    <Card className="glass-card p-6 rounded-2xl w-full max-w-md">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <SeverityBadge severity={severity} score={score} />
        </div>

        <div>
          <h3 className="text-xl font-bold text-white">{complaintType}</h3>
          <p className="text-gray-400 text-sm mt-1">{description}</p>
        </div>

        <div className="space-y-2">
          {facilities.map((facility, index) => (
            <div key={index} className="flex items-center gap-2 text-gray-300">
              <span>{facilityEmojis[facility.type]}</span>
              <span>{facility.name}</span>
              <span className="text-gray-500">{facility.distance}m</span>
            </div>
          ))}
        </div>

        {fireStation && (
          <div className='flex items-center gap-2 text-orange-400'>
            <span>🚒</span>
            <span>{fireStation.name.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}</span>
            <span className='text-gray-500'>{fireStation.distance}m</span>
          </div>
        )}
        {priorComplaints && priorComplaints >= 5 && (
          <div className='flex items-center gap-2 text-yellow-400 text-sm'>
            <span>🔄</span>
            <span>{priorComplaints} complaints at this location in last 30 days</span>
          </div>
        )}

        <div className="text-[#00ff88] font-medium">
          → {department}
        </div>

        <p className="text-gray-400 text-sm">
          Ready to submit this as a {severity.toLowerCase()} emergency?
        </p>

        <div className="flex gap-3 mt-2">
          <Button
            onClick={onConfirm}
            className="flex-1 bg-[#00ff88] text-black hover:bg-[#00cc6a] font-semibold"
          >
            ✓ CONFIRM
          </Button>
          <Button
            onClick={onEdit}
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/10"
          >
            ✏️ EDIT
          </Button>
        </div>
      </div>
    </Card>
  );
}

"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { Report } from "@/hooks/useQueue";
import "leaflet/dist/leaflet.css";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const severityConfig: Record<Severity, { color: string; radius: number; fillOpacity: number }> = {
  CRITICAL: { color: "#ff3b3b", radius: 14, fillOpacity: 0.8 },
  HIGH: { color: "#ff8c00", radius: 10, fillOpacity: 0.7 },
  MEDIUM: { color: "#ffd700", radius: 8, fillOpacity: 0.6 },
  LOW: { color: "#6b7280", radius: 6, fillOpacity: 0.5 },
};

interface LiveMapProps {
  reports: Report[];
  selectedReport?: Report | null;
}

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1m ago";
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1h ago";
  return `${diffHours}h ago`;
}

function MapController({ reports, selectedReport }: { reports: Report[]; selectedReport?: Report | null }) {
  const map = useMap();

  // Fly to selected report
  useEffect(() => {
    if (selectedReport) {
      map.flyTo([selectedReport.lat, selectedReport.lon], 16, { duration: 0.8 });
    }
  }, [selectedReport, map]);

  // Fit bounds on initial load
  useEffect(() => {
    if (reports.length > 0 && !selectedReport) {
      const bounds = reports.map(r => [r.lat, r.lon] as [number, number]);
      map.fitBounds(bounds as any, { padding: [50, 50] });
    }
  }, [reports.length, map, selectedReport]);

  return null;
}

function findClusters(reports: Report[], threshold: number = 500): Array<{ lat: number; lon: number; count: number }> {
  const clusters: Array<{ lat: number; lon: number; count: number }> = [];
  
  for (let i = 0; i < reports.length; i++) {
    let foundCluster = false;
    for (const cluster of clusters) {
      const distance = Math.sqrt(
        Math.pow(reports[i].lat - cluster.lat, 2) + 
        Math.pow(reports[i].lon - cluster.lon, 2)
      ) * 111000;
      
      if (distance < threshold) {
        cluster.lat = (cluster.lat * cluster.count + reports[i].lat) / (cluster.count + 1);
        cluster.lon = (cluster.lon * cluster.count + reports[i].lon) / (cluster.count + 1);
        cluster.count++;
        foundCluster = true;
        break;
      }
    }
    
    if (!foundCluster) {
      clusters.push({ lat: reports[i].lat, lon: reports[i].lon, count: 1 });
    }
  }
  
  return clusters.filter(c => c.count >= 3);
}

export function LiveMap({ reports, selectedReport }: LiveMapProps) {
  const clusters = findClusters(reports);

  const center: [number, number] = reports.length > 0
    ? [reports[0].lat, reports[0].lon]
    : [40.7580, -73.9855];

  return (
    <MapContainer
      center={center}
      zoom={13}
      className="h-full w-full rounded-lg"
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      <MapController reports={reports} selectedReport={selectedReport} />

      {reports.map((report, index) => {
        const config = severityConfig[report.label as Severity] || severityConfig.LOW;
        const isSelected = selectedReport?.id === report.id;

        return (
          <CircleMarker
            key={report.id || index}
            center={[report.lat, report.lon]}
            radius={isSelected ? config.radius * 2 : config.radius}
            pathOptions={{
              color: isSelected ? "#ffffff" : config.color,
              fillColor: config.color,
              fillOpacity: isSelected ? 1 : config.fillOpacity,
              weight: isSelected ? 3 : 2,
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-bold">{report.complaint_type.replace("_", " ")}</div>
                <div>{report.label} - {report.severity}/100</div>
                <div>{report.address}</div>
                <div>{report.department}</div>
                <div className="text-gray-500">{formatTimeAgo(report.submitted_at)}</div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
      
      {clusters.map((cluster, index) => (
        <CircleMarker
          key={`cluster-${index}`}
          center={[cluster.lat, cluster.lon]}
          radius={25}
          pathOptions={{
            color: "#00ff88",
            fillColor: "#00ff88",
            fillOpacity: 0.2,
            weight: 2,
            dashArray: "5, 10",
          }}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-bold">{cluster.count} reports nearby</div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export default LiveMap;

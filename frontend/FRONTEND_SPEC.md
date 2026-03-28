# Smart311 Triage — Frontend Spec (Next.js 15 + TypeScript + Tailwind v4)

## Stack
- Next.js 15 App Router, TypeScript, Tailwind CSS v4
- Client-side WebSocket for real-time queue updates
- Gemini Live API for voice input (simulated in browser)

## Environment
- Backend API: `http://localhost:8080`
- API_BASE_URL env var override supported

## File: app/globals.css
Tailwind v4 with @import "tailwindcss"

## File: app/layout.tsx
- Already exists with Geist font
- Add `app/globals.css` import
- Title: "Smart311 Triage"

## File: app/page.tsx — Citizen App
Main citizen-facing interface:
- Voice/vision mode toggle (voice default)
- **Voice Mode**:
  - Large pulsing record button (center)
  - "Tap to report an issue" instruction
  - Live transcription display
  - On stop: show draft card with AI-extracted report
- **Vision Mode**:
  - Camera capture button
  - Image preview
  - Submit for description extraction
- Draft confirmation flow with edit/correct option
- Status: pending → confirmed → dispatched

### Data Flow
1. User records voice or captures image
2. POST /api/report with transcript + location
3. Display DraftCard with AI-generated draft
4. User confirms or corrects
5. POST /api/confirm

## File: app/dashboard/page.tsx — City Controller Dashboard
Real-time queue management:
- WebSocket connection to /ws/queue
- Live queue table sorted by severity
- Columns: Severity badge, Type, Location, Department, Time, Status
- Filter by status (PENDING / DISPATCHED)
- Row click → detail modal
- Auto-refresh on WebSocket updates
- Connection status indicator

## File: components/RecordButton.tsx
- Animated microphone button
- States: idle (gray), recording (red pulse), processing (spinner)
- Props: `onTranscript: (text: string) => void`, `disabled: boolean`
- Simulates voice-to-text (real implementation would use Web Speech API)

## File: components/DraftCard.tsx
- Displays AI-extracted report draft
- Shows: complaint type, description, address, severity badge
- Nearby facilities (hospitals, schools, subway)
- Actions: Confirm, Edit/Correct
- Props: `draft: ReportDraft | null`, `onConfirm: () => void`, `onCorrect: (type: string) => void`

## File: components/QueueRow.tsx
- Single queue item row
- Severity color coding: CRITICAL=red, HIGH=orange, MEDIUM=yellow, LOW=green
- Compact info display
- Props: `report: Report`, `onClick: () => void`

## File: hooks/useQueue.ts
```typescript
interface Report {
  id: string;
  complaint_type: string;
  description: string;
  lat: number;
  lon: number;
  address: string;
  severity: number;
  label: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  department: string;
  reasons: string[];
  submitted_at: string;
  status: 'PENDING' | 'DISPATCHED';
}
```
- WebSocket connection to /ws/queue
- Auto-reconnect on disconnect
- Returns: `{ queue: Report[], connected: boolean, error: string | null }`

## File: hooks/useGeminiLive.ts
- Simulated Gemini Live API integration
- Functions:
  - `startSession(onTranscript: (text: string) => void): void`
  - `stopSession(): void`
  - `processImage(imageData: string): Promise<string>`
- Simulates transcript processing for demo

## Types
```typescript
interface ReportDraft {
  id: string;
  complaint_type: string;
  description: string;
  address: string;
  severity: number;
  label: string;
  department: string;
  reasons: string[];
  draft_text: string;
  nearby: {
    hospitals: { name: string; distance_m: number }[];
    schools: { name: string; distance_m: number }[];
    subway_entrances: { name: string; distance_m: number }[];
  };
}
```

## API Integration
- POST /api/report: `{ transcript: string, lat: number, lon: number, image_description?: string }`
- POST /api/confirm: `{ report_id: string, correction?: string }`
- GET /api/queue: Report[]
- WS /ws/queue: `{ type: "queue_update", queue: Report[] }`

## UI Theme
- Primary: zinc-900 (dark mode ready)
- Severity colors: red-500 (critical), orange-500 (high), yellow-500 (medium), green-500 (low)
- Clean dashboard aesthetic
- Responsive mobile-first

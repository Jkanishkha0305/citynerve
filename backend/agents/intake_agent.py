import os, json, requests
from typing import Optional

VERTEX_ENDPOINT = os.environ.get("VERTEX_ENDPOINT", "https://aiplatform.googleapis.com/v1/publishers/google/models")
VERTEX_MODEL = os.environ.get("VERTEX_MODEL", "gemini-2.5-flash-lite")

async def process_intake(transcript: str, image_description: Optional[str] = None,
                         lat: float = 0, lon: float = 0,
                         image_b64: Optional[str] = None) -> dict:
    api_key = os.environ.get("VERTEX_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    if api_key:
        try:
            prompt = """Extract structured complaint from this 311 report.
If an image is provided, prioritize visual evidence for classification.

Respond ONLY with JSON:
{"complaint_type": "one of: pothole, water main, noise, rodent, street light, gas leak, heat, flooding, fire, other", "description": "brief summary", "address_hint": "street name if mentioned, or null"}"""

            parts = [{"text": prompt}]
            if transcript: parts.append({"text": f"Transcript: {transcript}"})
            if image_description: parts.append({"text": f"User Image Description: {image_description}"})
            if image_b64:
                parts.append({
                    "inlineData": {
                        "mimeType": "image/jpeg",
                        "data": image_b64
                    }
                })

            url = f"{VERTEX_ENDPOINT}/{VERTEX_MODEL}:generateContent?key={api_key}"
            response = requests.post(url, json={
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {"responseMimeType": "application/json"}
            }, timeout=15)
            data = response.json()

            if "error" not in data:
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if text:
                    return json.loads(text.strip())
        except Exception as e:
            print(f"Vertex AI intake error: {e}")

    # Keyword fallback
    t = transcript.lower()
    complaint_type = "other"
    keywords = {
        "pothole": ["pothole", "hole", "street repair", "road damage"],
        "water main": ["water main", "pipe burst", "flooding street", "water gushing"],
        "noise": ["noise", "loud", "music", "party", "banging"],
        "rodent": ["rat", "mouse", "rodent", "vermin", "pest"],
        "street light": ["street light", "lamp", "dark", "light out"],
        "gas leak": ["gas", "smell", "rotten eggs", "gas leak"],
        "heat": ["heat", "cold", "radiator", "no hot water", "no heat"],
        "flooding": ["flood", "water", "drain", "standing water"],
        "fire": ["fire", "smoke", "burning", "flames"]
    }
    for k, words in keywords.items():
        if any(w in t for w in words):
            complaint_type = k
            break

    return {
        "complaint_type": complaint_type,
        "description": transcript[:200],
        "address_hint": None
    }

import os, json
from typing import Optional
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

async def process_intake(transcript: str, image_description: Optional[str] = None, lat: float = 0, lon: float = 0) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if api_key and genai:
        try:
            client = genai.Client(api_key=api_key)
            prompt = f"""
            Extract structured complaint from this 311 report transcript.
            Transcript: {transcript}
            Image Description: {image_description or 'None'}

            Respond ONLY with JSON:
            {{
                "complaint_type": "one of: pothole, water main, noise, rodent, street light, gas leak, heat, flooding, fire, other",
                "description": "brief summary",
                "address_hint": "street name if mentioned, or null"
            }}
            """
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            return json.loads(response.text)
        except Exception as e:
            print(f"Gemini error: {e}")
            pass

    # Fallback keyword matching
    t = transcript.lower()
    complaint_type = "other"
    keywords = {
        "pothole": ["pothole", "hole", "street repair"],
        "water main": ["water main", "pipe burst", "flooding street"],
        "noise": ["noise", "loud", "music", "party"],
        "rodent": ["rat", "mouse", "rodent", "vermin"],
        "street light": ["street light", "lamp", "dark"],
        "gas leak": ["gas", "smell", "rotten eggs"],
        "heat": ["heat", "cold", "radiator", "no hot water"],
        "flooding": ["flood", "water", "drain"],
        "fire": ["fire", "smoke", "burning"]
    }

    for k, words in keywords.items():
        if any(w in t for w in words):
            complaint_type = k
            break

    return {
        "complaint_type": complaint_type,
        "description": transcript[:100],
        "address_hint": None
    }

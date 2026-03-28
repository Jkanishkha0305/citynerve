import os, base64, uuid
from google.cloud import storage

# GCP Configuration from ENV
BUCKET_NAME = os.environ.get("GCP_BUCKET_NAME", "smart311-images")

def upload_base64_image(base64_str: str) -> str:
    """
    Uploads a base64 image to GCS and returns the public URL.
    In a hackathon, ensure the bucket has 'Public Read' access 
    or use signed URLs.
    """
    try:
        # 1. Initialize Client
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        
        # 2. Decode the image
        image_data = base64.b64decode(base64_str)
        
        # 3. Create unique filename
        filename = f"reports/{uuid.uuid4()}.jpg"
        blob = bucket.blob(filename)
        
        # 4. Upload
        blob.upload_from_string(image_data, content_type="image/jpeg")
        
        # 5. Return Public URL (assuming public access)
        return f"https://storage.googleapis.com/{BUCKET_NAME}/{filename}"
    except Exception as e:
        print(f"GCS Upload Error: {e}")
        return ""

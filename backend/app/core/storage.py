import time
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from app.core.config import settings

def get_s3_client():
    endpoint = settings.MINIO_ENDPOINT
    if not endpoint.startswith("http://") and not endpoint.startswith("https://"):
        protocol = "https://" if settings.MINIO_SECURE else "http://"
        endpoint = f"{protocol}{endpoint}"
        
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
        use_ssl=settings.MINIO_SECURE,
    )

def init_storage():
    """Verify bucket exists, create if not, with connection retries."""
    bucket_name = settings.MINIO_BUCKET_NAME
    retries = 10
    delay = 3
    for i in range(retries):
        try:
            s3 = get_s3_client()
            try:
                s3.head_bucket(Bucket=bucket_name)
                print(f"Bucket '{bucket_name}' already exists.")
                return
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code")
                # Handle 404/NoSuchBucket
                if error_code in ["404", "NoSuchBucket"] or "404" in str(error_code):
                    s3.create_bucket(Bucket=bucket_name)
                    print(f"Bucket '{bucket_name}' successfully created.")
                    return
                else:
                    raise e
        except Exception as conn_err:
            print(f"Connection error to MinIO (attempt {i+1}/{retries}): {conn_err}")
            time.sleep(delay)
            
    print("Warning: MinIO storage initialization failed or timed out.")

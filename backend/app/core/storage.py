import time
import anyio
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

async def upload_text_to_minio(key: str, body: str, content_type: str = "text/plain") -> str:
    """Upload a text object; raises on failure."""
    def _upload():
        s3 = get_s3_client()
        s3.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=key,
            Body=body.encode("utf-8"),
            ContentType=content_type,
        )
        return key
    return await anyio.to_thread.run_sync(_upload)

async def list_minio_keys(prefix: str) -> list[str]:
    """List object keys under a prefix (empty list on failure)."""
    def _list():
        s3 = get_s3_client()
        keys: list[str] = []
        try:
            paginator = s3.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=settings.MINIO_BUCKET_NAME, Prefix=prefix):
                for obj in page.get("Contents", []):
                    keys.append(obj["Key"])
        except Exception:
            return []
        return keys
    return await anyio.to_thread.run_sync(_list)

async def delete_minio_object(key: str) -> bool:
    """Delete an object; returns False on failure."""
    def _delete():
        s3 = get_s3_client()
        try:
            s3.delete_object(Bucket=settings.MINIO_BUCKET_NAME, Key=key)
            return True
        except Exception:
            return False
    return await anyio.to_thread.run_sync(_delete)

async def download_text_from_minio(key: str) -> str | None:
    """Return the object body as text, or None if the object is missing/unreadable."""
    def _download():
        s3 = get_s3_client()
        try:
            obj = s3.get_object(Bucket=settings.MINIO_BUCKET_NAME, Key=key)
            return obj["Body"].read().decode("utf-8")
        except Exception:
            return None
    return await anyio.to_thread.run_sync(_download)

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

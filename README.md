# AMT-CS1

AMT-CS1 is a research-prototype agentic tutoring backend for introductory programming (CS1) courses. The system is designed to host LLM-driven agents behind an asynchronous FastAPI backend and serve Student, Instructor, Researcher, and Rater clients.

## Tech Stack

*   **Backend**: Python + FastAPI (asynchronous)
*   **Database**: Supabase PostgreSQL with pgvector extension enabled
*   **Cache/Queue**: Redis
*   **Object Storage**: MinIO (S3-compatible) for student code/speech files
*   **Migrations**: Alembic
*   **Containerization**: Docker + Docker Compose

## Repository Structure

*   `backend/app/`: FastAPI application code (routers, database models, schemas, and core settings).
*   `backend/alembic/`: Database migrations.
*   `infra/`: Docker Compose configurations.
*   `.env.example`: Configuration templates.

## Getting Started

### 1. Configure the Environment
Copy the example environment file to create your local settings:
```bash
cp .env.example .env
```

### 2. Start the Docker Containers
From the root of the project, navigate to the infra directory and start the services:
```bash
cd infra
docker-compose up -d --build
```
This starts the backend, postgres, redis, and minio containers.

### 3. Verify Database Status (Optional)
The PostgreSQL/Supabase database container comes preconfigured with the necessary roles. You can verify it is ready to accept connections:
```bash
docker exec amt-postgres pg_isready -U postgres
```

### 4. Run Migrations
Apply the Alembic migrations to set up the tables and enable the vector extension:
```bash
docker exec amt-backend alembic upgrade head
```

### 5. Seed the Database
Populate the database with mock records for testing:
```bash
docker exec amt-backend python scripts/seed_demo.py
```

## Service Access

*   **Frontend UI**: http://localhost:3000
*   **FastAPI API**: http://localhost:8000
*   **OpenAPI Documentation**: http://localhost:8000/docs
*   **MinIO Console**: http://localhost:9001 (Credentials: minioadmin / minioadmin)
*   **Local Database**: localhost:5432 (User: postgres, Password: postgres, Database: postgres)

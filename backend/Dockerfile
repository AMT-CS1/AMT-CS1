# Stage 1: Build the DAP compiler from source
FROM golang:1.23-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git
RUN git clone https://github.com/rafiathallah3/dap.git .
RUN CGO_ENABLED=0 go build -o /dap utama.go

# Stage 2: Run Python FastAPI server
FROM python:3.11-slim
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Copy the compiled dap compiler to /usr/local/bin/dap (safe from volume mount)
COPY --from=builder /dap /usr/local/bin/dap
RUN chmod +x /usr/local/bin/dap

EXPOSE 8000

# Start server with reload for hot-reloading in dev
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]


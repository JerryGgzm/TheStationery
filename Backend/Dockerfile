FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
EXPOSE 8080

# Cloud Run sets $PORT. Single worker; scale horizontally via Cloud Run instances.
CMD exec uvicorn "app:create_app" \
    --factory \
    --host 0.0.0.0 \
    --port ${PORT} \
    --workers 1 \
    --timeout-keep-alive 300 \
    --proxy-headers \
    --forwarded-allow-ips='*' \
    --log-level info

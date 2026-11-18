# syntax=docker/dockerfile:1

# ---- 1. Build frontend (Vite) ----
FROM node:20-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Build backend (Go, static binary) ----
FROM golang:1.22-alpine AS backend
WORKDIR /build/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server \
 && CGO_ENABLED=0 go build -o /out/migrate ./cmd/migrate \
 && CGO_ENABLED=0 go build -o /out/seed ./cmd/seed

# ---- 3. Runtime image ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \
 && mkdir -p /app/uploads \
 && chmod 777 /app/uploads
WORKDIR /app
COPY --from=backend /out/server /app/bin/server
COPY --from=backend /out/migrate /app/bin/migrate
COPY --from=backend /out/seed /app/bin/seed
COPY --from=backend /build/backend/migrations /app/migrations
COPY --from=frontend /build/frontend/dist /app/frontend/dist

ENV APP_ENV=production \
    FRONTEND_DIST=/app/frontend/dist \
    STORAGE_DIR=/app/uploads \
    CRON_ENABLED=false \
    PORT=8080

EXPOSE 8080

# Migrasi + seed dijalankan tiap container start.
# Seed sudah idempoten: tidak menghapus data yang sudah ada.
CMD ["/bin/sh", "-c", "/app/bin/migrate && /app/bin/seed && exec /app/bin/server"]

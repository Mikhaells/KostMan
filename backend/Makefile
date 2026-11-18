.PHONY: run build test migrate-up migrate-down seed tidy

run:
	go run ./cmd/server

build:
	go build -o bin/kosman ./cmd/server

test:
	go test ./... -cover

tidy:
	go mod tidy

migrate-up:
	go run ./cmd/migrate up

migrate-down:
	go run ./cmd/migrate down

seed:
	go run ./cmd/seed

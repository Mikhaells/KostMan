package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/kosman/app/internal/config"
	"github.com/kosman/app/internal/database"
	"github.com/kosman/app/internal/handler"
	"github.com/kosman/app/internal/job"
	"github.com/kosman/app/internal/mailer"
	"github.com/kosman/app/internal/pkg/logger"
	"github.com/kosman/app/internal/service"
	"github.com/kosman/app/internal/storage"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	logger.Init(cfg.AppEnv)
	logger.Info("starting KosMan API")

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		logger.Error(err, "database connection failed")
		os.Exit(1)
	}
	defer db.Close()

	if err = database.Migrate(db, "migrations"); err != nil {
		logger.Error(err, "migration failed")
		os.Exit(1)
	}

	st, err := storage.New(cfg)
	if err != nil {
		logger.Error(err, "storage init failed")
		os.Exit(1)
	}
	m := mailer.New(cfg)
	svc := service.New(db, cfg, m, st)
	h := handler.New(svc, cfg, st)
	cron := job.Start(cfg, svc)
	if cron != nil {
		defer cron.Stop()
	}

	server := &http.Server{
		Addr:              ":" + cfg.AppPort,
		Handler:           h.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		logger.Info("server listening on :" + cfg.AppPort)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error(err, "server stopped unexpectedly")
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("shutting down gracefully")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err = server.Shutdown(ctx); err != nil {
		logger.Error(err, "graceful shutdown failed")
	}
}

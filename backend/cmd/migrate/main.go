package main

import (
	"os"

	"github.com/kosman/app/internal/config"
	"github.com/kosman/app/internal/database"
	"github.com/kosman/app/internal/pkg/logger"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	logger.Init(cfg.AppEnv)
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
	logger.Info("migrations applied successfully")
}

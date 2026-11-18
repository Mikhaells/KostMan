package job

import (
	"context"
	"time"

	"github.com/kosman/app/internal/config"
	"github.com/kosman/app/internal/pkg/logger"
	"github.com/kosman/app/internal/service"
	"github.com/robfig/cron/v3"
)

func Start(cfg *config.Config, svc *service.Services) *cron.Cron {
	if !cfg.CRONEnabled {
		logger.Info("cron disabled by configuration")
		return nil
	}
	c := cron.New()
	_, _ = c.AddFunc("0 0 * * *", func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		n, err := svc.Billing.MarkOverdue(ctx)
		if err != nil {
			logger.Error(err, "cron: mark overdue invoices failed")
			return
		}
		logger.Info("cron: overdue invoices updated: " + itoa(n))
		closed, err := svc.Contract.FinalizeExpired(ctx)
		if err != nil {
			logger.Error(err, "cron: finalize contracts failed")
			return
		}
		logger.Info("cron: contracts finalized: " + itoa(closed))
		_, _ = svc.Billing.DueReminders(ctx, 3)
		contracts, err := svc.Contract.Expiring(ctx, 7)
		if err == nil {
			for _, c := range contracts {
				svc.Notification.NotifyAdmins(ctx, "Kontrak akan berakhir", c.NomorKontrak+" akan berakhir "+c.TanggalSelesai.Format("02 Jan 2006"), "contract_ending", map[string]interface{}{"id": c.ID})
			}
		}
	})
	_, _ = c.AddFunc("0 0 1 * *", func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		n, err := svc.Billing.GenerateMonthly(ctx)
		if err != nil {
			logger.Error(err, "cron: auto billing failed")
			return
		}
		logger.Info("cron: auto invoices created: " + itoa(n))
	})
	c.Start()
	logger.Info("cron scheduler started")
	return c
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	out := ""
	for n > 0 {
		out = string(rune('0'+n%10)) + out
		n /= 10
	}
	return out
}

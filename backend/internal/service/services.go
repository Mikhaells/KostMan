package service

import (
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/kosman/app/internal/config"
	"github.com/kosman/app/internal/mailer"
	"github.com/kosman/app/internal/storage"
)

type base struct {
	db      *sqlx.DB
	cfg     *config.Config
	mailer  *mailer.Mailer
	storage *storage.Storage
	svc     *Services
}

type Services struct {
	Auth         *AuthService
	Property     *PropertyService
	Room         *RoomService
	Tenant       *TenantService
	Contract     *ContractService
	Billing      *BillingService
	Payment      *PaymentService
	Ticket       *TicketService
	Report       *ReportService
	Notification *NotificationService
	Setting      *SettingService
}

func New(db *sqlx.DB, cfg *config.Config, m *mailer.Mailer, st *storage.Storage) *Services {
	s := &Services{}
	b := func() base { return base{db: db, cfg: cfg, mailer: m, storage: st, svc: s} }
	s.Auth = &AuthService{base: b()}
	s.Property = &PropertyService{base: b()}
	s.Room = &RoomService{base: b()}
	s.Tenant = &TenantService{base: b()}
	s.Contract = &ContractService{base: b()}
	s.Billing = &BillingService{base: b()}
	s.Payment = &PaymentService{base: b()}
	s.Ticket = &TicketService{base: b()}
	s.Report = &ReportService{base: b()}
	s.Notification = &NotificationService{base: b()}
	s.Setting = &SettingService{base: b()}
	return s
}

func validEmail(s string) bool {
	at := strings.Index(s, "@")
	return at > 0 && at < len(s)-1 && strings.Contains(s[at+1:], ".")
}

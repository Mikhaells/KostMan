package handler

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/kosman/app/internal/middleware"
)

func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Content-Disposition"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Route("/api/v1", func(api chi.Router) {
		api.Group(func(pub chi.Router) {
			pub.Use(middleware.RateLimit(100))
			pub.Post("/auth/register", h.Register)
			pub.Post("/auth/login", h.Login)
			pub.Post("/auth/refresh", h.Refresh)
			pub.Post("/auth/forgot-password", h.ForgotPassword)
			pub.Post("/auth/reset-password", h.ResetPassword)
		})

		// Any authenticated user: profile, notifications and tenant self-service
		api.Group(func(a chi.Router) {
			a.Use(middleware.Auth(h.cfg))
			a.Get("/auth/me", h.Me)
			a.Put("/auth/me", h.UpdateMe)
			a.Post("/auth/change-password", h.ChangePassword)
			a.Post("/auth/logout", h.Logout)

			a.Get("/notifications", h.ListNotifications)
			a.Get("/notifications/unread-count", h.UnreadCount)
			a.Patch("/notifications/read-all", h.MarkAllRead)
			a.Patch("/notifications/{id}/read", h.MarkNotificationRead)

			a.Get("/tenants/me", h.MeTenant)
			a.Get("/invoices", h.ListInvoices)
			a.Get("/invoices/{id}", h.GetInvoice)
			a.Post("/invoices/{id}/payments", h.CreatePayment)
			a.Get("/contracts", h.ListContracts)
			a.Get("/contracts/{id}", h.GetContract)
			a.Get("/tickets", h.ListTickets)
			a.Post("/tickets", h.CreateTicket)
			a.Get("/tickets/{id}", h.GetTicket)
			a.Post("/upload", h.Upload)
		})

		// Owner / manager operational endpoints
		api.Group(func(adm chi.Router) {
			adm.Use(middleware.Auth(h.cfg))
			adm.Use(middleware.RequireRoles("owner", "manager", "super_admin"))

			adm.Get("/rooms", h.ListRooms)
			adm.Get("/rooms/{id}", h.GetRoom)
			adm.Get("/properties/{id}/rooms", h.ListPropertyRooms)
			adm.Post("/properties/{id}/rooms", h.CreateRoom)
			adm.Put("/rooms/{id}", h.UpdateRoom)
			adm.Patch("/rooms/{id}/status", h.SetRoomStatus)
			adm.Delete("/rooms/{id}", h.DeleteRoom)

			adm.Get("/tenants", h.ListTenants)
			adm.Get("/tenants/{id}", h.GetTenant)
			adm.Post("/tenants", h.CreateTenant)
			adm.Put("/tenants/{id}", h.UpdateTenant)
			adm.Patch("/tenants/{id}/status", h.SetTenantStatus)
			adm.Get("/tenants/{id}/history", h.TenantHistory)
			adm.Post("/tenants/{id}/portal-user", h.CreatePortalUser)

			adm.Post("/contracts", h.CreateContract)
			adm.Post("/contracts/{id}/renew", h.RenewContract)
			adm.Post("/contracts/{id}/terminate", h.TerminateContract)
			adm.Get("/contracts/{id}/pdf", h.ContractPDF)

			adm.Post("/invoices", h.CreateInvoice)
			adm.Put("/invoices/{id}", h.UpdateInvoice)
			adm.Post("/invoices/{id}/void", h.VoidInvoice)
			adm.Get("/invoices/{id}/pdf", h.InvoicePDF)
			adm.Post("/invoices/generate", h.GenerateInvoices)

			adm.Get("/payments", h.ListPayments)
			adm.Post("/invoices/{id}/payments/cash", h.CreateCashPayment)
			adm.Post("/payments/{id}/verify", h.VerifyPayment)
			adm.Post("/payments/{id}/reject", h.RejectPayment)

			adm.Patch("/tickets/{id}", h.UpdateTicket)
			adm.Get("/tickets/stats", h.TicketStats)
		})

		// Owner-only endpoints
		api.Group(func(own chi.Router) {
			own.Use(middleware.Auth(h.cfg))
			own.Use(middleware.RequireRoles("owner", "super_admin"))

			own.Get("/users", h.ListUsers)
			own.Post("/users", h.CreateUser)
			own.Put("/users/{id}", h.UpdateUser)
			own.Delete("/users/{id}", h.DeleteUser)

			own.Get("/properties", h.ListProperties)
			own.Get("/properties/deleted", h.ListDeletedProperties)
			own.Get("/properties/{id}", h.GetProperty)
			own.Post("/properties", h.CreateProperty)
			own.Put("/properties/{id}", h.UpdateProperty)
			own.Delete("/properties/{id}", h.DeleteProperty)
			own.Post("/properties/{id}/restore", h.RestoreProperty)

			own.Get("/dashboard", h.Dashboard)
			own.Get("/reports/{kind}", h.Report)
			own.Get("/reports/{kind}/export", h.ExportReport)

			own.Get("/settings", h.GetSettings)
			own.Put("/settings/{key}", h.PutSetting)
			own.Get("/settings/banks", h.ListBanks)
			own.Post("/settings/banks", h.CreateBank)
			own.Delete("/settings/banks/{id}", h.DeleteBank)
		})
	})

	r.Handle("/uploads/*", http.StripPrefix("/uploads", h.storage))
	r.Handle("/favicon.ico", http.RedirectHandler("/favicon.svg", http.StatusMovedPermanently))
	r.Handle("/*", spa(h.cfg.FrontendDistPath))
	return r
}

func (h *Handler) ListPropertyRooms(w http.ResponseWriter, r *http.Request) {
	clone := r.Clone(r.Context())
	values := clone.URL.Query()
	values.Set("properti_id", param(r, "id"))
	clone.URL.RawQuery = values.Encode()
	h.ListRooms(w, clone)
}

func spa(dist string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(dist, filepath.Clean(r.URL.Path))
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			http.ServeFile(w, r, path)
			return
		}
		index := filepath.Join(dist, "index.html")
		if _, err := os.Stat(index); err == nil {
			http.ServeFile(w, r, index)
			return
		}
		http.NotFound(w, r)
	})
}

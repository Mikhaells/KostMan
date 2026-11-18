package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/kosman/app/internal/middleware"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/pagination"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/service"
)

func (h *Handler) Dashboard(w http.ResponseWriter, r *http.Request) {
	data, err := h.svc.Report.Dashboard(r.Context())
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, data)
}

func (h *Handler) Report(w http.ResponseWriter, r *http.Request) {
	from, to := dateRange(r)
	rows, err := h.svc.Report.ReportData(r.Context(), param(r, "kind"), from, to, r.URL.Query().Get("properti_id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, rows)
}

func (h *Handler) ExportReport(w http.ResponseWriter, r *http.Request) {
	from, to := dateRange(r)
	kind := param(r, "kind")
	format := r.URL.Query().Get("format")
	if format == "pdf" {
		data, name, err := h.svc.Report.ExportPDF(r.Context(), kind, from, to, r.URL.Query().Get("properti_id"))
		if err != nil {
			response.Fail(w, err)
			return
		}
		servePDF(w, name, data)
		return
	}
	data, name, err := h.svc.Report.ExportExcel(r.Context(), kind, from, to, r.URL.Query().Get("properti_id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+name+"\"")
	_, _ = w.Write(data)
}

func dateRange(r *http.Request) (string, string) {
	now := time.Now()
	from := now.AddDate(0, -5, 0).Format("2006-01-02")
	to := now.Format("2006-01-02")
	if v := r.URL.Query().Get("from"); v != "" {
		from = v
	}
	if v := r.URL.Query().Get("to"); v != "" {
		to = v
	}
	return from, to
}

func (h *Handler) ListNotifications(w http.ResponseWriter, r *http.Request) {
	q := pagination.Parse(r)
	list, total, err := h.svc.Notification.List(r.Context(), middleware.UserID(r), r.URL.Query().Get("unread") == "true", q)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.List(w, list, pagination.NewMeta(q, total))
}

func (h *Handler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	count, err := h.svc.Notification.UnreadCount(r.Context(), middleware.UserID(r))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]int{"count": count})
}

func (h *Handler) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Notification.MarkRead(r.Context(), param(r, "id"), middleware.UserID(r)); err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]string{"message": "Notifikasi ditandai dibaca"})
}

func (h *Handler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Notification.MarkAllRead(r.Context(), middleware.UserID(r)); err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]string{"message": "Semua notifikasi ditandai dibaca"})
}

func (h *Handler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.svc.Setting.GetAll(r.Context(), middleware.UserID(r))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, settings)
}

func (h *Handler) PutSetting(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		response.Fail(w, apperror.BadRequest("Body JSON tidak valid"))
		return
	}
	if err := h.svc.Setting.Upsert(r.Context(), middleware.UserID(r), param(r, "key"), raw); err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]string{"message": "Pengaturan disimpan"})
}

func (h *Handler) ListBanks(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.Setting.ListBanks(r.Context(), middleware.UserID(r))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, list)
}

func (h *Handler) CreateBank(w http.ResponseWriter, r *http.Request) {
	var in service.BankInput
	if !decode(w, r, &in) {
		return
	}
	b, err := h.svc.Setting.CreateBank(r.Context(), middleware.UserID(r), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, b)
}

func (h *Handler) DeleteBank(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Setting.DeleteBank(r.Context(), middleware.UserID(r), param(r, "id")); err != nil {
		response.Fail(w, err)
		return
	}
	response.NoContent(w)
}

func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(h.cfg.MaxUploadBytes * 4); err != nil {
		response.Fail(w, apperror.BadRequest("Body JSON tidak valid"))
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		response.Fail(w, apperror.BadRequest("Body JSON tidak valid"))
		return
	}
	defer file.Close()
	url, err := h.storage.Save(file, header)
	if err != nil {
		response.Fail(w, apperror.BadRequest(err.Error()))
		return
	}
	response.Created(w, map[string]string{"url": url, "nama": header.Filename})
}

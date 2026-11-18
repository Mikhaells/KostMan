package handler

import (
	"net/http"

	"github.com/kosman/app/internal/middleware"
	"github.com/kosman/app/internal/pkg/pagination"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/service"
)

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var in service.RegisterInput
	if !decode(w, r, &in) {
		return
	}
	u, err := h.svc.Auth.Register(r.Context(), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, u)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var in service.LoginInput
	if !decode(w, r, &in) {
		return
	}
	pair, err := h.svc.Auth.Login(r.Context(), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, pair)
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if !decode(w, r, &in) {
		return
	}
	pair, err := h.svc.Auth.Refresh(r.Context(), in.RefreshToken)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, pair)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = decode(w, r, &in)
	if err := h.svc.Auth.Logout(r.Context(), in.RefreshToken); err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]string{"message": "Berhasil logout"})
}

func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &in) {
		return
	}
	if err := h.svc.Auth.ForgotPassword(r.Context(), in.Email); err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]string{"message": "Jika email terdaftar, tautan reset telah dikirim"})
}

func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	if err := h.svc.Auth.ResetPassword(r.Context(), in.Token, in.Password); err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]string{"message": "Password berhasil diubah"})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	u, err := h.svc.Auth.GetProfile(r.Context(), middleware.UserID(r))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, u)
}

func (h *Handler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	var in service.ProfileInput
	if !decode(w, r, &in) {
		return
	}
	u, err := h.svc.Auth.UpdateProfile(r.Context(), middleware.UserID(r), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, u)
}

func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if !decode(w, r, &in) {
		return
	}
	if err := h.svc.Auth.ChangePassword(r.Context(), middleware.UserID(r), in.OldPassword, in.NewPassword); err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]string{"message": "Password berhasil diubah"})
}

func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, total, err := h.svc.Auth.ListUsers(r.Context(), pagination.Parse(r), r.URL.Query().Get("search"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.List(w, users, pagination.NewMeta(pagination.Parse(r), total))
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var in service.RegisterInput
	if !decode(w, r, &in) {
		return
	}
	u, err := h.svc.Auth.CreateUser(r.Context(), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, u)
}

func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	var in service.UpdateUserInput
	if !decode(w, r, &in) {
		return
	}
	u, err := h.svc.Auth.UpdateUser(r.Context(), param(r, "id"), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, u)
}

func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Auth.DeleteUser(r.Context(), param(r, "id")); err != nil {
		response.Fail(w, err)
		return
	}
	response.NoContent(w)
}

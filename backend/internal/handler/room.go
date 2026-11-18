package handler

import (
	"net/http"

	"github.com/kosman/app/internal/pkg/pagination"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/service"
)

func (h *Handler) ListRooms(w http.ResponseWriter, r *http.Request) {
	q := pagination.Parse(r)
	list, total, err := h.svc.Room.List(r.Context(), r.URL.Query().Get("properti_id"), r.URL.Query().Get("status"), q)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.List(w, list, pagination.NewMeta(q, total))
}

func (h *Handler) GetRoom(w http.ResponseWriter, r *http.Request) {
	room, err := h.svc.Room.Get(r.Context(), param(r, "id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, room)
}

func (h *Handler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	var in service.RoomInput
	if !decode(w, r, &in) {
		return
	}
	room, err := h.svc.Room.Create(r.Context(), param(r, "id"), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, room)
}

func (h *Handler) UpdateRoom(w http.ResponseWriter, r *http.Request) {
	var in service.RoomInput
	if !decode(w, r, &in) {
		return
	}
	room, err := h.svc.Room.Update(r.Context(), param(r, "id"), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, room)
}

func (h *Handler) SetRoomStatus(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status string `json:"status"`
	}
	if !decode(w, r, &in) {
		return
	}
	room, err := h.svc.Room.SetStatus(r.Context(), param(r, "id"), in.Status)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, room)
}

func (h *Handler) DeleteRoom(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Room.Delete(r.Context(), param(r, "id")); err != nil {
		response.Fail(w, err)
		return
	}
	response.NoContent(w)
}

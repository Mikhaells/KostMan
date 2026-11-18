package response

import (
	"encoding/json"
	"net/http"

	"github.com/kosman/app/internal/pkg/apperror"
)

type Body struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Meta    interface{} `json:"meta,omitempty"`
	Error   string      `json:"error,omitempty"`
	Code    string      `json:"code,omitempty"`
}

func JSON(w http.ResponseWriter, status int, body Body) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func OK(w http.ResponseWriter, data interface{}) {
	JSON(w, http.StatusOK, Body{Success: true, Message: "OK", Data: data})
}

func Created(w http.ResponseWriter, data interface{}) {
	JSON(w, http.StatusCreated, Body{Success: true, Message: "Created", Data: data})
}

func NoContent(w http.ResponseWriter) { w.WriteHeader(http.StatusNoContent) }

func List(w http.ResponseWriter, data interface{}, meta interface{}) {
	JSON(w, http.StatusOK, Body{Success: true, Message: "OK", Data: data, Meta: meta})
}

func Fail(w http.ResponseWriter, err error) {
	e := apperror.From(err)
	JSON(w, e.Status, Body{Success: false, Message: e.Message, Error: e.Message, Code: e.Code})
}

func FailWith(w http.ResponseWriter, status int, message string) {
	JSON(w, status, Body{Success: false, Message: message, Error: message})
}

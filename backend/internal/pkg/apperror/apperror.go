package apperror

import "net/http"

type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Message }

func New(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

func BadRequest(msg string) *Error  { return New(http.StatusBadRequest, "BAD_REQUEST", msg) }
func Unauthorized(msg string) *Error { return New(http.StatusUnauthorized, "UNAUTHORIZED", msg) }
func Forbidden(msg string) *Error   { return New(http.StatusForbidden, "FORBIDDEN", msg) }
func NotFound(msg string) *Error    { return New(http.StatusNotFound, "NOT_FOUND", msg) }
func Conflict(msg string) *Error    { return New(http.StatusConflict, "CONFLICT", msg) }
func Internal(msg string) *Error    { return New(http.StatusInternalServerError, "INTERNAL_ERROR", msg) }

func From(err error) *Error {
	if e, ok := err.(*Error); ok {
		return e
	}
	return Internal(err.Error())
}

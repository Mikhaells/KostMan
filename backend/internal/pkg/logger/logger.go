package logger

import (
	"os"

	"github.com/rs/zerolog"
)

var L zerolog.Logger

func Init(env string) {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if env == "development" {
		L = zerolog.New(zerolog.ConsoleWriter{Out: os.Stdout}).With().Timestamp().Caller().Logger()
		return
	}
	L = zerolog.New(os.Stdout).With().Timestamp().Caller().Logger()
}

func Info(msg string)  { L.Info().Msg(msg) }
func Error(err error, msg string) {
	if err == nil {
		L.Error().Msg(msg)
		return
	}
	L.Error().Err(err).Msg(msg)
}
func Warn(msg string) { L.Warn().Msg(msg) }

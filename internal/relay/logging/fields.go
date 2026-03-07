package logging

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

type Fields struct {
	parts []string
}

func NewFields(event string) *Fields {
	return &Fields{parts: []string{event}}
}

func (f *Fields) String(key string, value string) *Fields {
	value = strings.TrimSpace(value)
	if value == "" {
		return f
	}
	f.parts = append(f.parts, fmt.Sprintf("%s=%s", key, strconv.Quote(value)))
	return f
}

func (f *Fields) Int(key string, value int) *Fields {
	if value == 0 {
		return f
	}
	f.parts = append(f.parts, fmt.Sprintf("%s=%d", key, value))
	return f
}

func (f *Fields) Duration(key string, value time.Duration) *Fields {
	if value <= 0 {
		return f
	}
	f.parts = append(f.parts, fmt.Sprintf("%s=%q", key, value.String()))
	return f
}

func (f *Fields) Build() string {
	return strings.Join(f.parts, " ")
}

package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/yeying-community/router/common/helper"
)

func TraceID() func(c *gin.Context) {
	return func(c *gin.Context) {
		id := resolveTraceID(c)
		c.Set(helper.TraceIDKey, id)
		ctx := helper.SetTraceID(c.Request.Context(), id)
		c.Request = c.Request.WithContext(ctx)
		c.Header(helper.TraceIDKey, id)
		c.Next()
	}
}

func resolveTraceID(c *gin.Context) string {
	for _, candidate := range []string{
		strings.TrimSpace(c.GetHeader(helper.TraceIDKey)),
		parseTraceParent(strings.TrimSpace(c.GetHeader(helper.TraceParentHeader))),
		strings.TrimSpace(c.GetHeader(helper.XRequestIDHeader)),
	} {
		if candidate != "" {
			return candidate
		}
	}
	return helper.GenTraceID()
}

func parseTraceParent(header string) string {
	if header == "" {
		return ""
	}
	parts := strings.Split(header, "-")
	if len(parts) != 4 {
		return ""
	}
	traceID := strings.TrimSpace(parts[1])
	if len(traceID) != 32 {
		return ""
	}
	return traceID
}

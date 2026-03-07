package middleware

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/helper"
)

func SetUpLogger(server *gin.Engine) {
	server.Use(gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		var traceID string
		if param.Keys != nil {
			if value, ok := param.Keys[helper.TraceIDKey].(string); ok {
				traceID = value
			}
		}
		return fmt.Sprintf("%s | %s | %3d | %13v | %15s | %7s %s\n",
			param.TimeStamp.Format("2006/01/02 - 15:04:05"),
			traceID,
			param.StatusCode,
			param.Latency,
			param.ClientIP,
			param.Method,
			param.Path,
		)
	}))
}

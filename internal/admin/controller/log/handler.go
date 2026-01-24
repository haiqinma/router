package log

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/ctxkey"
	logsvc "github.com/yeying-community/router/internal/admin/service/log"
)

// GetAllLogs godoc
// @Summary List logs (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Param p query int false "Page index"
// @Param type query int false "Log type"
// @Param start_timestamp query int false "Start timestamp (unix)"
// @Param end_timestamp query int false "End timestamp (unix)"
// @Param username query string false "Username"
// @Param token_name query string false "Token name"
// @Param model_name query string false "Model name"
// @Param channel query int false "Channel ID"
// @Success 200 {object} docs.UserLogListResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/log [get]
func GetAllLogs(c *gin.Context) {
	p, _ := strconv.Atoi(c.Query("p"))
	if p < 0 {
		p = 0
	}
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	username := c.Query("username")
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	logs, err := logsvc.GetAll(logType, startTimestamp, endTimestamp, modelName, username, tokenName, p*config.ItemsPerPage, config.ItemsPerPage, channel)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
	return
}

// GetUserLogs godoc
// @Summary List user logs
// @Tags public
// @Security BearerAuth
// @Produce json
// @Param p query int false "Page index"
// @Param type query int false "Log type"
// @Param start_timestamp query int false "Start timestamp (unix)"
// @Param end_timestamp query int false "End timestamp (unix)"
// @Param token_name query string false "Token name"
// @Param model_name query string false "Model name"
// @Success 200 {object} docs.UserLogListResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/public/log/self [get]
func GetUserLogs(c *gin.Context) {
	p, _ := strconv.Atoi(c.Query("p"))
	if p < 0 {
		p = 0
	}
	userId := c.GetInt(ctxkey.Id)
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	logs, err := logsvc.GetUser(userId, logType, startTimestamp, endTimestamp, modelName, tokenName, p*config.ItemsPerPage, config.ItemsPerPage)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
	return
}

// SearchAllLogs godoc
// @Summary Search logs (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Param keyword query string false "Keyword"
// @Success 200 {object} docs.UserLogListResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/log/search [get]
func SearchAllLogs(c *gin.Context) {
	keyword := c.Query("keyword")
	logs, err := logsvc.SearchAll(keyword)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
	return
}

// SearchUserLogs godoc
// @Summary Search user logs
// @Tags public
// @Security BearerAuth
// @Produce json
// @Param keyword query string false "Keyword"
// @Success 200 {object} docs.UserLogListResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/public/log/self/search [get]
func SearchUserLogs(c *gin.Context) {
	keyword := c.Query("keyword")
	userId := c.GetInt(ctxkey.Id)
	logs, err := logsvc.SearchUser(userId, keyword)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
	return
}

// GetLogsStat godoc
// @Summary Log stats (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Param type query int false "Log type"
// @Param start_timestamp query int false "Start timestamp (unix)"
// @Param end_timestamp query int false "End timestamp (unix)"
// @Param token_name query string false "Token name"
// @Param username query string false "Username"
// @Param model_name query string false "Model name"
// @Param channel query int false "Channel ID"
// @Success 200 {object} docs.UserLogStatResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/log/stat [get]
func GetLogsStat(c *gin.Context) {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	username := c.Query("username")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	quotaNum := logsvc.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel)
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": quotaNum,
			//"token": tokenNum,
		},
	})
	return
}

// GetLogsSelfStat godoc
// @Summary Log stats for current user
// @Tags public
// @Security BearerAuth
// @Produce json
// @Param type query int false "Log type"
// @Param start_timestamp query int false "Start timestamp (unix)"
// @Param end_timestamp query int false "End timestamp (unix)"
// @Param token_name query string false "Token name"
// @Param model_name query string false "Model name"
// @Param channel query int false "Channel ID"
// @Success 200 {object} docs.UserLogStatResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/public/log/self/stat [get]
func GetLogsSelfStat(c *gin.Context) {
	username := c.GetString(ctxkey.Username)
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	quotaNum := logsvc.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel)
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, tokenName)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": quotaNum,
			//"token": tokenNum,
		},
	})
	return
}

// DeleteHistoryLogs godoc
// @Summary Delete history logs (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Param target_timestamp query int true "Target timestamp (unix)"
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/log [delete]
func DeleteHistoryLogs(c *gin.Context) {
	targetTimestamp, _ := strconv.ParseInt(c.Query("target_timestamp"), 10, 64)
	if targetTimestamp == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "target timestamp is required",
		})
		return
	}
	count, err := logsvc.DeleteOld(targetTimestamp)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
	return
}

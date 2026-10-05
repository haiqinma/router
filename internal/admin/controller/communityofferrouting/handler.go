package communityofferrouting

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/internal/admin/model"
	"gorm.io/gorm"
)

type modelRouteInput struct {
	Model   string `json:"model"`
	OfferID string `json:"offer_id"`
}

func ListModelRoutes(c *gin.Context) {
	rows, err := model.ListCommunityOfferModelRoutes(c.GetString(ctxkey.Id))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": rows})
}

func UpsertModelRoute(c *gin.Context) {
	input := modelRouteInput{}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请求格式无效"})
		return
	}
	if err := model.UpsertCommunityOfferModelRoute(c.GetString(ctxkey.Id), input.Model, input.OfferID); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

func DeleteModelRoute(c *gin.Context) {
	if err := model.DeleteCommunityOfferModelRoute(c.GetString(ctxkey.Id), c.Param("model")); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

func respondError(c *gin.Context, err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "社区报价路由不存在或当前不可用", "code": "community_offer_route_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": false, "message": strings.TrimSpace(err.Error())})
}

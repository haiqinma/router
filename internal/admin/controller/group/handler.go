package group

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/internal/admin/model"
	groupsvc "github.com/yeying-community/router/internal/admin/service/group"
)

type upsertGroupRequest struct {
	Name         string   `json:"name"`
	DisplayName  string   `json:"display_name"`
	Description  string   `json:"description"`
	BillingRatio *float64 `json:"billing_ratio"`
	Enabled      *bool    `json:"enabled"`
	SortOrder    int      `json:"sort_order"`
}

type updateGroupChannelsRequest struct {
	ChannelIDs []string `json:"channel_ids"`
}

// GetGroupCatalog godoc
// @Summary List groups catalog (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/group/catalog [get]
func GetGroupCatalog(c *gin.Context) {
	rows, err := groupsvc.ListCatalog()
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
		"data":    rows,
	})
}

// CreateGroup godoc
// @Summary Create group (admin)
// @Tags admin
// @Security BearerAuth
// @Accept json
// @Produce json
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/group [post]
func CreateGroup(c *gin.Context) {
	req := upsertGroupRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	billingRatio, err := resolveCreateBillingRatio(req.BillingRatio)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	row, err := groupsvc.Create(model.GroupCatalog{
		Name:         strings.TrimSpace(req.Name),
		DisplayName:  strings.TrimSpace(req.DisplayName),
		Description:  strings.TrimSpace(req.Description),
		Source:       "manual",
		BillingRatio: billingRatio,
	})
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
		"data":    row,
	})
}

// UpdateGroup godoc
// @Summary Update group (admin)
// @Tags admin
// @Security BearerAuth
// @Accept json
// @Produce json
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/group [put]
func UpdateGroup(c *gin.Context) {
	req := upsertGroupRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	current, findErr := groupsvc.Get(strings.TrimSpace(req.Name))
	if findErr != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": findErr.Error(),
		})
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	} else {
		enabled = current.Enabled
	}
	billingRatio, err := resolveUpdateBillingRatio(req.BillingRatio, current.BillingRatio)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	row, err := groupsvc.Update(model.GroupCatalog{
		Name:         strings.TrimSpace(req.Name),
		DisplayName:  strings.TrimSpace(req.DisplayName),
		Description:  strings.TrimSpace(req.Description),
		BillingRatio: billingRatio,
		Enabled:      enabled,
		SortOrder:    req.SortOrder,
	})
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
		"data":    row,
	})
}

// DeleteGroup godoc
// @Summary Delete group (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Param name path string true "Group name"
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/group/{name} [delete]
func DeleteGroup(c *gin.Context) {
	name := strings.TrimSpace(c.Param("name"))
	if name == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "分组名称不能为空",
		})
		return
	}
	if err := groupsvc.Delete(name); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func resolveCreateBillingRatio(value *float64) (float64, error) {
	if value == nil {
		return 1, nil
	}
	if *value < 0 {
		return 0, errors.New("分组倍率不能小于 0")
	}
	return *value, nil
}

func resolveUpdateBillingRatio(value *float64, fallback float64) (float64, error) {
	if value == nil {
		return fallback, nil
	}
	if *value < 0 {
		return 0, errors.New("分组倍率不能小于 0")
	}
	return *value, nil
}

// GetGroupChannels godoc
// @Summary List group channel bindings (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Param name path string true "Group name"
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/group/{name}/channels [get]
func GetGroupChannels(c *gin.Context) {
	name := strings.TrimSpace(c.Param("name"))
	if name == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "分组名称不能为空",
		})
		return
	}
	rows, err := groupsvc.ListChannelBindings(name)
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
		"data":    rows,
	})
}

// UpdateGroupChannels godoc
// @Summary Update group channel bindings (admin)
// @Tags admin
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param name path string true "Group name"
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/group/{name}/channels [put]
func UpdateGroupChannels(c *gin.Context) {
	name := strings.TrimSpace(c.Param("name"))
	if name == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "分组名称不能为空",
		})
		return
	}

	req := updateGroupChannelsRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if err := groupsvc.ReplaceChannelBindings(name, req.ChannelIDs); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

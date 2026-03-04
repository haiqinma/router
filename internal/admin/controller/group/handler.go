package group

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/internal/admin/model"
	groupsvc "github.com/yeying-community/router/internal/admin/service/group"
)

type upsertGroupRequest struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Description string `json:"description"`
	Enabled     *bool  `json:"enabled"`
	SortOrder   int    `json:"sort_order"`
}

// GetGroups godoc
// @Summary List groups (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Success 200 {object} docs.StandardResponse
// @Failure 401 {object} docs.ErrorResponse
// @Router /api/v1/admin/group [get]
func GetGroups(c *gin.Context) {
	groupNames := groupsvc.List()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
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
	row, err := groupsvc.Create(model.GroupCatalog{
		Name:        strings.TrimSpace(req.Name),
		DisplayName: strings.TrimSpace(req.DisplayName),
		Description: strings.TrimSpace(req.Description),
		Source:      "manual",
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
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	} else {
		current, findErr := groupsvc.Get(strings.TrimSpace(req.Name))
		if findErr != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": findErr.Error(),
			})
			return
		}
		enabled = current.Enabled
	}
	row, err := groupsvc.Update(model.GroupCatalog{
		Name:        strings.TrimSpace(req.Name),
		DisplayName: strings.TrimSpace(req.DisplayName),
		Description: strings.TrimSpace(req.Description),
		Enabled:     enabled,
		SortOrder:   req.SortOrder,
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

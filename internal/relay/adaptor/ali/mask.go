package ali

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/color"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
)

const (
	// WanxImageEditFunctionDescriptionEdit 指令编辑：整图按文字指令修改，不需要遮罩。
	WanxImageEditFunctionDescriptionEdit = "description_edit"
	// WanxImageEditFunctionDescriptionEditWithMask 局部重绘：只修改遮罩标出的区域。
	WanxImageEditFunctionDescriptionEditWithMask = "description_edit_with_mask"
)

// readMultipartImageConfig 只解码图片头，拿到原图尺寸（万相要求遮罩与原图同分辨率）。
func readMultipartImageConfig(fileHeader *multipart.FileHeader) (image.Config, error) {
	if fileHeader == nil {
		return image.Config{}, errors.New("image file is required")
	}
	file, err := fileHeader.Open()
	if err != nil {
		return image.Config{}, err
	}
	defer file.Close()
	config, _, err := image.DecodeConfig(file)
	if err != nil {
		return image.Config{}, err
	}
	if config.Width <= 0 || config.Height <= 0 {
		return image.Config{}, errors.New("invalid base image dimensions")
	}
	return config, nil
}

// readMultipartWanxMaskDataURI 读取客户端上传的遮罩并转换为万相格式的 data URI。
func readMultipartWanxMaskDataURI(fileHeader *multipart.FileHeader, baseWidth, baseHeight int) (string, error) {
	if fileHeader == nil {
		return "", errors.New("mask file is required")
	}
	file, err := fileHeader.Open()
	if err != nil {
		return "", err
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}
	converted, err := convertOpenAIMaskToWanx(data, baseWidth, baseHeight)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("data:image/png;base64,%s", base64.StdEncoding.EncodeToString(converted)), nil
}

// convertOpenAIMaskToWanx 把 OpenAI 规范的遮罩转换成万相要求的黑白遮罩，并缩放到原图尺寸。
//
//   - OpenAI：透明像素 = 需要重绘，不透明 = 保留
//   - 万相：  白色 = 编辑区，黑色 = 保留区
//
// 若遮罩本身完全不透明（例如用户直接上传了一张黑白遮罩图），则退化为按亮度判定：
// 亮色视为编辑区，暗色视为保留区。
func convertOpenAIMaskToWanx(maskData []byte, baseWidth, baseHeight int) ([]byte, error) {
	if baseWidth <= 0 || baseHeight <= 0 {
		return nil, errors.New("invalid base image dimensions")
	}
	src, _, err := image.Decode(bytes.NewReader(maskData))
	if err != nil {
		return nil, err
	}
	bounds := src.Bounds()
	srcWidth, srcHeight := bounds.Dx(), bounds.Dy()
	if srcWidth <= 0 || srcHeight <= 0 {
		return nil, errors.New("invalid mask image dimensions")
	}

	hasTransparency := false
	for y := bounds.Min.Y; y < bounds.Max.Y && !hasTransparency; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			if _, _, _, a := src.At(x, y).RGBA(); a < 0x8000 {
				hasTransparency = true
				break
			}
		}
	}

	out := image.NewGray(image.Rect(0, 0, baseWidth, baseHeight))
	white := color.Gray{Y: 255}
	black := color.Gray{Y: 0}
	for y := 0; y < baseHeight; y++ {
		// 最近邻缩放到原图尺寸
		sy := bounds.Min.Y + y*srcHeight/baseHeight
		for x := 0; x < baseWidth; x++ {
			sx := bounds.Min.X + x*srcWidth/baseWidth
			r, g, b, a := src.At(sx, sy).RGBA()
			var edit bool
			if hasTransparency {
				edit = a < 0x8000
			} else {
				// 已是黑白遮罩：亮度 > 50% 视为编辑区
				luma := (299*r + 587*g + 114*b) / 1000
				edit = luma >= 0x8000
			}
			if edit {
				out.SetGray(x, y, white)
			} else {
				out.SetGray(x, y, black)
			}
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, out); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

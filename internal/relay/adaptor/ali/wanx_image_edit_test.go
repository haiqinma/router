package ali

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"strings"
	"testing"

	"github.com/yeying-community/router/internal/relay/meta"
	relaymodel "github.com/yeying-community/router/internal/relay/model"
	"github.com/yeying-community/router/internal/relay/relaymode"
)

func TestIsWanxImageEditModel(t *testing.T) {
	for name, want := range map[string]bool{
		"wanx2.1-imageedit": true,
		"WANX2.1-ImageEdit": true,
		"wanx-v1":           false,
		"qwen-image-edit":   false,
		"":                  false,
	} {
		if got := IsWanxImageEditModel(name); got != want {
			t.Fatalf("IsWanxImageEditModel(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestGetRequestURL_WanxImageEditUsesImage2ImagePath(t *testing.T) {
	adaptor := &Adaptor{}
	got, err := adaptor.GetRequestURL(&meta.Meta{
		Mode:            relaymode.ImagesEdits,
		BaseURL:         "https://dashscope.aliyuncs.com",
		ActualModelName: "wanx2.1-imageedit",
		RequestURLPath:  "/v1/images/edits",
	})
	if err != nil {
		t.Fatalf("GetRequestURL() error = %v", err)
	}
	want := "https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis"
	if got != want {
		t.Fatalf("GetRequestURL() = %q, want %q", got, want)
	}
}

func encodeTestPNG(t *testing.T, img image.Image) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	return buf.Bytes()
}

func buildTestImageForm(t *testing.T, files map[string][]byte) *multipart.Form {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	for field, data := range files {
		part, err := writer.CreateFormFile(field, field+".png")
		if err != nil {
			t.Fatalf("CreateFormFile(%s) error = %v", field, err)
		}
		if _, err := part.Write(data); err != nil {
			t.Fatalf("write %s error = %v", field, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close() error = %v", err)
	}
	form, err := multipart.NewReader(&buf, writer.Boundary()).ReadForm(32 << 20)
	if err != nil {
		t.Fatalf("ReadForm() error = %v", err)
	}
	return form
}

func decodeGray(t *testing.T, data []byte) *image.Gray {
	t.Helper()
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("png.Decode() error = %v", err)
	}
	gray, ok := img.(*image.Gray)
	if !ok {
		t.Fatalf("decoded mask = %T, want *image.Gray", img)
	}
	return gray
}

// OpenAI 规范：透明=重绘 → 万相：白=编辑区；同时验证最近邻缩放到原图尺寸。
func TestConvertOpenAIMaskToWanx_TransparentBecomesWhiteAndScales(t *testing.T) {
	mask := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	mask.Set(0, 0, color.NRGBA{R: 255, G: 255, B: 255, A: 255}) // 保留
	mask.Set(1, 0, color.NRGBA{A: 0})                           // 重绘
	mask.Set(0, 1, color.NRGBA{A: 0})                           // 重绘
	mask.Set(1, 1, color.NRGBA{R: 255, G: 255, B: 255, A: 255}) // 保留

	out, err := convertOpenAIMaskToWanx(encodeTestPNG(t, mask), 4, 4)
	if err != nil {
		t.Fatalf("convertOpenAIMaskToWanx() error = %v", err)
	}
	gray := decodeGray(t, out)
	if gray.Bounds().Dx() != 4 || gray.Bounds().Dy() != 4 {
		t.Fatalf("mask size = %v, want 4x4", gray.Bounds())
	}
	cases := []struct {
		x, y int
		want uint8
	}{
		{0, 0, 0}, {1, 1, 0}, // 源 (0,0) 不透明 → 黑
		{2, 0, 255}, {3, 1, 255}, // 源 (1,0) 透明 → 白
		{0, 2, 255}, {1, 3, 255}, // 源 (0,1) 透明 → 白
		{2, 2, 0}, {3, 3, 0}, // 源 (1,1) 不透明 → 黑
	}
	for _, tc := range cases {
		if got := gray.GrayAt(tc.x, tc.y).Y; got != tc.want {
			t.Fatalf("pixel(%d,%d) = %d, want %d", tc.x, tc.y, got, tc.want)
		}
	}
}

// 完全不透明的黑白遮罩：按亮度判定，白=编辑区、黑=保留区。
func TestConvertOpenAIMaskToWanx_OpaqueBlackWhiteUsesLuminance(t *testing.T) {
	mask := image.NewRGBA(image.Rect(0, 0, 2, 1))
	mask.Set(0, 0, color.RGBA{R: 255, G: 255, B: 255, A: 255})
	mask.Set(1, 0, color.RGBA{A: 255})

	out, err := convertOpenAIMaskToWanx(encodeTestPNG(t, mask), 2, 1)
	if err != nil {
		t.Fatalf("convertOpenAIMaskToWanx() error = %v", err)
	}
	gray := decodeGray(t, out)
	if gray.GrayAt(0, 0).Y != 255 || gray.GrayAt(1, 0).Y != 0 {
		t.Fatalf("pixels = (%d,%d), want (255,0)", gray.GrayAt(0, 0).Y, gray.GrayAt(1, 0).Y)
	}
}

func TestConvertWanxImageEditRequest_WithMaskUsesDescriptionEditWithMask(t *testing.T) {
	base := image.NewRGBA(image.Rect(0, 0, 2, 2))
	for y := 0; y < 2; y++ {
		for x := 0; x < 2; x++ {
			base.Set(x, y, color.RGBA{B: 255, A: 255})
		}
	}
	mask := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	mask.Set(0, 0, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
	mask.Set(1, 1, color.NRGBA{A: 0})

	form := buildTestImageForm(t, map[string][]byte{
		"image": encodeTestPNG(t, base),
		"mask":  encodeTestPNG(t, mask),
	})
	got, err := ConvertWanxImageEditRequest(relaymodel.ImageRequest{
		Model:  "wanx2.1-imageedit",
		Prompt: "put a rubber duck here",
		N:      2,
	}, form)
	if err != nil {
		t.Fatalf("ConvertWanxImageEditRequest() error = %v", err)
	}
	if got.Model != "wanx2.1-imageedit" {
		t.Fatalf("model = %q", got.Model)
	}
	if got.Input.Function != WanxImageEditFunctionDescriptionEditWithMask {
		t.Fatalf("function = %q, want %q", got.Input.Function, WanxImageEditFunctionDescriptionEditWithMask)
	}
	if got.Input.Prompt != "put a rubber duck here" {
		t.Fatalf("prompt = %q", got.Input.Prompt)
	}
	if !strings.HasPrefix(got.Input.BaseImageURL, "data:image/png;base64,") {
		t.Fatalf("base_image_url prefix = %q", got.Input.BaseImageURL[:min(len(got.Input.BaseImageURL), 40)])
	}
	if !strings.HasPrefix(got.Input.MaskImageURL, "data:image/png;base64,") {
		t.Fatalf("mask_image_url prefix = %q", got.Input.MaskImageURL[:min(len(got.Input.MaskImageURL), 40)])
	}
	if got.Parameters.N != 2 {
		t.Fatalf("n = %d, want 2", got.Parameters.N)
	}
}

func TestConvertWanxImageEditRequest_WithoutMaskUsesDescriptionEdit(t *testing.T) {
	base := image.NewRGBA(image.Rect(0, 0, 1, 1))
	base.Set(0, 0, color.RGBA{R: 255, A: 255})
	form := buildTestImageForm(t, map[string][]byte{"image": encodeTestPNG(t, base)})

	got, err := ConvertWanxImageEditRequest(relaymodel.ImageRequest{Model: "wanx2.1-imageedit", Prompt: "make it blue"}, form)
	if err != nil {
		t.Fatalf("ConvertWanxImageEditRequest() error = %v", err)
	}
	if got.Input.Function != WanxImageEditFunctionDescriptionEdit {
		t.Fatalf("function = %q, want %q", got.Input.Function, WanxImageEditFunctionDescriptionEdit)
	}
	if got.Input.MaskImageURL != "" {
		t.Fatalf("mask_image_url = %q, want empty", got.Input.MaskImageURL)
	}
	if got.Parameters.N != 0 {
		t.Fatalf("n = %d, want 0 (omitted)", got.Parameters.N)
	}
}

func TestConvertWanxImageEditRequest_RequiresImage(t *testing.T) {
	if _, err := ConvertWanxImageEditRequest(relaymodel.ImageRequest{Model: "wanx2.1-imageedit"}, nil); err == nil {
		t.Fatalf("expected error for nil form")
	}
	form := buildTestImageForm(t, map[string][]byte{})
	if _, err := ConvertWanxImageEditRequest(relaymodel.ImageRequest{Model: "wanx2.1-imageedit"}, form); err == nil {
		t.Fatalf("expected error when image is missing")
	}
}

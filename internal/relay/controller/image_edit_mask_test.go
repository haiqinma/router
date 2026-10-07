package controller

import (
	"mime/multipart"
	"testing"
)

func TestRejectUnsupportedImageEditMask(t *testing.T) {
	if err := rejectUnsupportedImageEditMask(nil); err != nil {
		t.Fatalf("nil form should pass, got %v", err)
	}
	form := &multipart.Form{File: map[string][]*multipart.FileHeader{
		"image": {{Filename: "base.png"}},
	}}
	if err := rejectUnsupportedImageEditMask(form); err != nil {
		t.Fatalf("form without mask should pass, got %v", err)
	}
	form.File["mask"] = []*multipart.FileHeader{{Filename: "mask.png"}}
	if err := rejectUnsupportedImageEditMask(form); err == nil {
		t.Fatalf("form with mask should be rejected for instruction-only models")
	}
}

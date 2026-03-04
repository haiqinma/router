package model

import (
	"testing"
)

func TestNormalizeLegacyGroupRatioJSON(t *testing.T) {
	normalized, changed, err := normalizeLegacyGroupRatioJSON(`{"default":1,"vip":1,"svip":1}`)
	if err != nil {
		t.Fatalf("normalize legacy group ratio failed: %v", err)
	}
	if !changed {
		t.Fatalf("expected legacy group ratio to be changed")
	}
	if normalized != `{"default":1}` {
		t.Fatalf("expected normalized legacy group ratio, got: %s", normalized)
	}
}

func TestNormalizeLegacyGroupRatioJSONKeepsCustom(t *testing.T) {
	normalized, changed, err := normalizeLegacyGroupRatioJSON(`{"default":1,"team":1.2}`)
	if err != nil {
		t.Fatalf("normalize custom group ratio failed: %v", err)
	}
	if changed {
		t.Fatalf("expected custom group ratio to be unchanged")
	}
	if normalized != `{"default":1,"team":1.2}` {
		t.Fatalf("unexpected custom group ratio after normalize: %s", normalized)
	}
}

func TestIsLegacyDefaultGroupRatio(t *testing.T) {
	if !isLegacyDefaultGroupRatio(map[string]float64{"default": 1, "vip": 1, "svip": 1}) {
		t.Fatalf("expected legacy default ratio to be recognized")
	}
	if isLegacyDefaultGroupRatio(map[string]float64{"default": 1}) {
		t.Fatalf("single default group ratio must not be considered legacy default")
	}
}

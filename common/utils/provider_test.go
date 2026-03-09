package utils

import "testing"

func TestResolveProvider(t *testing.T) {
	tests := []struct {
		name  string
		model string
		want  string
	}{
		{
			name:  "qwen3 prefix",
			model: "qwen3-vl-8b-instruct",
			want:  "qwen",
		},
		{
			name:  "llama prefix",
			model: "llama-3.1-8b-instruct",
			want:  "meta-llama",
		},
		{
			name:  "flux prefix",
			model: "flux-1.1-pro",
			want:  "black-forest-labs",
		},
		{
			name:  "black forest labs prefixed model",
			model: "black-forest-labs/flux-1.1-pro",
			want:  "black-forest-labs",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ResolveProvider(tt.model); got != tt.want {
				t.Fatalf("ResolveProvider(%q)=%q, want %q", tt.model, got, tt.want)
			}
		})
	}
}

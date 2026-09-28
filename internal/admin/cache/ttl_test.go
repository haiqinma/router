package cache

import (
	"testing"
	"time"
)

func TestTTLCacheHitAndExpiry(t *testing.T) {
	c := NewTTL(8)
	c.Set("k", 42, 50*time.Millisecond)
	if v, ok := c.Get("k"); !ok || v.(int) != 42 {
		t.Fatalf("expected hit 42, got v=%v ok=%v", v, ok)
	}
	time.Sleep(70 * time.Millisecond)
	if _, ok := c.Get("k"); ok {
		t.Fatalf("expected entry to be expired")
	}
}

func TestTTLCacheZeroTTLDoesNotStore(t *testing.T) {
	c := NewTTL(8)
	c.Set("k", 1, 0)
	if _, ok := c.Get("k"); ok {
		t.Fatalf("ttl<=0 must be a no-op")
	}
}

func TestTTLCacheEvictsWhenFull(t *testing.T) {
	c := NewTTL(2)
	c.Set("a", 1, time.Minute)
	c.Set("b", 2, time.Minute)
	// Third insert exceeds maxSize of live entries -> cache is cleared, then b3 stored.
	c.Set("c", 3, time.Minute)
	if v, ok := c.Get("c"); !ok || v.(int) != 3 {
		t.Fatalf("newest entry must survive, got v=%v ok=%v", v, ok)
	}
}

func TestTTLCacheInvalidate(t *testing.T) {
	c := NewTTL(8)
	c.Set("k", 1, time.Minute)
	c.Invalidate("k")
	if _, ok := c.Get("k"); ok {
		t.Fatalf("invalidated key must be gone")
	}
}

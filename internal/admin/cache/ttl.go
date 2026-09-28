// Package cache provides a tiny concurrency-safe in-process TTL cache used to
// shield expensive, read-mostly admin analytics endpoints (dashboards, billing
// reports) from recomputing heavy aggregations on every page load.
package cache

import (
	"sync"
	"time"
)

type entry struct {
	value     any
	expiresAt time.Time
}

// TTLCache is a minimal string-keyed cache with per-entry expiry. It is meant
// for small keyspaces (a handful of dashboard/report parameter combinations);
// it purges expired entries opportunistically and hard-caps total size.
type TTLCache struct {
	mu      sync.RWMutex
	items   map[string]entry
	maxSize int
}

// NewTTL creates a cache holding at most maxSize live entries. maxSize <= 0
// falls back to a sane default.
func NewTTL(maxSize int) *TTLCache {
	if maxSize <= 0 {
		maxSize = 256
	}
	return &TTLCache{items: make(map[string]entry), maxSize: maxSize}
}

// Get returns the cached value when present and not expired.
func (c *TTLCache) Get(key string) (any, bool) {
	c.mu.RLock()
	e, ok := c.items[key]
	c.mu.RUnlock()
	if !ok || time.Now().After(e.expiresAt) {
		return nil, false
	}
	return e.value, true
}

// Set stores value under key for the given ttl. ttl <= 0 is a no-op (caching
// disabled by the caller).
func (c *TTLCache) Set(key string, value any, ttl time.Duration) {
	if ttl <= 0 {
		return
	}
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.items) >= c.maxSize {
		for k, v := range c.items {
			if now.After(v.expiresAt) {
				delete(c.items, k)
			}
		}
		// Still full of live entries: drop everything rather than grow unbounded.
		if len(c.items) >= c.maxSize {
			c.items = make(map[string]entry)
		}
	}
	c.items[key] = entry{value: value, expiresAt: now.Add(ttl)}
}

// Invalidate removes a single key (best-effort; safe if absent).
func (c *TTLCache) Invalidate(key string) {
	c.mu.Lock()
	delete(c.items, key)
	c.mu.Unlock()
}

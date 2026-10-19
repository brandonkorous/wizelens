package wizelens

import (
	"container/list"
	"strconv"
	"sync"
	"time"
)

const (
	maxDecided = 20_000
	maxPending = 2000
	holdFor    = 60 * time.Second
)

// KeepByRate reports whether the trace falls inside the rate. It reads the last 8 hex digits, so every service keeps the same traces.
func KeepByRate(traceID string, rate float64) bool {
	if rate >= 1 {
		return true
	}
	if !(rate > 0) || len(traceID) < 8 {
		return false
	}
	n, err := strconv.ParseUint(traceID[len(traceID)-8:], 16, 32)
	return err == nil && float64(n)/4294967296.0 < rate
}

type pending struct {
	items []func()
	since time.Time
	elem  *list.Element
}

// TraceSampler decides per trace, with the same rules as the Node and .NET add-ons. A trace outside the rate waits until
// its local root span ends, then stays only when it had an error or a slow span. An error after a drop keeps the rest.
type TraceSampler struct {
	rate     float64
	now      func() time.Time
	mu       sync.Mutex
	decided  map[string]bool
	order    *list.List
	pending  map[string]*pending
	waitList *list.List
}

// NewTraceSampler keeps this share (0 to 1) of traces, plus the important ones.
func NewTraceSampler(rate float64) *TraceSampler {
	return &TraceSampler{rate: rate, now: time.Now, decided: map[string]bool{}, order: list.New(), pending: map[string]*pending{}, waitList: list.New()}
}

// Offer takes one span (root: it starts this process's part of the trace) or log line. forward sends it on.
func (s *TraceSampler) Offer(traceID string, important, root bool, forward func()) {
	s.mu.Lock()
	run := s.offer(traceID, important, root, forward)
	s.mu.Unlock()
	for _, f := range run {
		f()
	}
}

func (s *TraceSampler) offer(traceID string, important, root bool, forward func()) []func() {
	s.expire()
	if keep, ok := s.decided[traceID]; ok {
		if keep {
			return []func(){forward}
		}
		if !important {
			return nil
		}
		s.decide(traceID, true)
		return []func(){forward}
	}
	if KeepByRate(traceID, s.rate) {
		s.decide(traceID, true)
		return []func(){forward}
	}
	p := s.hold(traceID)
	if important {
		s.release(traceID, p)
		s.decide(traceID, true)
		return append(p.items, forward)
	}
	if !root {
		p.items = append(p.items, forward)
		return nil
	}
	s.release(traceID, p)
	s.decide(traceID, false)
	return nil
}

func (s *TraceSampler) hold(traceID string) *pending {
	if p, ok := s.pending[traceID]; ok {
		return p
	}
	p := &pending{since: s.now()}
	p.elem = s.waitList.PushBack(traceID)
	s.pending[traceID] = p
	if len(s.pending) > maxPending {
		oldest := s.waitList.Front().Value.(string)
		s.release(oldest, s.pending[oldest])
		s.decide(oldest, false)
	}
	return p
}

func (s *TraceSampler) release(traceID string, p *pending) {
	s.waitList.Remove(p.elem)
	delete(s.pending, traceID)
}

func (s *TraceSampler) decide(traceID string, keep bool) {
	if _, ok := s.decided[traceID]; !ok {
		s.order.PushBack(traceID)
	}
	s.decided[traceID] = keep
	if len(s.decided) > maxDecided {
		front := s.order.Front()
		s.order.Remove(front)
		delete(s.decided, front.Value.(string))
	}
}

// A trace whose root never ended (a lost request, a job with no root) is dropped after a while.
func (s *TraceSampler) expire() {
	cutoff := s.now().Add(-holdFor)
	for e := s.waitList.Front(); e != nil; e = s.waitList.Front() {
		id := e.Value.(string)
		p := s.pending[id]
		if !p.since.Before(cutoff) {
			return
		}
		s.release(id, p)
		s.decide(id, false)
	}
}

// Pending is the number of traces waiting for their root span.
func (s *TraceSampler) Pending() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.pending)
}

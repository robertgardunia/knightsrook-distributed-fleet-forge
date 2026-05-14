import { describe, it, expect, vi } from 'vitest';
import { CodeCaptureService } from './catcher.js';

describe('CodeCaptureService', () => {
  // ── capture ──────────────────────────────────────────────────────────────────

  describe('capture', () => {
    it('sets current code and emits user:identified', () => {
      const svc = new CodeCaptureService();
      const spy = vi.fn();
      svc.on('user:identified', spy);
      svc.capture('abc123');
      expect(svc.current()).toBe('abc123');
      expect(spy).toHaveBeenCalledWith('abc123');
    });

    it('trims whitespace before storing', () => {
      const svc = new CodeCaptureService();
      svc.capture('  abc123  ');
      expect(svc.current()).toBe('abc123');
    });

    it('trims whitespace in emitted value', () => {
      const svc = new CodeCaptureService();
      const spy = vi.fn();
      svc.on('user:identified', spy);
      svc.capture('  xyz  ');
      expect(spy).toHaveBeenCalledWith('xyz');
    });

    it('ignores empty string', () => {
      const svc = new CodeCaptureService();
      const spy = vi.fn();
      svc.on('user:identified', spy);
      svc.capture('');
      expect(svc.current()).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });

    it('ignores whitespace-only string', () => {
      const svc = new CodeCaptureService();
      const spy = vi.fn();
      svc.on('user:identified', spy);
      svc.capture('   ');
      expect(svc.current()).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });

    it('replaces existing code on second capture', () => {
      const svc = new CodeCaptureService();
      svc.capture('first');
      svc.capture('second');
      expect(svc.current()).toBe('second');
    });
  });

  // ── clear ────────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('clears current code and emits user:cleared', () => {
      const svc = new CodeCaptureService();
      const spy = vi.fn();
      svc.on('user:cleared', spy);
      svc.capture('abc123');
      svc.clear();
      expect(svc.current()).toBeNull();
      expect(spy).toHaveBeenCalledOnce();
    });

    it('is a no-op when no code is active', () => {
      const svc = new CodeCaptureService();
      const spy = vi.fn();
      svc.on('user:cleared', spy);
      svc.clear();
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not emit user:cleared twice on double-clear', () => {
      const svc = new CodeCaptureService();
      const spy = vi.fn();
      svc.on('user:cleared', spy);
      svc.capture('abc');
      svc.clear();
      svc.clear();
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  // ── current ──────────────────────────────────────────────────────────────────

  describe('current', () => {
    it('returns null initially', () => {
      const svc = new CodeCaptureService();
      expect(svc.current()).toBeNull();
    });

    it('returns code after capture', () => {
      const svc = new CodeCaptureService();
      svc.capture('testcode');
      expect(svc.current()).toBe('testcode');
    });

    it('returns null after clear', () => {
      const svc = new CodeCaptureService();
      svc.capture('testcode');
      svc.clear();
      expect(svc.current()).toBeNull();
    });
  });
});

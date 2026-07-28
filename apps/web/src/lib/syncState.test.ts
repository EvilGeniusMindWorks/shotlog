import { describe, expect, it } from 'vitest';
import { deriveSyncState, type SyncStateInput } from './syncState';

const base: SyncStateInput = {
  online: true,
  connected: true,
  connecting: false,
  uploading: false,
  downloading: false,
  queued: 0,
  expired: false,
};

describe('deriveSyncState', () => {
  it('no internet wins over everything', () => {
    const s = deriveSyncState({ ...base, online: false, expired: true, queued: 5 });
    expect(s.kind).toBe('offline');
    expect(s.label).toContain('saved on this device');
  });

  it('expired session pauses syncing even while connected', () => {
    const s = deriveSyncState({ ...base, expired: true });
    expect(s.kind).toBe('expired');
    expect(s.short).toBe('Sign in');
  });

  it('connected + queue empty = synced', () => {
    expect(deriveSyncState(base).kind).toBe('synced');
  });

  it('connected + queued shows the count', () => {
    const s = deriveSyncState({ ...base, queued: 3 });
    expect(s.kind).toBe('syncing');
    expect(s.label).toBe('Syncing — 3 waiting');
    expect(s.short).toBe('3 waiting');
  });

  it('connected + downloading (queue empty) is syncing', () => {
    expect(deriveSyncState({ ...base, downloading: true }).kind).toBe('syncing');
  });

  it('online but stream down while actively connecting', () => {
    const s = deriveSyncState({ ...base, connected: false, connecting: true });
    expect(s.kind).toBe('connecting');
  });

  it("online but stream down = can't reach server (the honest flap state)", () => {
    const s = deriveSyncState({ ...base, connected: false });
    expect(s.kind).toBe('unreachable');
    expect(s.label).toContain("Can't reach server");
  });

  it('unreachable with queued writes reassures they are saved locally', () => {
    const s = deriveSyncState({ ...base, connected: false, queued: 2 });
    expect(s.label).toBe("Can't reach server — 2 saved on this device");
  });
});

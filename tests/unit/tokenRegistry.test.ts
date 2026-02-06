import { TokenRegistry } from '../../src/services/tokenRegistry';

describe('TokenRegistry', () => {
  let registry: TokenRegistry;

  beforeEach(() => {
    registry = new TokenRegistry();
  });

  it('loads static seed tokens on construction', () => {
    expect(registry.size).toBeGreaterThan(10);
  });

  it('resolves SOL by ticker', () => {
    const sol = registry.resolveByTicker('SOL');
    expect(sol).not.toBeNull();
    expect(sol!.mint).toBe('So11111111111111111111111111111111111111112');
    expect(sol!.decimals).toBe(9);
  });

  it('resolves USDC by ticker', () => {
    const usdc = registry.resolveByTicker('USDC');
    expect(usdc).not.toBeNull();
    expect(usdc!.mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });

  it('is case-insensitive for ticker lookups', () => {
    expect(registry.resolveByTicker('sol')).not.toBeNull();
    expect(registry.resolveByTicker('Sol')).not.toBeNull();
    expect(registry.resolveByTicker('SOL')).not.toBeNull();
  });

  it('returns null for unknown tickers', () => {
    expect(registry.resolveByTicker('FAKECOIN')).toBeNull();
  });

  it('reports ambiguous tickers correctly', () => {
    // Static seed should not have ambiguous tickers
    expect(registry.isAmbiguous('SOL')).toBe(false);
    expect(registry.isAmbiguous('USDC')).toBe(false);
  });

  it('needsRefresh returns true initially', () => {
    expect(registry.needsRefresh()).toBe(true);
  });

  describe('refresh (with mocked fetch)', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('adds tokens from Jupiter API', async () => {
      const jupiterTokens = [
        { symbol: 'NEWTOKEN', address: 'newmint123', decimals: 6, name: 'New Token' },
        { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9, name: 'Solana' },
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(jupiterTokens),
      });

      const sizeBefore = registry.size;
      await registry.refresh();

      expect(registry.resolveByTicker('NEWTOKEN')).not.toBeNull();
      expect(registry.resolveByTicker('NEWTOKEN')!.mint).toBe('newmint123');
      // SOL should not be duplicated
      expect(registry.size).toBe(sizeBefore + 1);
    });

    it('survives Jupiter API failure gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      const sizeBefore = registry.size;
      await registry.refresh();
      // Static seed still intact
      expect(registry.size).toBe(sizeBefore);
      expect(registry.resolveByTicker('SOL')).not.toBeNull();
    });

    it('survives network error gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await registry.refresh(); // Should not throw
      expect(registry.resolveByTicker('SOL')).not.toBeNull();
    });

    it('deduplicates concurrent refresh calls', async () => {
      let resolvePromise: () => void;
      const slow = new Promise<void>((r) => { resolvePromise = r; });

      global.fetch = jest.fn().mockImplementation(async () => {
        await slow;
        return { ok: true, json: () => Promise.resolve([]) };
      });

      const p1 = registry.refresh();
      const p2 = registry.refresh();

      resolvePromise!();
      await Promise.all([p1, p2]);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('marks needsRefresh as false after successful refresh', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await registry.refresh();
      expect(registry.needsRefresh()).toBe(false);
    });
  });
});

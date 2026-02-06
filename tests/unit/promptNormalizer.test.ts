import { normalizePrompt, normalizeConstraints } from '../../src/utils/promptNormalizer';

describe('normalizePrompt', () => {
  it('lowercases the prompt', () => {
    expect(normalizePrompt('Swap SOL to USDC')).toBe('swap sol to usdc');
  });

  it('collapses multiple spaces', () => {
    expect(normalizePrompt('swap   2   SOL')).toBe('swap 2 sol');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizePrompt('  swap sol  ')).toBe('swap sol');
  });

  it('strips trailing punctuation', () => {
    expect(normalizePrompt('swap sol to usdc.')).toBe('swap sol to usdc');
    expect(normalizePrompt('swap sol to usdc!')).toBe('swap sol to usdc');
    expect(normalizePrompt('swap sol to usdc?')).toBe('swap sol to usdc');
    expect(normalizePrompt('swap sol to usdc...')).toBe('swap sol to usdc');
  });

  it('handles combined normalization', () => {
    expect(normalizePrompt('  Swap  2  SOL to USDC!  ')).toBe('swap 2 sol to usdc');
  });
});

describe('normalizeConstraints', () => {
  it('returns {} for undefined', () => {
    expect(normalizeConstraints(undefined)).toBe('{}');
  });

  it('sorts keys alphabetically', () => {
    const result = normalizeConstraints({
      max_slippage_bps: 100,
      allow_unknown_tokens: false,
      denylist_mints: [],
    });
    const parsed = JSON.parse(result);
    const keys = Object.keys(parsed);
    expect(keys).toEqual(['allow_unknown_tokens', 'denylist_mints', 'max_slippage_bps']);
  });

  it('produces identical output regardless of input key order', () => {
    const a = normalizeConstraints({ max_slippage_bps: 100, max_fee_sol: 0.005 });
    const b = normalizeConstraints({ max_fee_sol: 0.005, max_slippage_bps: 100 });
    expect(a).toBe(b);
  });
});

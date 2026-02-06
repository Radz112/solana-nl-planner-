import { classifyRisk } from '../../src/services/riskClassifier';

describe('riskClassifier', () => {
  it('returns low for known swap with no flags', () => {
    expect(classifyRisk('swap', [], [])).toBe('low');
  });

  it('returns low for transfer with no flags', () => {
    expect(classifyRisk('transfer', [], [])).toBe('low');
  });

  it('returns medium for lend action (complex)', () => {
    expect(classifyRisk('lend', [], [])).toBe('medium');
  });

  it('returns medium for borrow action', () => {
    expect(classifyRisk('borrow', [], [])).toBe('medium');
  });

  it('returns medium for nft_buy action', () => {
    expect(classifyRisk('nft_buy', [], [])).toBe('medium');
  });

  it('returns medium for single safety flag', () => {
    expect(classifyRisk('swap', ['unknown_token:FAKE'], [])).toBe('medium');
  });

  it('returns medium for user confirmations needed', () => {
    expect(classifyRisk('swap', [], ['Please confirm amount'])).toBe('medium');
  });

  it('returns high for multiple safety flags', () => {
    expect(classifyRisk('swap', ['unknown_token:A', 'unknown_token:B'], [])).toBe('high');
  });

  it('returns high for unknown action type', () => {
    expect(classifyRisk('unknown', [], [])).toBe('high');
  });

  it('returns high for invalid destination flag', () => {
    expect(classifyRisk('transfer', ['invalid_destination'], [])).toBe('high');
  });

  it('returns high for denylisted token flag', () => {
    expect(classifyRisk('swap', ['denylisted_token:SOL'], [])).toBe('high');
  });
});

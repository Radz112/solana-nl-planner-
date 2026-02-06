import { validateEntities } from '../../src/services/validator';
import { TokenRegistry } from '../../src/services/tokenRegistry';
import { ExtractedEntities } from '../../src/types';

function makeEntities(overrides: Partial<ExtractedEntities> = {}): ExtractedEntities {
  return {
    action_type: 'swap',
    tokens: [
      { ticker: 'SOL', role: 'source' },
      { ticker: 'USDC', role: 'destination' },
    ],
    amounts: [{ value: 2.0, ticker: 'SOL' }],
    destination: undefined,
    slippage_bps: 100,
    priority_fee_lamports: undefined,
    protocol_preference: 'jupiter',
    raw_confidence: 0.95,
    ...overrides,
  };
}

describe('validator', () => {
  let registry: TokenRegistry;

  beforeEach(() => {
    registry = new TokenRegistry();
  });

  it('resolves known tokens and returns high feasibility', () => {
    const result = validateEntities(makeEntities(), undefined, registry);
    expect(result.feasibility).toBe('high');
    expect(result.safety_flags).toEqual([]);
    expect(result.user_confirmations_needed).toEqual([]);
    expect(result.resolved_tokens['SOL']).toBeDefined();
    expect(result.resolved_tokens['USDC']).toBeDefined();
    expect(result.resolved_tokens['SOL'].mint).toBe('So11111111111111111111111111111111111111112');
  });

  it('flags unknown tokens when allow_unknown_tokens is false', () => {
    const entities = makeEntities({
      tokens: [
        { ticker: 'SOL', role: 'source' },
        { ticker: 'FAKECOIN', role: 'destination' },
      ],
    });

    const result = validateEntities(entities, { allow_unknown_tokens: false }, registry);
    expect(result.safety_flags).toContain('unknown_token:FAKECOIN');
    expect(result.user_confirmations_needed.length).toBeGreaterThan(0);
    expect(result.feasibility).toBe('medium');
  });

  it('allows unknown tokens when allow_unknown_tokens is true', () => {
    const entities = makeEntities({
      tokens: [
        { ticker: 'SOL', role: 'source' },
        { ticker: 'NEWMEME', role: 'destination' },
      ],
    });

    const result = validateEntities(entities, { allow_unknown_tokens: true }, registry);
    expect(result.safety_flags.filter((f) => f.startsWith('unknown_token'))).toEqual([]);
  });

  it('flags missing amounts', () => {
    const entities = makeEntities({ amounts: [] });
    const result = validateEntities(entities, undefined, registry);
    expect(result.feasibility).toBe('low');
    expect(result.user_confirmations_needed).toContainEqual(
      expect.stringContaining('Amount not specified'),
    );
  });

  it('flags denylisted mints', () => {
    const result = validateEntities(
      makeEntities(),
      { denylist_mints: ['So11111111111111111111111111111111111111112'] },
      registry,
    );
    expect(result.safety_flags).toContain('denylisted_token:SOL');
    expect(result.feasibility).toBe('low');
  });

  it('flags missing destination for transfer', () => {
    const entities = makeEntities({
      action_type: 'transfer',
      tokens: [{ ticker: 'USDC', role: 'source' }],
      amounts: [{ value: 100, ticker: 'USDC' }],
      destination: undefined,
    });

    const result = validateEntities(entities, undefined, registry);
    expect(result.user_confirmations_needed).toContainEqual(
      expect.stringContaining('No destination address'),
    );
    expect(result.feasibility).toBe('low');
  });

  it('flags invalid destination address for transfer', () => {
    const entities = makeEntities({
      action_type: 'transfer',
      tokens: [{ ticker: 'USDC', role: 'source' }],
      amounts: [{ value: 100, ticker: 'USDC' }],
      destination: 'not-a-valid-address!!!',
    });

    const result = validateEntities(entities, undefined, registry);
    expect(result.safety_flags).toContain('invalid_destination');
    expect(result.feasibility).toBe('low');
  });

  it('accepts valid base58 destination for transfer', () => {
    const entities = makeEntities({
      action_type: 'transfer',
      tokens: [{ ticker: 'USDC', role: 'source' }],
      amounts: [{ value: 100, ticker: 'USDC' }],
      destination: '7xKXuPCJWkvhQ1axXPh9QNPmGEqgzWQ9qf35gqEJdqMD',
    });

    const result = validateEntities(entities, undefined, registry);
    expect(result.safety_flags).not.toContain('invalid_destination');
  });

  it('caps slippage to constraint max', () => {
    const entities = makeEntities({ slippage_bps: 500 });
    const result = validateEntities(
      entities,
      { max_slippage_bps: 100 },
      registry,
    );
    expect(result.entities.slippage_bps).toBe(100);
  });

  it('flags low confidence extraction', () => {
    const entities = makeEntities({ raw_confidence: 0.3 });
    const result = validateEntities(entities, undefined, registry);
    expect(result.feasibility).toBe('medium');
    expect(result.user_confirmations_needed).toContainEqual(
      expect.stringContaining('Low confidence'),
    );
  });

  it('handles ticker case insensitivity', () => {
    const entities = makeEntities({
      tokens: [
        { ticker: 'sol', role: 'source' },
        { ticker: 'usdc', role: 'destination' },
      ],
    });
    const result = validateEntities(entities, undefined, registry);
    expect(result.resolved_tokens['SOL']).toBeDefined();
    expect(result.resolved_tokens['USDC']).toBeDefined();
  });
});

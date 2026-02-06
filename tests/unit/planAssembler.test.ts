import { assemblePlan } from '../../src/services/planAssembler';
import { ValidationResult } from '../../src/types';
import { TokenRegistryEntry } from '../../src/types';

function makeValidation(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    entities: {
      action_type: 'swap',
      tokens: [
        { ticker: 'SOL', role: 'source' },
        { ticker: 'USDC', role: 'destination' },
      ],
      amounts: [{ value: 2.0, ticker: 'SOL' }],
      slippage_bps: 100,
      protocol_preference: 'jupiter',
      raw_confidence: 0.95,
    },
    resolved_tokens: {
      SOL: { ticker: 'SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9, name: 'Solana' },
      USDC: { ticker: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, name: 'USD Coin' },
    } as Record<string, TokenRegistryEntry>,
    safety_flags: [],
    user_confirmations_needed: [],
    feasibility: 'high',
    ...overrides,
  };
}

describe('planAssembler', () => {
  describe('swap plans', () => {
    it('assembles a basic swap plan', () => {
      const plan = assemblePlan(makeValidation());
      expect(plan.intent).toContain('Swap 2 SOL');
      expect(plan.intent).toContain('USDC');
      expect(plan.intent).toContain('Jupiter');
      expect(plan.action_plan).toHaveLength(1);
      expect(plan.action_plan[0].step_type).toBe('swap');
      expect(plan.action_plan[0].protocol_hint).toBe('jupiter');
      expect(plan.action_plan[0].required_data).toContain('jupiter_quote');
    });

    it('populates inputs/outputs for swap', () => {
      const plan = assemblePlan(makeValidation());
      const step = plan.action_plan[0];
      expect(step.inputs.input_token).toEqual({
        ticker: 'SOL',
        mint: 'So11111111111111111111111111111111111111112',
        amount: 2.0,
      });
      expect(step.inputs.slippage_bps).toBe(100);
      expect(step.outputs.output_token).toEqual({
        ticker: 'USDC',
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount_estimate: null,
      });
    });

    it('defaults to jupiter for swap without protocol preference', () => {
      const plan = assemblePlan(
        makeValidation({
          entities: {
            action_type: 'swap',
            tokens: [
              { ticker: 'SOL', role: 'source' },
              { ticker: 'USDC', role: 'destination' },
            ],
            amounts: [{ value: 1, ticker: 'SOL' }],
            protocol_preference: undefined,
            raw_confidence: 0.9,
          },
        }),
      );
      expect(plan.action_plan[0].protocol_hint).toBe('jupiter');
    });

    it('uses raydium when specified', () => {
      const plan = assemblePlan(
        makeValidation({
          entities: {
            action_type: 'swap',
            tokens: [
              { ticker: 'SOL', role: 'source' },
              { ticker: 'USDC', role: 'destination' },
            ],
            amounts: [{ value: 1, ticker: 'SOL' }],
            protocol_preference: 'raydium',
            raw_confidence: 0.9,
          },
        }),
      );
      expect(plan.action_plan[0].protocol_hint).toBe('raydium');
    });
  });

  describe('transfer plans', () => {
    it('assembles a transfer plan with no protocol hint', () => {
      const plan = assemblePlan(
        makeValidation({
          entities: {
            action_type: 'transfer',
            tokens: [{ ticker: 'USDC', role: 'source' }],
            amounts: [{ value: 100, ticker: 'USDC' }],
            destination: '7xKXuPCJWkvhQ1axXPh9QNPmGEqgzWQ9qf35gqEJdqMD',
            raw_confidence: 0.9,
          },
        }),
      );
      expect(plan.action_plan[0].step_type).toBe('transfer');
      expect(plan.action_plan[0].protocol_hint).toBeNull();
      expect(plan.action_plan[0].required_data).toContain('recipient_account_check');
      expect(plan.intent).toContain('Transfer 100 USDC');
    });
  });

  describe('stake plans', () => {
    it('defaults to sanctum for stake', () => {
      const plan = assemblePlan(
        makeValidation({
          entities: {
            action_type: 'stake',
            tokens: [{ ticker: 'SOL', role: 'source' }],
            amounts: [{ value: 5, ticker: 'SOL' }],
            raw_confidence: 0.9,
          },
        }),
      );
      expect(plan.action_plan[0].step_type).toBe('stake');
      expect(plan.action_plan[0].protocol_hint).toBe('sanctum');
    });

    it('uses marinade when specified', () => {
      const plan = assemblePlan(
        makeValidation({
          entities: {
            action_type: 'stake',
            tokens: [{ ticker: 'SOL', role: 'source' }],
            amounts: [{ value: 5, ticker: 'SOL' }],
            protocol_preference: 'marinade',
            raw_confidence: 0.9,
          },
        }),
      );
      expect(plan.action_plan[0].protocol_hint).toBe('marinade');
    });
  });

  describe('extracted_entities', () => {
    it('includes tickers, mints, amounts', () => {
      const plan = assemblePlan(makeValidation());
      expect(plan.extracted_entities.tickers).toEqual(['SOL', 'USDC']);
      expect(plan.extracted_entities.mints.SOL).toBe('So11111111111111111111111111111111111111112');
      expect(plan.extracted_entities.mints.USDC).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(plan.extracted_entities.slippage_bps).toBe(100);
      expect(plan.extracted_entities.amounts).toEqual([{ value: 2.0, ticker: 'SOL' }]);
    });
  });

  describe('risk + feasibility', () => {
    it('returns low risk for clean swap', () => {
      const plan = assemblePlan(makeValidation());
      expect(plan.risk_level).toBe('low');
      expect(plan.feasibility).toBe('high');
    });

    it('returns medium risk with safety flags', () => {
      const plan = assemblePlan(
        makeValidation({
          safety_flags: ['unknown_token:FAKE'],
          feasibility: 'medium',
        }),
      );
      expect(plan.risk_level).toBe('medium');
    });
  });

  describe('share_text', () => {
    it('generates share text for swap', () => {
      const plan = assemblePlan(makeValidation());
      expect(plan.share_text).toContain('swap');
      expect(plan.share_text).toContain('SOL');
      expect(plan.share_text).toContain('USDC');
    });
  });

  describe('reasons', () => {
    it('includes positive reasons for clean swap', () => {
      const plan = assemblePlan(makeValidation());
      expect(plan.reasons).toContain('Well-known tokens');
      expect(plan.reasons).toContain('Explicit amount provided');
      expect(plan.reasons).toContain('Explicit slippage provided');
    });
  });

  describe('unknown action type', () => {
    it('returns high risk for unknown action', () => {
      const plan = assemblePlan(
        makeValidation({
          entities: {
            action_type: 'unknown',
            tokens: [],
            amounts: [],
            raw_confidence: 0.2,
          },
          resolved_tokens: {},
          feasibility: 'low',
        }),
      );
      expect(plan.risk_level).toBe('high');
      expect(plan.action_plan[0].step_type).toBe('unknown');
    });
  });
});

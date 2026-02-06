import { enrichPlan } from '../../src/services/proEnricher';
import { ActionPlan } from '../../src/types';

function makeSwapPlan(overrides: Partial<ActionPlan> = {}): ActionPlan {
  return {
    intent: 'Swap 2 SOL → USDC via Jupiter',
    action_plan: [
      {
        step: 1,
        step_type: 'swap',
        protocol_hint: 'jupiter',
        inputs: {
          input_token: {
            ticker: 'SOL',
            mint: 'So11111111111111111111111111111111111111112',
            amount: 2.0,
          },
          slippage_bps: 100,
        },
        outputs: {
          output_token: {
            ticker: 'USDC',
            mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            amount_estimate: null,
          },
        },
        required_data: ['jupiter_quote'],
        safety_flags: [],
        user_confirmations_needed: [],
      },
    ],
    extracted_entities: {
      amounts: [{ value: 2.0, ticker: 'SOL' }],
      tickers: ['SOL', 'USDC'],
      mints: {
        SOL: 'So11111111111111111111111111111111111111112',
        USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      slippage_bps: 100,
      priority_fee: null,
      destinations: [],
    },
    feasibility: 'high',
    risk_level: 'low',
    reasons: ['Well-known tokens'],
    share_text: 'swap text',
    ...overrides,
  };
}

const DECIMALS_MAP = {
  So11111111111111111111111111111111111111112: 9,
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6,
};

describe('proEnricher', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches Jupiter quote and returns quote_summary', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          inAmount: '2000000000',
          outAmount: '342180000',
          priceImpactPct: '0.01',
          routePlan: [
            {
              swapInfo: {
                ammKey: 'abc',
                label: 'Orca Whirlpool',
                inputMint: 'So11111111111111111111111111111111111111112',
                outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              },
              percent: 100,
            },
          ],
        }),
    });

    const result = await enrichPlan(makeSwapPlan(), undefined, {
      jupiterQuoteUrl: 'https://mock-jupiter.test/quote',
      decimalsMap: DECIMALS_MAP,
    });

    expect(result.quote_summary).not.toBeNull();
    expect(result.quote_summary!.source).toBe('jupiter');
    expect(result.quote_summary!.input_amount).toBe(2.0);
    expect(result.quote_summary!.input_token).toBe('SOL');
    expect(result.quote_summary!.output_token).toBe('USDC');
    expect(result.quote_summary!.output_amount_estimate).toBe(342.18);
    expect(result.quote_summary!.price_impact_pct).toBe(0.01);
    expect(result.quote_summary!.route_description).toContain('Orca Whirlpool');
    expect(result.simulation_summary).toBeNull(); // no wallet
    expect(result.error).toBeUndefined();
  });

  it('includes cost estimate when wallet is provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          inAmount: '2000000000',
          outAmount: '342180000',
          priceImpactPct: '0.01',
          routePlan: [
            {
              swapInfo: { ammKey: 'a', label: 'Orca', inputMint: 'x', outputMint: 'y' },
              percent: 100,
            },
          ],
        }),
    });

    const result = await enrichPlan(
      makeSwapPlan(),
      '7xKXuPCJWkvhQ1axXPh9QNPmGEqgzWQ9qf35gqEJdqMD',
      {
        jupiterQuoteUrl: 'https://mock.test/quote',
        decimalsMap: DECIMALS_MAP,
      },
    );

    expect(result.quote_summary).not.toBeNull();
    expect(result.simulation_summary).not.toBeNull();
    // Verify it's honest about being an estimate, not a simulation
    expect(result.simulation_summary!.status).toBe('estimated');
    expect(result.simulation_summary!.note).toContain('Estimated from quote');
    expect(result.simulation_summary!.note).toContain('No on-chain simulation');
    expect(result.simulation_summary!.sol_change).toBeLessThan(0);
    expect(result.simulation_summary!.token_changes).toContainEqual(
      expect.objectContaining({ token: 'USDC' }),
    );
    // No RPC call was made — only 1 fetch to Jupiter
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null quote_summary with error on Jupiter API failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await enrichPlan(makeSwapPlan(), undefined, {
      jupiterQuoteUrl: 'https://mock.test/quote',
    });

    expect(result.quote_summary).toBeNull();
    expect(result.error).toContain('Jupiter API returned 500');
  });

  it('returns null quote_summary with error on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await enrichPlan(makeSwapPlan(), undefined, {
      jupiterQuoteUrl: 'https://mock.test/quote',
    });

    expect(result.quote_summary).toBeNull();
    expect(result.error).toContain('Network error');
  });

  it('skips enrichment for non-swap plans', async () => {
    const transferPlan = makeSwapPlan({
      action_plan: [
        {
          step: 1,
          step_type: 'transfer',
          protocol_hint: null,
          inputs: { token: { ticker: 'USDC', mint: 'abc', amount: 100 } },
          outputs: {},
          required_data: ['recipient_account_check'],
          safety_flags: [],
          user_confirmations_needed: [],
        },
      ],
    });

    const result = await enrichPlan(transferPlan, undefined);
    expect(result.quote_summary).toBeNull();
    expect(result.simulation_summary).toBeNull();
  });

  it('skips enrichment when input mint is null', async () => {
    const plan = makeSwapPlan();
    (plan.action_plan[0].inputs.input_token as Record<string, unknown>).mint = null;

    const result = await enrichPlan(plan, undefined);
    expect(result.quote_summary).toBeNull();
  });

  it('skips cost estimate when no wallet provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          inAmount: '2000000000',
          outAmount: '342180000',
          priceImpactPct: '0.01',
          routePlan: [],
        }),
    });

    const result = await enrichPlan(makeSwapPlan(), undefined, {
      jupiterQuoteUrl: 'https://mock.test/quote',
    });

    expect(result.quote_summary).not.toBeNull();
    expect(result.simulation_summary).toBeNull();
    // Only 1 fetch call (quote, no RPC)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses decimalsMap for correct amount conversion', async () => {
    // BONK has 5 decimals — verify the enricher sends the right lamport amount
    const bonkPlan = makeSwapPlan();
    const step = bonkPlan.action_plan[0];
    (step.inputs.input_token as Record<string, unknown>).ticker = 'BONK';
    (step.inputs.input_token as Record<string, unknown>).mint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    (step.inputs.input_token as Record<string, unknown>).amount = 1000;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          inAmount: '100000000',
          outAmount: '50000000',
          priceImpactPct: '0.05',
          routePlan: [],
        }),
    });

    await enrichPlan(bonkPlan, undefined, {
      jupiterQuoteUrl: 'https://mock.test/quote',
      decimalsMap: {
        DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 5,
        EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6,
      },
    });

    // Verify fetch was called with amount=100000000 (1000 * 10^5)
    const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(fetchUrl).toContain('amount=100000000');
  });

  it('falls back to heuristic decimals when decimalsMap missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          inAmount: '2000000000',
          outAmount: '342180000',
          priceImpactPct: '0.01',
          routePlan: [],
        }),
    });

    // No decimalsMap passed — should fall back to SOL=9, other=6
    await enrichPlan(makeSwapPlan(), undefined, {
      jupiterQuoteUrl: 'https://mock.test/quote',
    });

    const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    // 2 SOL * 10^9 = 2000000000
    expect(fetchUrl).toContain('amount=2000000000');
  });
});

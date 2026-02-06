import { ActionPlan, QuoteSummary, SimulationSummary, SOL_MINT } from '../types';

const JUPITER_QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';
const DEFAULT_DECIMALS = 6;
const ESTIMATED_SWAP_CU = 200_000;
const ESTIMATED_TX_FEE_SOL = 0.000005; // 5000 lamports

function toSmallestUnit(amount: number, decimals: number): string {
  return Math.round(amount * 10 ** decimals).toString();
}

export interface ProEnricherOptions {
  jupiterQuoteUrl?: string;
  decimalsMap?: Record<string, number>;
}

export interface EnrichmentResult {
  quote_summary: QuoteSummary | null;
  simulation_summary: SimulationSummary | null;
  error?: string;
}

export async function enrichPlan(
  plan: ActionPlan,
  wallet: string | undefined,
  options: ProEnricherOptions = {},
): Promise<EnrichmentResult> {
  const step = plan.action_plan[0];
  if (!step || step.step_type !== 'swap') return { quote_summary: null, simulation_summary: null };

  const inputToken = step.inputs.input_token as
    | { ticker: string; mint: string | null; amount: number | null }
    | undefined;
  const outputToken = step.outputs.output_token as
    | { ticker: string; mint: string | null }
    | undefined;

  if (!inputToken?.mint || !outputToken?.mint || inputToken.amount == null) {
    return { quote_summary: null, simulation_summary: null };
  }

  const decimalsMap = options.decimalsMap ?? {};
  const inputDecimals = decimalsMap[inputToken.mint] ?? (inputToken.mint === SOL_MINT ? 9 : DEFAULT_DECIMALS);
  const outputDecimals = decimalsMap[outputToken.mint] ?? (outputToken.mint === SOL_MINT ? 9 : DEFAULT_DECIMALS);

  const { quote, error } = await fetchJupiterQuote(
    inputToken.mint, outputToken.mint, inputToken.amount,
    inputToken.ticker, outputToken.ticker,
    inputDecimals, outputDecimals,
    plan.extracted_entities.slippage_bps ?? 50,
    options.jupiterQuoteUrl || JUPITER_QUOTE_URL,
  );

  let simulation_summary: SimulationSummary | null = null;
  if (wallet && quote) {
    simulation_summary = estimateTransactionCost(
      inputToken.amount, inputToken.ticker, outputToken.ticker,
      quote.output_amount_estimate,
    );
  }

  return { quote_summary: quote, simulation_summary, error };
}

async function fetchJupiterQuote(
  inputMint: string, outputMint: string, amount: number,
  inputTicker: string, outputTicker: string,
  inputDecimals: number, outputDecimals: number,
  slippageBps: number, baseUrl: string,
): Promise<{ quote: QuoteSummary | null; error?: string }> {
  try {
    const amountStr = toSmallestUnit(amount, inputDecimals);
    const url = `${baseUrl}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountStr}&slippageBps=${slippageBps}`;
    const res = await fetch(url);
    if (!res.ok) return { quote: null, error: `Jupiter API returned ${res.status}` };

    const data = (await res.json()) as {
      inAmount: string;
      outAmount: string;
      priceImpactPct: string;
      routePlan: Array<{
        swapInfo: { ammKey: string; label: string; inputMint: string; outputMint: string };
        percent: number;
      }>;
    };

    const outputAmount = parseInt(data.outAmount, 10) / 10 ** outputDecimals;
    const routeLabels = data.routePlan.map((r) => r.swapInfo.label);

    return {
      quote: {
        source: 'jupiter',
        input_amount: amount,
        input_token: inputTicker,
        output_amount_estimate: parseFloat(outputAmount.toFixed(outputDecimals)),
        output_token: outputTicker,
        price_impact_pct: parseFloat(data.priceImpactPct),
        route_description: `${inputTicker} → ${outputTicker} (${routeLabels.join(' → ') || 'direct'})`,
        fetched_at: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { quote: null, error: `Jupiter fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function estimateTransactionCost(
  inputAmount: number, inputTicker: string,
  outputTicker: string, estimatedOutput: number,
): SimulationSummary {
  return {
    status: 'estimated',
    sol_change: -(inputTicker === 'SOL' ? inputAmount + ESTIMATED_TX_FEE_SOL : ESTIMATED_TX_FEE_SOL),
    token_changes: [
      ...(inputTicker !== 'SOL' ? [{ token: inputTicker, change: `-${inputAmount}` }] : []),
      { token: outputTicker, change: `+${estimatedOutput}` },
    ],
    estimated_compute_units: ESTIMATED_SWAP_CU,
    note: 'Estimated from quote. No on-chain simulation was performed.',
  };
}

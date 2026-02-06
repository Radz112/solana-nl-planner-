export const SOL_MINT = 'So11111111111111111111111111111111111111112';

export interface Constraints {
  max_slippage_bps?: number;
  max_fee_sol?: number;
  allow_unknown_tokens?: boolean;
  denylist_mints?: string[];
}

export type Mode = 'lite' | 'pro';

export interface NLPlanRequest {
  prompt: string;
  wallet?: string;
  mode?: Mode;
  constraints?: Constraints;
}

export interface TokenRef {
  ticker: string;
  role: 'source' | 'destination';
}

export interface AmountRef {
  value: number;
  ticker: string;
}

export interface ExtractedEntities {
  action_type: ActionType;
  tokens: TokenRef[];
  amounts: AmountRef[];
  destination?: string;
  slippage_bps?: number;
  priority_fee_lamports?: number;
  protocol_preference?: string;
  raw_confidence: number;
}

export interface TokenRegistryEntry {
  ticker: string;
  mint: string;
  decimals: number;
  name: string;
}

export interface ValidationResult {
  entities: ExtractedEntities;
  resolved_tokens: Record<string, TokenRegistryEntry>;
  safety_flags: string[];
  user_confirmations_needed: string[];
  feasibility: Feasibility;
}

export type ActionType =
  | 'swap'
  | 'transfer'
  | 'stake'
  | 'unstake'
  | 'lend'
  | 'borrow'
  | 'nft_buy'
  | 'nft_sell'
  | 'unknown';

export type Feasibility = 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface ActionStep {
  step: number;
  step_type: ActionType;
  protocol_hint: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  required_data: string[];
  safety_flags: string[];
  user_confirmations_needed: string[];
}

export interface ActionPlan {
  intent: string;
  action_plan: ActionStep[];
  extracted_entities: {
    amounts: AmountRef[];
    tickers: string[];
    mints: Record<string, string>;
    slippage_bps: number | null;
    priority_fee: number | null;
    destinations: string[];
  };
  feasibility: Feasibility;
  risk_level: RiskLevel;
  reasons: string[];
  share_text: string;
}

export interface QuoteSummary {
  source: string;
  input_amount: number;
  input_token: string;
  output_amount_estimate: number;
  output_token: string;
  price_impact_pct: number;
  route_description: string;
  fetched_at: string;
}

export interface SimulationSummary {
  status: 'estimated' | 'unavailable';
  sol_change: number;
  token_changes: { token: string; change: string }[];
  estimated_compute_units: number;
  note: string;
}

export interface NLPlanResponse extends ActionPlan {
  quote_summary?: QuoteSummary | null;
  simulation_summary?: SimulationSummary | null;
}

export interface AppOptions {
  enableLogging?: boolean;
  rateLimitRpm?: number;
  bodyLimit?: string;
  anthropicApiKey?: string;
  payToAddress?: string;
}

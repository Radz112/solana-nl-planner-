import {
  ActionStep,
  ActionPlan,
  ActionType,
  ValidationResult,
  RiskLevel,
  SOL_MINT,
} from '../types';
import { classifyRisk } from './riskClassifier';

function resolveProtocolHint(actionType: ActionType, protocolPreference?: string | null): string | null {
  const pref = protocolPreference?.toLowerCase();

  switch (actionType) {
    case 'swap':
      if (pref === 'raydium') return 'raydium';
      if (pref === 'pump' || pref === 'pumpfun' || pref === 'pumpswap') return 'pumpswap';
      return 'jupiter';

    case 'transfer':
      return null;

    case 'stake':
    case 'unstake':
      if (pref === 'marinade') return 'marinade';
      if (pref === 'jito') return 'jito';
      return 'sanctum';

    case 'lend':
    case 'borrow':
      if (pref === 'marginfi') return 'marginfi';
      if (pref === 'kamino') return 'kamino';
      return null;

    case 'nft_buy':
    case 'nft_sell':
      return pref === 'tensor' ? 'tensor' : null;

    default:
      return null;
  }
}

function getRequiredData(actionType: ActionType, protocolHint: string | null): string[] {
  switch (actionType) {
    case 'swap':
      return protocolHint === 'jupiter' ? ['jupiter_quote'] : ['quote'];
    case 'transfer':
      return ['recipient_account_check'];
    case 'stake':
    case 'unstake':
      return ['validator_info'];
    case 'lend':
    case 'borrow':
      return ['protocol_rates'];
    case 'nft_buy':
    case 'nft_sell':
      return ['nft_listing_info'];
    default:
      return [];
  }
}

function generateReasons(
  validation: ValidationResult,
  protocolHint: string | null,
  riskLevel: RiskLevel,
): string[] {
  const reasons: string[] = [];
  const { entities, safety_flags, resolved_tokens } = validation;

  const knownCount = Object.keys(resolved_tokens).length;
  if (knownCount === entities.tokens.length && knownCount > 0) {
    reasons.push('Well-known tokens');
  }
  if (entities.amounts.length > 0) reasons.push('Explicit amount provided');
  if (entities.slippage_bps != null) reasons.push('Explicit slippage provided');
  if (protocolHint) reasons.push(`Standard ${protocolHint} ${entities.action_type}`);

  for (const flag of safety_flags) {
    if (flag.startsWith('unknown_token:')) reasons.push(`Unknown token: ${flag.split(':')[1]}`);
    else if (flag.startsWith('denylisted_token:')) reasons.push(`Denylisted token: ${flag.split(':')[1]}`);
    else if (flag === 'invalid_destination') reasons.push('Invalid destination address');
  }

  if (entities.raw_confidence < 0.5) reasons.push('Low extraction confidence');
  if (riskLevel === 'high' && reasons.length === 0) reasons.push('Action type could not be determined');

  return reasons;
}

function generateShareText(entities: ValidationResult['entities'], protocolHint: string | null): string {
  const { action_type, amounts, tokens } = entities;
  const via = protocolHint ? ` via ${protocolHint}` : '';

  if (action_type === 'swap' && amounts.length > 0) {
    const dest = tokens.find((t) => t.role === 'destination');
    return `I asked an AI to plan my Solana swap in plain English — ${amounts[0].value} ${amounts[0].ticker} → ${dest?.ticker || '?'}${via}, no code needed`;
  }
  if (action_type === 'transfer' && amounts.length > 0) {
    return `I just planned a ${amounts[0].value} ${amounts[0].ticker} transfer on Solana using plain English`;
  }
  if (action_type === 'stake' || action_type === 'unstake') {
    const amt = amounts.length > 0 ? `${amounts[0].value} SOL ` : '';
    return `I planned a ${amt}${action_type}${via} on Solana using plain English`;
  }
  return `I used an AI to plan a Solana ${action_type} action in plain English`;
}

export function assemblePlan(validation: ValidationResult): ActionPlan {
  const { entities, resolved_tokens, safety_flags, user_confirmations_needed, feasibility } = validation;

  const protocolHint = resolveProtocolHint(entities.action_type, entities.protocol_preference);
  const riskLevel = classifyRisk(entities.action_type, safety_flags, user_confirmations_needed);
  const step = buildStep(1, entities.action_type, protocolHint, validation);

  const mints: Record<string, string> = {};
  for (const [ticker, entry] of Object.entries(resolved_tokens)) {
    mints[ticker] = entry.mint;
  }

  return {
    intent: buildIntentString(entities.action_type, entities, protocolHint),
    action_plan: [step],
    extracted_entities: {
      amounts: entities.amounts,
      tickers: entities.tokens.map((t) => t.ticker.toUpperCase()),
      mints,
      slippage_bps: entities.slippage_bps ?? null,
      priority_fee: entities.priority_fee_lamports ?? null,
      destinations: entities.destination ? [entities.destination] : [],
    },
    feasibility,
    risk_level: riskLevel,
    reasons: generateReasons(validation, protocolHint, riskLevel),
    share_text: generateShareText(entities, protocolHint),
  };
}

function buildStep(
  stepNum: number,
  actionType: ActionType,
  protocolHint: string | null,
  validation: ValidationResult,
): ActionStep {
  const { entities, resolved_tokens, safety_flags, user_confirmations_needed } = validation;
  const inputs: Record<string, unknown> = {};
  const outputs: Record<string, unknown> = {};

  const resolve = (ticker: string) => resolved_tokens[ticker.toUpperCase()];
  const findAmount = (ticker: string) =>
    entities.amounts.find((a) => a.ticker.toUpperCase() === ticker.toUpperCase());

  if (actionType === 'swap') {
    const src = entities.tokens.find((t) => t.role === 'source');
    const dst = entities.tokens.find((t) => t.role === 'destination');

    inputs.input_token = {
      ticker: src?.ticker.toUpperCase() || null,
      mint: src ? resolve(src.ticker)?.mint || null : null,
      amount: src ? findAmount(src.ticker)?.value ?? null : null,
    };
    if (entities.slippage_bps !== undefined) inputs.slippage_bps = entities.slippage_bps;

    outputs.output_token = {
      ticker: dst?.ticker.toUpperCase() || null,
      mint: dst ? resolve(dst.ticker)?.mint || null : null,
      amount_estimate: null,
    };
  } else if (actionType === 'transfer') {
    const src = entities.tokens.find((t) => t.role === 'source');
    inputs.token = {
      ticker: src?.ticker.toUpperCase() || null,
      mint: src ? resolve(src.ticker)?.mint || null : null,
      amount: entities.amounts[0]?.value ?? null,
    };
    inputs.destination = entities.destination || null;
  } else if (actionType === 'stake' || actionType === 'unstake') {
    inputs.token = {
      ticker: 'SOL',
      mint: SOL_MINT,
      amount: entities.amounts[0]?.value ?? null,
    };
  } else {
    for (const tokenRef of entities.tokens) {
      inputs[tokenRef.role] = {
        ticker: tokenRef.ticker.toUpperCase(),
        mint: resolve(tokenRef.ticker)?.mint || null,
        amount: findAmount(tokenRef.ticker)?.value ?? null,
      };
    }
  }

  return {
    step: stepNum,
    step_type: actionType,
    protocol_hint: protocolHint,
    inputs,
    outputs,
    required_data: getRequiredData(actionType, protocolHint),
    safety_flags,
    user_confirmations_needed,
  };
}

function buildIntentString(
  actionType: ActionType,
  entities: ValidationResult['entities'],
  protocolHint: string | null,
): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const via = protocolHint ? ` via ${cap(protocolHint)}` : '';

  if (actionType === 'swap' && entities.amounts.length > 0) {
    const amt = entities.amounts[0];
    const dst = entities.tokens.find((t) => t.role === 'destination');
    return `Swap ${amt.value} ${amt.ticker.toUpperCase()} → ${dst?.ticker.toUpperCase() || '?'}${via}`;
  }
  if (actionType === 'transfer' && entities.amounts.length > 0) {
    const amt = entities.amounts[0];
    const dest = entities.destination ? ` to ${entities.destination.slice(0, 8)}...` : '';
    return `Transfer ${amt.value} ${amt.ticker.toUpperCase()}${dest}`;
  }
  if (actionType === 'stake' || actionType === 'unstake') {
    const amt = entities.amounts.length > 0 ? `${entities.amounts[0].value} SOL ` : '';
    return `${cap(actionType)} ${amt}${via}`.trim();
  }
  return `${cap(actionType)} action`;
}

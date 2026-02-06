import {
  ExtractedEntities,
  Constraints,
  ValidationResult,
  Feasibility,
  TokenRegistryEntry,
} from '../types';
import { TokenRegistry } from './tokenRegistry';

const BASE58_PUBKEY_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function validateEntities(
  entities: ExtractedEntities,
  constraints: Constraints | undefined,
  registry: TokenRegistry,
): ValidationResult {
  const safety_flags: string[] = [];
  const user_confirmations_needed: string[] = [];
  const resolved_tokens: Record<string, TokenRegistryEntry> = {};
  let feasibility: Feasibility = 'high';

  const effectiveConstraints: Constraints = {
    allow_unknown_tokens: false,
    denylist_mints: [],
    ...constraints,
  };

  for (const tokenRef of entities.tokens) {
    const ticker = tokenRef.ticker.toUpperCase();

    if (registry.isAmbiguous(ticker)) {
      user_confirmations_needed.push(`Multiple tokens match '${ticker}'. Please provide the mint address.`);
      feasibility = downgrade(feasibility, 'medium');
      continue;
    }

    const resolved = registry.resolveByTicker(ticker);
    if (resolved) {
      resolved_tokens[ticker] = resolved;
    } else if (!effectiveConstraints.allow_unknown_tokens) {
      safety_flags.push(`unknown_token:${ticker}`);
      user_confirmations_needed.push(
        `Token '${ticker}' is not in the known token registry. Please provide the mint address or enable allow_unknown_tokens.`,
      );
      feasibility = downgrade(feasibility, 'medium');
    }
  }

  if (effectiveConstraints.denylist_mints!.length > 0) {
    const denySet = new Set(effectiveConstraints.denylist_mints);
    for (const [ticker, entry] of Object.entries(resolved_tokens)) {
      if (denySet.has(entry.mint)) {
        safety_flags.push(`denylisted_token:${ticker}`);
        user_confirmations_needed.push(`Token '${ticker}' (${entry.mint}) is on your denylist.`);
        feasibility = downgrade(feasibility, 'low');
      }
    }
  }

  if (entities.amounts.length === 0) {
    user_confirmations_needed.push(`Amount not specified for ${entities.action_type}. How much?`);
    feasibility = downgrade(feasibility, 'low');
  }

  if (entities.action_type === 'transfer') {
    if (!entities.destination) {
      user_confirmations_needed.push('No destination address provided for transfer.');
      feasibility = downgrade(feasibility, 'low');
    } else if (!BASE58_PUBKEY_REGEX.test(entities.destination)) {
      safety_flags.push('invalid_destination');
      user_confirmations_needed.push(
        `Destination '${entities.destination}' does not appear to be a valid Solana address.`,
      );
      feasibility = downgrade(feasibility, 'low');
    }
  }

  if (
    effectiveConstraints.max_slippage_bps !== undefined &&
    entities.slippage_bps !== undefined &&
    entities.slippage_bps > effectiveConstraints.max_slippage_bps
  ) {
    entities.slippage_bps = effectiveConstraints.max_slippage_bps;
  }

  if (entities.raw_confidence < 0.5) {
    feasibility = downgrade(feasibility, 'medium');
    user_confirmations_needed.push('Low confidence in intent extraction. Please rephrase or provide more detail.');
  }

  return { entities, resolved_tokens, safety_flags, user_confirmations_needed, feasibility };
}

function downgrade(current: Feasibility, to: Feasibility): Feasibility {
  const rank: Record<Feasibility, number> = { high: 2, medium: 1, low: 0 };
  return rank[to] < rank[current] ? to : current;
}

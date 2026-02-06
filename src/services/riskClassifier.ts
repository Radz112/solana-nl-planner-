import { ActionType, RiskLevel } from '../types';

const HIGH_RISK_FLAGS = ['invalid_destination', 'denylisted_token'];

export function classifyRisk(
  actionType: ActionType,
  safetyFlags: string[],
  userConfirmationsNeeded: string[],
): RiskLevel {
  if (safetyFlags.length >= 2) return 'high';
  if (actionType === 'unknown') return 'high';
  if (safetyFlags.some((f) => HIGH_RISK_FLAGS.some((h) => f.startsWith(h)))) return 'high';

  if (safetyFlags.length > 0) return 'medium';
  if (userConfirmationsNeeded.length > 0) return 'medium';
  if (['lend', 'borrow', 'nft_buy', 'nft_sell'].includes(actionType)) return 'medium';

  return 'low';
}

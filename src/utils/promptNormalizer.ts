import { Constraints } from '../types';

export function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '');
}

export function normalizeConstraints(constraints: Constraints | undefined): string {
  if (!constraints) return '{}';
  return JSON.stringify(
    Object.fromEntries(Object.entries(constraints).sort(([a], [b]) => a.localeCompare(b))),
  );
}

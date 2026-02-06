const INJECTION_PATTERNS = [
  /ignore\s+.*(instructions|rules|safety)/i,
  /override\s+.*(safety|rules)/i,
  /(disregard|forget)\s+.*instructions/i,
  /bypass\s+.*safety/i,
  /generate\s+.*sign/i,
  /return\s+.*(transaction|raw\s*bytes)/i,
  /raw\s+.*bytes/i,
  /system\s*prompt/i,
  /you\s+are\s+now/i,
  /new\s+instructions/i,
];

const DRAIN_PATTERNS = [
  /(send|transfer)\s+(all|everything)/i,
  /approve\s+unlimited/i,
  /delegate\s+authority/i,
  /max\s+amount/i,
  /(entire\s+balance|all\s+my\s+(sol|tokens|funds|balance))/i,
  /drain/i,
  /sweep\s+all/i,
];

export function detectDangerousPatterns(prompt: string): { isDangerous: boolean; reason?: string } {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      return { isDangerous: true, reason: 'Request appears to contain prompt injection. No plan generated.' };
    }
  }

  for (const pattern of DRAIN_PATTERNS) {
    if (pattern.test(prompt)) {
      return { isDangerous: true, reason: 'Request contains a potentially dangerous full-balance or unlimited approval pattern.' };
    }
  }

  return { isDangerous: false };
}

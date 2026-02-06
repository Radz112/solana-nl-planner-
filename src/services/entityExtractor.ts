import Anthropic from '@anthropic-ai/sdk';
import { ExtractedEntities, Constraints } from '../types';

const MAX_INPUT_CHARS = 4096;
const MAX_OUTPUT_TOKENS = 512;

const SYSTEM_PROMPT = `You are a Solana transaction intent extractor. Given a user's natural language prompt describing a Solana blockchain action, extract the structured intent.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation, no extra text:

{
  "action_type": "swap" | "transfer" | "stake" | "unstake" | "lend" | "borrow" | "nft_buy" | "nft_sell" | "unknown",
  "tokens": [{ "ticker": "string", "role": "source" | "destination" }],
  "amounts": [{ "value": number, "ticker": "string" }],
  "destination": "optional base58 wallet address or null",
  "slippage_bps": "number or null",
  "priority_fee_lamports": "number or null",
  "protocol_preference": "string or null",
  "raw_confidence": 0.0 to 1.0
}

Rules:
- action_type must be one of the listed values. Use "unknown" if you cannot determine the action.
- tokens array lists each token mentioned with its role in the action.
- amounts array lists each amount mentioned. value must be a number (not a string).
- slippage_bps: convert percentages to basis points (1% = 100 bps).
- protocol_preference: extract if the user mentions a specific protocol (jupiter, raydium, sanctum, marinade, jito, tensor, pumpfun, marginfi, kamino).
- raw_confidence: your confidence that you correctly understood the intent (0.0 = no idea, 1.0 = certain).
- If the user's prompt contains multiple actions, extract only the FIRST action. Multi-step planning is handled downstream.
- NEVER invent or guess mint addresses. Only extract ticker symbols.
- Return ONLY the JSON object. No markdown code fences, no text before or after.`;

function buildUserPrompt(prompt: string, constraints?: Constraints): string {
  let text = `User prompt: "${prompt}"`;
  if (constraints) {
    text += `\n\nUser constraints: ${JSON.stringify(constraints)}`;
  }
  return text;
}

function parseExtractionResponse(text: string): ExtractedEntities | null {
  try {
    return JSON.parse(text) as ExtractedEntities;
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim()) as ExtractedEntities;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function extractEntities(
  prompt: string,
  constraints: Constraints | undefined,
  apiKey: string,
): Promise<{ entities: ExtractedEntities } | { error: string }> {
  const client = new Anthropic({ apiKey });
  const userMessage = buildUserPrompt(prompt.slice(0, MAX_INPUT_CHARS), constraints);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const messages: Anthropic.MessageParam[] =
        attempt === 0
          ? [{ role: 'user', content: userMessage }]
          : [
              { role: 'user', content: userMessage },
              { role: 'assistant', content: 'I apologize, let me return only the valid JSON object:' },
              { role: 'user', content: 'You returned invalid JSON on your previous attempt. Return ONLY the raw JSON object, no markdown, no explanation.' },
            ];

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages,
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = parseExtractionResponse(text.trim());

      if (parsed) return { entities: parsed };
      if (attempt === 0) continue;

      return { error: 'Failed to parse entity extraction response after retry' };
    } catch (err) {
      return {
        error: `Entity extraction API error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { error: 'Entity extraction failed' };
}

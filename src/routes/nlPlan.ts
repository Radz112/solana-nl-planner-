import { createHash } from 'crypto';
import { Router, Request, Response } from 'express';
import { bodyUnwrapper } from '../middleware/bodyUnwrapper';
import { LRUCache, LITE_TTL_MS, PRO_TTL_MS } from '../services/cache';
import { Logger } from '../services/logger';
import { detectDangerousPatterns } from '../services/dangerDetector';
import { extractEntities } from '../services/entityExtractor';
import { TokenRegistry } from '../services/tokenRegistry';
import { validateEntities } from '../services/validator';
import { assemblePlan } from '../services/planAssembler';
import { enrichPlan } from '../services/proEnricher';
import { normalizePrompt, normalizeConstraints } from '../utils/promptNormalizer';
import { NLPlanRequest, NLPlanResponse, Mode } from '../types';

const ENDPOINT_METADATA = {
  name: 'Solana NL Action Plan Translator',
  version: '1.0.0',
  description:
    'Translates natural language prompts into structured, safe Solana action plans. Planner-only by default — no ready-to-sign transactions.',
  endpoint: '/api/v1/solana/nl-plan',
  method: 'POST',
  pricing: { amount: '$0.02', unit: 'per call' },
  modes: ['lite', 'pro'],
  supported_actions: ['swap', 'transfer', 'stake', 'unstake', 'lend', 'borrow', 'nft_buy', 'nft_sell'],
  supported_protocols: ['jupiter', 'sanctum', 'pumpfun', 'pumpswap', 'raydium', 'tensor', 'marinade', 'jito'],
  input_schema: { $ref: '#/definitions/NLPlanRequest' },
  output_schema: { $ref: '#/definitions/NLPlanResponse' },
};

function cacheKey(normalizedPrompt: string, mode: string, constraintsJson: string): string {
  const hash = createHash('sha256').update(`${normalizedPrompt}|${mode}|${constraintsJson}`).digest('hex');
  return `nlplan:${hash}`;
}

export function createNLPlanRouter(
  options: { anthropicApiKey?: string; logger?: Logger },
  cache: LRUCache<NLPlanResponse>,
): Router {
  const router = Router();
  const { logger } = options;
  const tokenRegistry = new TokenRegistry();

  tokenRegistry.refresh().catch((err) => {
    logger?.warn('token_registry_refresh_failed', { error: String(err) });
  });

  router.get('/', (_req: Request, res: Response) => {
    res.json(ENDPOINT_METADATA);
  });

  router.post('/', bodyUnwrapper, async (req: Request, res: Response) => {
    const startMs = Date.now();
    try {
      const body = req.body as NLPlanRequest;

      if (!body.prompt || typeof body.prompt !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "prompt" field', error_code: 'INVALID_INPUT' });
        return;
      }
      if (body.prompt.trim().length === 0) {
        res.status(400).json({ error: 'Prompt cannot be empty', error_code: 'INVALID_INPUT' });
        return;
      }
      if (body.wallet && typeof body.wallet !== 'string') {
        res.status(400).json({ error: 'Invalid "wallet" field — must be a string', error_code: 'INVALID_INPUT' });
        return;
      }
      if (body.constraints && typeof body.constraints !== 'object') {
        res.status(400).json({ error: 'Invalid "constraints" field — must be an object', error_code: 'INVALID_INPUT' });
        return;
      }

      const mode: Mode = body.mode === 'lite' || body.mode === 'pro' ? body.mode : 'lite';

      logger?.info('nl_plan_request', { mode, has_wallet: !!body.wallet, prompt_length: body.prompt.length });

      // Cache lookup (skip when wallet provided — responses are wallet-specific)
      const noCache = req.headers['x-no-cache'] === 'true';
      let ck: string | null = null;

      if (!body.wallet && !noCache) {
        ck = cacheKey(normalizePrompt(body.prompt), mode, normalizeConstraints(body.constraints));
        const cached = cache.get(ck);
        if (cached) {
          logger?.info('cache_hit', { cacheKey: ck });
          res.json(cached);
          return;
        }
      }

      // Pre-LLM safety check
      const danger = detectDangerousPatterns(body.prompt);
      if (danger.isDangerous) {
        logger?.warn('danger_detected', { reason: danger.reason });
        res.json({
          intent: 'blocked',
          action_plan: [],
          extracted_entities: { amounts: [], tickers: [], mints: {}, slippage_bps: null, priority_fee: null, destinations: [] },
          feasibility: 'low',
          risk_level: 'high',
          reasons: [danger.reason || 'Request blocked by safety check.'],
          share_text: '',
        } satisfies NLPlanResponse);
        return;
      }

      if (!options.anthropicApiKey) {
        res.status(503).json({ error: 'Entity extraction service unavailable (no API key configured)', error_code: 'SERVICE_UNAVAILABLE' });
        return;
      }

      const extraction = await extractEntities(body.prompt, body.constraints, options.anthropicApiKey);
      if ('error' in extraction) {
        logger?.error('extraction_failed', { error: extraction.error });
        res.status(503).json({ error: 'Failed to extract intent from prompt', error_code: 'EXTRACTION_FAILED', detail: extraction.error });
        return;
      }

      logger?.info('extraction_complete', { action_type: extraction.entities.action_type, confidence: extraction.entities.raw_confidence });

      if (tokenRegistry.needsRefresh()) {
        tokenRegistry.refresh().catch((err) => {
          logger?.warn('token_registry_refresh_failed', { error: String(err) });
        });
      }

      const validation = validateEntities(extraction.entities, body.constraints, tokenRegistry);
      const plan = assemblePlan(validation);
      const response: NLPlanResponse = { ...plan };

      if (mode === 'pro') {
        const decimalsMap: Record<string, number> = {};
        for (const entry of Object.values(validation.resolved_tokens)) {
          decimalsMap[entry.mint] = entry.decimals;
        }

        const enrichment = await enrichPlan(plan, body.wallet, { decimalsMap });
        response.quote_summary = enrichment.quote_summary;
        response.simulation_summary = enrichment.simulation_summary;
        if (enrichment.error) {
          logger?.warn('pro_enrichment_degraded', { error: enrichment.error });
        }
      }

      if (ck) {
        cache.set(ck, response, mode === 'pro' ? PRO_TTL_MS : LITE_TTL_MS);
      }

      logger?.info('nl_plan_response', { mode, feasibility: response.feasibility, duration_ms: Date.now() - startMs });
      res.json(response);
    } catch (err) {
      logger?.error('internal_error', { error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - startMs });
      res.status(500).json({ error: 'Internal server error', error_code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}

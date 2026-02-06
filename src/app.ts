import express, { Request, Response, NextFunction } from 'express';
import { AppOptions, NLPlanResponse } from './types';
import { LRUCache } from './services/cache';
import { createLogger } from './services/logger';
import { createRateLimiter } from './middleware/rateLimiter';
import { createNLPlanRouter } from './routes/nlPlan';

export function createApp(options: AppOptions = {}) {
  const app = express();
  const logger = createLogger(options.enableLogging ?? true);
  const cache = new LRUCache<NLPlanResponse>(500);

  app.use(express.json({ limit: options.bodyLimit || '10kb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  if (options.rateLimitRpm) {
    app.use('/api', createRateLimiter(options.rateLimitRpm));
  }

  app.use('/api/v1/solana/nl-plan', createNLPlanRouter(
    { anthropicApiKey: options.anthropicApiKey, payToAddress: options.payToAddress, logger },
    cache,
  ));

  // Must be after routes — Express 4 requires 4-param signature for error handlers
  app.use((err: Error & { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body too large', error_code: 'BODY_TOO_LARGE' });
      return;
    }
    next(err);
  });

  return { app, cache, logger };
}

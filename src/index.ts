import { createApp } from './app';

const PORT = parseInt(process.env.PORT || '3000', 10);
const RATE_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_RPM || '60', 10);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS;

const { app, logger } = createApp({
  enableLogging: true,
  rateLimitRpm: RATE_LIMIT_RPM,
  anthropicApiKey: ANTHROPIC_API_KEY,
  payToAddress: PAY_TO_ADDRESS,
});

const server = app.listen(PORT, () => {
  logger.info('server_started', { port: PORT });
});

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info('shutdown_signal', { signal });
  server.close(() => {
    logger.info('server_closed');
    process.exit(0);
  });
  // Force close after 30s
  setTimeout(() => {
    logger.error('forced_shutdown');
    process.exit(1);
  }, 30_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

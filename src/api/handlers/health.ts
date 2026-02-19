import type { Context } from 'hono';
import { getLogger } from '../../logging.js';

const logger = getLogger('handlers:health');

/**
 * Health check endpoint
 * No authentication required
 */
export function healthHandler(context: Context) {
  const requestId = context.get('requestId') as string;

  logger.debug({ requestId }, 'Health check');

  context.status(200);
  return context.json({
    status: 'ok',
    timestamp: Math.floor(Date.now() / 1000),
  });
}

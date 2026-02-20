// Load environment variables from .env file
import 'dotenv/config';

import { startServer } from './api/server.js';
import { loadConfigDefault } from './config/loader.js';
import { createChainDriver } from './chain/factory.js';
import { KeyVault } from './custody/key-vault.js';
import { AuditQueue } from './audit/store.js';
import { AuditContractWriter } from './audit/contract.js';
import { ProxyExecutor } from './proxy/executor.js';
import { getLogger } from './logging.js';
import type { ToolKey } from './types.js';

const logger = getLogger('main');
export const version = '1.0.0';

async function main() {
  try {
    // Load configuration
    const config = await loadConfigDefault();

    // Create chain driver based on config
    const chainDriver = createChainDriver(config);

    // Create key custody from environment variables
    const keys = new Map<ToolKey, string>();
    for (const tool of config.tools) {
      const keyValue = process.env[tool.keyRef];
      if (!keyValue) {
        throw new Error(`Missing environment variable: ${tool.keyRef}`);
      }
      keys.set(tool.key as ToolKey, keyValue);
    }
    const custody = new KeyVault(keys);

    // Create audit queue
    const auditContractAddress = process.env.AUDIT_CONTRACT_ADDRESS;
    if (!auditContractAddress) {
      throw new Error('Missing environment variable: AUDIT_CONTRACT_ADDRESS');
    }
    const contractWriter = new AuditContractWriter(auditContractAddress);
    const auditQueue = new AuditQueue(chainDriver, contractWriter);

    // Create proxy executor
    const executor = new ProxyExecutor(
      custody,
      config.server.readTimeoutMs,
      config.server.writeTimeoutMs
    );

    // Start HTTP server
    await startServer(config, chainDriver, custody, auditQueue, executor);

    logger.info('Server started successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();

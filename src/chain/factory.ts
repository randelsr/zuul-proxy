import type { AppConfig } from '../config/types.js';
import { getLogger } from '../logging.js';
import { ChainDriver } from './driver.js';
import { EVMChainDriver } from './evm.js';
import { HederaChainDriver } from './hedera.js';
import { LocalChainDriver } from './local.js';

const logger = getLogger('chain:factory');

/**
 * Create a chain driver based on configuration
 *
 * Supports:
 * - 'local': In-memory mock driver (testing, local dev)
 * - 'hedera': Hedera testnet driver (chain ID 295)
 * - 'base': Base Mainnet driver (chain ID 8453)
 * - 'arbitrum': Arbitrum One driver (chain ID 42161)
 * - 'optimism': Optimism Mainnet driver (chain ID 10)
 */
export function createChainDriver(config: AppConfig): ChainDriver {
  const chainName = config.chain.name;
  const rpcUrl = config.chain.rpcUrl;
  const chainId = config.chain.chainId;

  logger.debug({ chainName, chainId }, 'Creating chain driver');

  switch (chainName) {
    case 'local':
      logger.info({}, 'Using LocalChainDriver (in-memory mock)');
      return new LocalChainDriver();

    case 'hedera':
      logger.info({ chainId, rpcUrl }, 'Using HederaChainDriver');
      return new HederaChainDriver(rpcUrl);

    case 'base':
    case 'arbitrum':
    case 'optimism':
      logger.info({ chainName, chainId, rpcUrl }, 'Using EVMChainDriver');
      return new EVMChainDriver(chainName, rpcUrl, chainId);

    default:
      // Exhaustiveness check: TypeScript ensures all union members handled
      const _exhaustive: never = chainName;
      throw new Error(`Unsupported chain: ${_exhaustive}`);
  }
}

import fs from 'fs/promises';
import yaml from 'yaml';
import { validateConfig } from './schema.js';
import type { AppConfig, RawConfig } from './types.js';
import { getLogger } from '../logging.js';

const logger = getLogger('config:loader');

/**
 * Substitute environment variables in config object
 * Recursively replaces ${VAR_NAME} with process.env.VAR_NAME
 */
function substituteEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    // Replace ${ENV_VAR} with process.env.ENV_VAR
    return obj.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, varName: string) => {
      const value = process.env[varName];
      if (value === undefined) {
        throw new Error(`Environment variable ${varName} not found (referenced in config)`);
      }
      return value;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => substituteEnvVars(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVars(value);
    }
    return result;
  }

  return obj;
}

/**
 * Type for file reader function (injectable for testing)
 */
export type FileReader = (path: string) => Promise<string>;

/**
 * Default file reader using fs.readFile
 */
const defaultFileReader: FileReader = async (path: string) => {
  return fs.readFile(path, 'utf-8');
};

export async function loadConfig(
  filePath: string,
  fileReader: FileReader = defaultFileReader
): Promise<AppConfig> {
  logger.debug({ filePath }, 'Loading configuration from file');

  try {
    // Read file (injected for testing)
    const content = await fileReader(filePath);

    // Parse YAML
    let rawConfig = yaml.parse(content) as RawConfig;
    logger.debug({ rawConfig }, 'Parsed YAML');

    // Substitute environment variables (${VAR_NAME} → process.env.VAR_NAME)
    rawConfig = substituteEnvVars(rawConfig) as RawConfig;
    logger.debug('Environment variables substituted in config');

    // Validate against schema
    const config = validateConfig(rawConfig);
    logger.info(
      { tools: config.tools.length, roles: config.roles.length },
      'Configuration loaded and validated'
    );

    return config;
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ error: error.message, filePath }, 'Configuration load failed');
      throw new Error(`Failed to load config from ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Load config.yaml from current working directory
 * @returns Validated AppConfig
 */
export async function loadConfigDefault(): Promise<AppConfig> {
  return loadConfig('./config.yaml');
}

import type { ToolKey, Result } from '../types.js';
import { RequestError, ERRORS } from '../errors.js';
import type { AppConfig, ToolConfig } from '../config/types.js';
import { getLogger } from '../logging.js';

const logger = getLogger('proxy:tool-registry');

/**
 * Tool registry: map target URL → tool config
 * Uses longest prefix match on baseUrl
 *
 * Example:
 * - Tool: github → https://api.github.com
 * - Tool: slack → https://slack.com/api
 *
 * Request: https://api.github.com/repos/owner/repo
 * Match: longest prefix = https://api.github.com → tool: github
 *
 * Request: https://unknown-service.com/some/path
 * Match: none → 404 -32013
 */
export class ToolRegistry {
  private tools: Map<ToolKey, ToolConfig> = new Map();
  private baseUrls: Array<{ baseUrl: string; toolKey: ToolKey }> = [];

  constructor(config: AppConfig) {
    for (const tool of config.tools) {
      this.tools.set(tool.key, tool);
      this.baseUrls.push({ baseUrl: tool.baseUrl, toolKey: tool.key });
    }

    // Sort by length descending (longest match first)
    this.baseUrls.sort((a, b) => b.baseUrl.length - a.baseUrl.length);

    logger.info({ toolCount: this.tools.size }, 'Tool registry initialized');
  }

  /**
   * Find tool by target URL (longest prefix match)
   *
   * @param targetUrl Full target URL
   * @returns ToolConfig or RequestError (-32013 unknown tool)
   */
  findTool(targetUrl: string): Result<ToolConfig, RequestError> {
    logger.debug({ targetUrl }, 'Looking up tool');

    // Find longest prefix match
    for (const { baseUrl, toolKey } of this.baseUrls) {
      if (targetUrl.startsWith(baseUrl)) {
        const toolConfig = this.tools.get(toolKey);
        if (toolConfig) {
          logger.debug({ toolKey, baseUrl }, 'Tool found via longest prefix');
          return { ok: true, value: toolConfig };
        }
      }
    }

    // No match
    logger.warn({ targetUrl }, 'No tool matched for target URL');
    return {
      ok: false,
      error: new RequestError(
        `Unknown tool: target URL does not match any registered tool`,
        ERRORS.UNKNOWN_TOOL.code,
        ERRORS.UNKNOWN_TOOL.httpStatus,
        ERRORS.UNKNOWN_TOOL.errorType,
        { target_url: targetUrl }
      ),
    };
  }

  /**
   * Get tool by key (direct lookup)
   */
  getTool(toolKey: ToolKey): Result<ToolConfig, RequestError> {
    const tool = this.tools.get(toolKey);
    if (!tool) {
      return {
        ok: false,
        error: new RequestError(
          `Unknown tool: ${toolKey}`,
          ERRORS.UNKNOWN_TOOL.code,
          ERRORS.UNKNOWN_TOOL.httpStatus,
          ERRORS.UNKNOWN_TOOL.errorType,
          { tool_key: toolKey }
        ),
      };
    }
    return { ok: true, value: tool };
  }

  /**
   * List all tools
   */
  listTools(): ToolConfig[] {
    return Array.from(this.tools.values());
  }
}

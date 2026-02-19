/**
 * Proxy module barrel export
 * Unified entry point for HTTP forwarding, tool extraction, and action mapping
 */

export { inferAction } from './action-mapper.js';
export { ToolRegistry } from './tool-registry.js';
export { ProxyExecutor } from './executor.js';
export type { ExecutorResult, ForwardRequest } from './executor.js';

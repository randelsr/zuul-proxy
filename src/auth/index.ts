/**
 * Authentication module exports
 */

export {
  isAgentAddress,
  isNonce,
  isTimestamp,
  isHttpMethod,
  isPermissionAction,
  isRawSignatureHeaders,
} from './guards.js';
export {
  buildCanonicalPayload,
  hashPayload,
  recoverSigner,
  verifySignedRequest,
  NonceValidator,
  TimestampValidator,
} from './signature.js';

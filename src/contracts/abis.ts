/**
 * Smart contract ABIs for Zuul Proxy
 * Shared across chain drivers, audit writers, and admin handlers
 */

/**
 * RBAC contract ABI
 * Simplified design: single mapping (agent → roleId)
 * Presence = active, absence (0x0) = revoked
 */
export const RBAC_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
    name: 'getAgentRole',
    outputs: [
      { internalType: 'bytes32', name: 'roleId', type: 'bytes32' },
      { internalType: 'bool', name: 'isActive', type: 'bool' },
    ],
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
  {
    inputs: [
      { internalType: 'address', name: 'agent', type: 'address' },
      { internalType: 'bytes32', name: 'roleId', type: 'bytes32' },
    ],
    name: 'setAgentRole',
    outputs: [],
    stateMutability: 'nonpayable' as const,
    type: 'function' as const,
  },
  {
    inputs: [{ internalType: 'address', name: 'agent', type: 'address' }],
    name: 'emergencyRevoke',
    outputs: [],
    stateMutability: 'nonpayable' as const,
    type: 'function' as const,
  },
] as const;

/**
 * Audit contract ABI
 * Privacy-first design: only agent, timestamp, encrypted payload, and hash are visible
 */
export const AUDIT_ABI = [
  {
    name: 'recordEntry',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'encryptedPayload', type: 'bytes' },
      { name: 'payloadHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'getEntriesByAgent',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]' as const,
        components: [
          { name: 'agent', type: 'address' },
          { name: 'encryptedPayload', type: 'bytes' },
          { name: 'payloadHash', type: 'bytes32' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'getEntriesByTimeRange',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]' as const,
        components: [
          { name: 'agent', type: 'address' },
          { name: 'encryptedPayload', type: 'bytes' },
          { name: 'payloadHash', type: 'bytes32' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

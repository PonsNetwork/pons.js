/**
 * ABI definitions for Pons SDK
 */

/**
 * Smart Account ABI (minimal subset needed)
 */
export const SMART_ACCOUNT_ABI = [
  {
    type: 'function',
    name: 'executeWithFees',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'func', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'resolverFeeBps', type: 'uint256' },
      { name: 'expectedAmount', type: 'uint256' },
      { name: 'gasCostUSDC', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeWithResolverFunding',
    stateMutability: 'payable',
    inputs: [{ name: 'params', type: 'bytes' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getCCTPFlow',
    stateMutability: 'view',
    inputs: [{ name: 'nonce', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'indexer', type: 'address' },
          { name: 'executor', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'messageHash', type: 'bytes32' },
          { name: 'executed', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

/**
 * Smart Account Factory ABI
 */
export const FACTORY_ABI = [
  {
    type: 'function',
    name: 'getAddress',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ type: 'address' }],
  },
] as const;

/**
 * Token Messenger ABI (legacy - use PONS_GATEWAY_ABI instead)
 * @deprecated Use PonsGateway instead of calling TokenMessenger directly
 */
export const TOKEN_MESSENGER_ABI = [
  {
    type: 'function',
    name: 'depositForBurnWithHook',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ type: 'uint64' }],
  },
] as const;


/**
 * PonsGateway ABI - use this for all bridge operations
 */
export const PONS_GATEWAY_ABI = [
  {
    type: 'function',
    name: 'bridge',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ name: 'nonce', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'bridgeSimple',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'address' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ name: 'nonce', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'getTokenMessenger',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getUsdc',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'isDomainSupported',
    stateMutability: 'view',
    inputs: [{ name: 'domain', type: 'uint32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isPaused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'event',
    name: 'BridgeInitiated',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'mintRecipient', type: 'bytes32', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'destinationDomain', type: 'uint32', indexed: false },
      { name: 'nonce', type: 'uint64', indexed: false },
      { name: 'hookData', type: 'bytes', indexed: false },
    ],
  },
] as const;

/**
 * ERC20 ABI subset
 */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;
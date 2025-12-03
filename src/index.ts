// Pons SDK v1.0
// Cross-chain execution via Pons Network

// Main client
export { PonsClient } from './PonsClient.js';

// Types
export type {
  // Core types
  IAction,
  FeeConfig,
  Permit2Setup,
  FundingConfig,
  ActionOptions,
  
  // Chain config
  ChainConfig,
  
  // Transfer types
  CCTPTransferParams,
  TransferResult,
  TransferStatusUpdate,
  
  // Client config - Simple & Full
  SimplePonsConfig,
  PonsClientConfig,
  PonsConfig,
  WalletSigner,
  
  // Waku types
  TransferAnnouncement,
  MintCompleted,
  ActionExecuted,
  ValidationProofs,
  
  // Hook data
  HookData,
} from './types.js';

export { TransferStatus, isSimpleConfig } from './types.js';

// Actions
export { ActionBuilder, validateAction } from './actions/index.js';

// Signing
export {
  signAction,
  buildDomainSeparator,
  createWalletSigner,
  emptyFunding,
  emptyPermit2Setup,
} from './signing/index.js';

// CCTP
export {
  encodeHookData,
  decodeHookData,
  parseCCTPMessage,
  extractMessageSentEvent,
  addressToBytes32,
  bytes32ToAddress,
} from './cctp/index.js';

// Waku (legacy - prefer PonsGatewayClient)
export { WakuManager, WakuRestManager } from './waku/index.js';

// Pons Gateway (recommended)
export { PonsGatewayClient } from './gateway/index.js';
export type {
  PonsGatewayClientConfig,
  AnnounceResponse,
  TransferStatusResponse,
  NodeInfoResponse,
  TransfersResponse,
} from './gateway/index.js';

// Polling
export { TransferTracker } from './polling/index.js';

// Config & Chains
export { 
  arcTestnet, 
  sepolia, 
  ethereum, 
  createChainConfig,
  getChain,
  getFactory,
  isChainSupported,
  CHAINS,
  SUPPORTED_ROUTES,
  type SupportedChain,
  type FullChainConfig,
} from './config/chains.js';
export { 
  CCTP_DOMAINS, 
  CIRCLE_API, 
  WAKU_TOPICS, 
  DEFAULTS,
  WAKU_CONFIG,
  PONS_GATEWAY,
  getContentTopic,
  getPubsubTopic,
} from './config/constants.js';

// Utils
export {
  formatUSDC,
  parseUSDC,
  retryWithBackoff,
  waitFor,
  sleep,
  truncateAddress,
  calculateDeadline,
  isDeadlinePassed,
  formatTxHash,
  isValidAddress,
  isValidTxHash,
} from './utils/index.js';

// CREATE2 utilities for trustless address verification
export {
  computeCreate2Address,
  computeInitCodeHash,
  verifyCreate2Address,
  DEFAULT_INIT_CODE_HASH,
  type Create2Params,
} from './utils/create2.js';

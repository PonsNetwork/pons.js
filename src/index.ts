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
  ExecutionProgress,

  // Client config - Simple & Full
  SimplePonsConfig,
  PonsClientConfig,
  PonsConfig,
  WalletSigner,

  // Network message types
  TransferAnnouncement,
  MintCompleted,
  ActionExecuted,
  ValidationProofs,

  // Hook data
  HookData,
} from './types.js';

export { TransferStatus, isSimpleConfig, ExecutionStep } from './types.js';

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

// CCTP Fees & Fee Calculations
export {
  // Main functions for apps
  calculateFeesForBurn,
  calculateFeesSync,
  DEFAULT_FEES,

  // Reverse calculations for dynamic actions (NFTs, games, etc.)
  calculateBurnForAction,
  calculateFeesForActionType,
  validateActionFeasibility,

  // Lower-level functions
  fetchCCTPFees,
  calculateCCTPFee,
  getExpectedAmount,
  getMinimumBurnAmount,
  validateBurnAmount,
  calculateMinExpectedAmount,
  calculateMinBurnAmount,
  getFeeBreakdown,

  // Types
  type CCTPFeeConfig,
  type CCTPFeesResponse,
  type PonsFeeBreakdown,
} from './cctp/fees.js';

// Pons Gateway
export { PonsGatewayClient } from './gateway/index.js';
export type {
  PonsGatewayClientConfig,
  AnnounceResponse,
  TransferStatusResponse,
  NodeInfoResponse,
  TransfersResponse,
  ChainConfigResponse,
  GatewayConfigResponse,
} from './gateway/index.js';

// Polling
export { TransferTracker } from './polling/index.js';

// Config & Chains
export {
  Chain,
  arcTestnet,
  sepolia,
  ethereum,
  createChainConfig,
  getChain,
  getFactory,
  isChainSupported,
  CHAINS,
  SUPPORTED_ROUTES,
  type ChainName,
  type SupportedChain,
  type FullChainConfig,
} from './config/chains.js';
export {
  CCTP_DOMAINS,
  CIRCLE_API,
  DEFAULTS,
  PONS_GATEWAY,
  PONS_GATEWAY_ABI,
  ERC20_ABI,
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

// Widget - Web Component for dApp integration
// Exported via separate entry point: import { PonsWidget } from '@pons/sdk/widget'
// export { PonsWidget } from './widget/index.js';

// DEX Aggregators
export * as Aggregators from './aggregators/index.js';
export { KyberSwap } from './aggregators/kyberswap.js';
export type {
  SwapQuoteParams,
  SwapQuoteResult,
  BuildSwapParams,
  SwapDataResult,
  RouteSummary,
  RoutePool,
} from './aggregators/kyberswap.js';

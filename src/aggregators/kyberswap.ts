/**
 * KyberSwap Aggregator API Integration
 * 
 * Fetches optimal swap routes from KyberSwap Aggregator API.
 * Supports 100+ chains and provides encoded calldata for direct execution.
 * 
 * API Reference: https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator/aggregator-api-specification/evm-swaps
 * 
 * @example
 * ```ts
 * import { KyberSwap } from '@pons-network/pons.js/aggregators';
 * 
 * const quote = await KyberSwap.getQuote({
 *   chainId: 1, // Ethereum
 *   tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
 *   tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
 *   amountIn: 1000000000n, // 1000 USDC
 * });
 * 
 * const swapData = await KyberSwap.buildSwapData({
 *   chainId: 1,
 *   routeSummary: quote.routeSummary,
 *   sender: '0x...',
 *   recipient: '0x...',
 *   slippageTolerance: 50, // 0.5%
 * });
 * ```
 */

import type { Address, Hex } from 'viem';

// KyberSwap API base URL
const KYBERSWAP_API_BASE = 'https://aggregator-api.kyberswap.com';

// Chain ID to KyberSwap chain name mapping
const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  10: 'optimism',
  56: 'bsc',
  137: 'polygon',
  250: 'fantom',
  324: 'zksync',
  8453: 'base',
  42161: 'arbitrum',
  43114: 'avalanche',
  59144: 'linea',
  534352: 'scroll',
  11155111: 'sepolia', // Testnet - may have limited support
};

// Types
export interface SwapQuoteParams {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  /** Optional: Save gas by specifying known decimals */
  tokenInDecimals?: number;
  tokenOutDecimals?: number;
  /** Optional: Fee recipient address */
  feeReceiver?: Address;
  /** Optional: Fee amount in basis points (e.g., 10 = 0.1%) */
  feeBps?: number;
}

export interface RouteSummary {
  tokenIn: string;
  amountIn: string;
  amountInUsd: string;
  tokenOut: string;
  amountOut: string;
  amountOutUsd: string;
  gas: string;
  gasPrice: string;
  gasUsd: string;
  route: RoutePool[][];
  routeID?: string;
  checksum?: string;
  timestamp?: string;
  extraFee?: {
    feeAmount: string;
    chargeFeeBy: 'currency_in' | 'currency_out';
    isInBps: boolean;
    feeReceiver: string;
  };
}

export interface RoutePool {
  pool: string;
  tokenIn: string;
  tokenOut: string;
  swapAmount: string;
  amountOut: string;
  exchange: string;
  poolType: string;
  poolExtra?: string;
  extra?: string;
}

export interface SwapQuoteResult {
  code: number;
  message: string;
  routeSummary: RouteSummary;
  routerAddress: Address;
}

export interface BuildSwapParams {
  chainId: number;
  routeSummary: RouteSummary;
  sender: Address;
  recipient: Address;
  /** Slippage tolerance in basis points (e.g., 50 = 0.5%) */
  slippageTolerance: number;
  /** Optional: Deadline timestamp in seconds */
  deadline?: number;
  /** Optional: Permit signature for gasless approval */
  permit?: string;
  /** Optional: Source identifier for analytics */
  source?: string;
}

export interface SwapDataResult {
  code: number;
  message: string;
  data: {
    amountIn: string;
    amountInUsd: string;
    amountOut: string;
    amountOutUsd: string;
    gas: string;
    gasUsd: string;
    /** Encoded swap calldata - use this with the router */
    data: Hex;
    routerAddress: Address;
    /** Value to send with transaction (for native token swaps) */
    transactionValue?: string;
  };
}

/**
 * KyberSwap Aggregator API Client
 */
export class KyberSwap {
  private static getChainName(chainId: number): string {
    const name = CHAIN_NAMES[chainId];
    if (!name) {
      throw new Error(`KyberSwap: Unsupported chain ID ${chainId}. Supported: ${Object.keys(CHAIN_NAMES).join(', ')}`);
    }
    return name;
  }

  /**
   * Get a swap quote from KyberSwap Aggregator
   *
   * This returns the best route and expected output amount.
   * The routeSummary can be passed to buildSwapData to get encoded calldata.
   */
  static async getQuote(params: SwapQuoteParams): Promise<SwapQuoteResult> {
    const chain = this.getChainName(params.chainId);

    const queryParams = new URLSearchParams({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn.toString(),
    });

    if (params.feeReceiver) {
      queryParams.set('feeReceiver', params.feeReceiver);
    }
    if (params.feeBps !== undefined) {
      queryParams.set('chargeFeeBy', 'currency_in');
      queryParams.set('feeAmount', params.feeBps.toString());
      queryParams.set('isInBps', 'true');
    }

    const url = `${KYBERSWAP_API_BASE}/${chain}/api/v1/routes?${queryParams}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-client-id': 'pons-network',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`KyberSwap API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as SwapQuoteResult;

    if (result.code !== 0) {
      throw new Error(`KyberSwap quote error: ${result.message}`);
    }

    return result;
  }

  /**
   * Build encoded swap transaction data
   *
   * Takes a route summary from getQuote and returns encoded calldata
   * that can be used to execute the swap on-chain.
   */
  static async buildSwapData(params: BuildSwapParams): Promise<SwapDataResult> {
    const chain = this.getChainName(params.chainId);

    const url = `${KYBERSWAP_API_BASE}/${chain}/api/v1/route/build`;

    const body = {
      routeSummary: params.routeSummary,
      sender: params.sender,
      recipient: params.recipient,
      slippageTolerance: params.slippageTolerance,
      deadline: params.deadline,
      permit: params.permit,
      source: params.source ?? 'pons-network',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-client-id': 'pons-network',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`KyberSwap API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as SwapDataResult;

    if (result.code !== 0) {
      throw new Error(`KyberSwap build error: ${result.message}`);
    }

    return result;
  }

  /**
   * Get supported chain IDs
   */
  static getSupportedChainIds(): number[] {
    return Object.keys(CHAIN_NAMES).map(Number);
  }

  /**
   * Check if a chain is supported
   */
  static isChainSupported(chainId: number): boolean {
    return chainId in CHAIN_NAMES;
  }
}


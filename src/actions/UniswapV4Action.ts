import type { Address, Hex } from 'viem';
import { encodeFunctionData } from 'viem';
import type { ActionOptions } from '../types.js';

/**
 * Example Uniswap V4 swap action builder
 * This demonstrates how protocols can integrate with Pons
 */
export interface UniswapV4SwapParams {
  poolKey: {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
  };
  zeroForOne: boolean;
  amountSpecified: bigint;
  sqrtPriceLimitX96: bigint;
  hookData?: Hex;
}

/**
 * Build a Uniswap V4 swap action options
 * NOTE: This is a template - actual implementation would use Uniswap SDK
 * 
 * @example
 * const actionOptions = buildUniswapV4SwapOptions(params, routerAddress, usdcAddress);
 * const result = await pons.execute({ amount, action: actionOptions }, signer);
 */
export function buildUniswapV4SwapOptions(
  params: UniswapV4SwapParams,
  swapRouterAddress: Address,
  paymentToken: Address,
  indexerFee: bigint = 100000n,
  resolverFee: bigint = 200000n
): ActionOptions {
  // Validate swap parameters
  if (params.amountSpecified <= 0n) {
    throw new Error('Amount must be positive');
  }

  // In a real implementation, this would use @uniswap/v4-sdk
  // to build the proper calldata
  const calldata = encodeFunctionData({
    abi: [
      {
        name: 'swap',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          {
            name: 'key',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          {
            name: 'params',
            type: 'tuple',
            components: [
              { name: 'zeroForOne', type: 'bool' },
              { name: 'amountSpecified', type: 'int256' },
              { name: 'sqrtPriceLimitX96', type: 'uint160' },
            ],
          },
          { name: 'hookData', type: 'bytes' },
        ],
        outputs: [],
      },
    ],
    functionName: 'swap',
    args: [
      params.poolKey,
      {
        zeroForOne: params.zeroForOne,
        amountSpecified: params.amountSpecified,
        sqrtPriceLimitX96: params.sqrtPriceLimitX96,
      },
      params.hookData || '0x',
    ],
  });

  return {
    target: swapRouterAddress,
    callData: calldata,
    value: 0n,
    feeConfig: {
      paymentToken,
      indexerFee,
      resolverFee,
    },
  };
}

/**
 * Template for other protocols to follow
 */
export interface ProtocolActionBuilder<TParams> {
  buildActionOptions(params: TParams): ActionOptions;
  validateParams(params: TParams): void;
}


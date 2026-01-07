import type { Address, Hex } from 'viem';
import { encodeFunctionData } from 'viem';
import { ActionBuilder } from './ActionBuilder.js';
import type { IAction, FeeConfig } from '../types.js';

/**
 * SwapAndExecuteBuilder
 * 
 * Builds actions that swap USDC → required token, then execute user action.
 * This eliminates the need for resolvers to provide liquidity.
 * 
 * Flow:
 *   1. Approve PonsSwapModule to spend USDC
 *   2. Call PonsSwapModule.swapAndTransfer() to get required tokens
 *   3. Execute user's action with the swapped tokens
 * 
 * @example
 * // User wants to mint NFT costing 0.1 ETH
 * const action = new SwapAndExecuteBuilder(USDC, SWAP_MODULE)
 *   .swapToETH(parseEther('0.1'), minAmountOut, aggregator, swapData)
 *   .thenCall(NFT_CONTRACT, mintCalldata, parseEther('0.1'))
 *   .withFees(fees.indexerFee, fees.resolverFee)
 *   .build(nonce, deadline, fees.expectedAmount);
 */
export class SwapAndExecuteBuilder {
  private usdc: Address;
  private swapModule: Address;
  private swapCalls: Array<{ target: Address; callData: Hex; value: bigint }> = [];
  private actionCalls: Array<{ target: Address; callData: Hex; value: bigint }> = [];
  private feeConfig: FeeConfig | null = null;

  constructor(usdcAddress: Address, swapModuleAddress: Address) {
    this.usdc = usdcAddress;
    this.swapModule = swapModuleAddress;
  }

  /**
   * Swap USDC to ETH via aggregator
   */
  swapToETH(
    usdcAmount: bigint,
    minEthOut: bigint,
    aggregator: Address,
    swapData: Hex
  ): this {
    // Step 1: Approve swap module
    const approveCalldata = encodeFunctionData({
      abi: [{ name: 'approve', type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }],
      functionName: 'approve',
      args: [this.swapModule, usdcAmount],
    });
    this.swapCalls.push({ target: this.usdc, callData: approveCalldata, value: 0n });

    // Step 2: Swap via module
    const swapCalldata = encodeFunctionData({
      abi: SWAP_MODULE_ABI,
      functionName: 'swapAndTransfer',
      args: [
        this.usdc,           // tokenIn (USDC)
        '0x0000000000000000000000000000000000000000' as Address, // tokenOut (ETH)
        usdcAmount,          // amountIn
        minEthOut,           // minAmountOut
        aggregator,          // aggregator
        swapData,            // swapData
      ],
    });
    this.swapCalls.push({ target: this.swapModule, callData: swapCalldata, value: 0n });

    return this;
  }

  /**
   * Swap USDC to any ERC20 token via aggregator
   */
  swapToToken(
    tokenOut: Address,
    usdcAmount: bigint,
    minTokenOut: bigint,
    aggregator: Address,
    swapData: Hex
  ): this {
    // Step 1: Approve swap module
    const approveCalldata = encodeFunctionData({
      abi: [{ name: 'approve', type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }],
      functionName: 'approve',
      args: [this.swapModule, usdcAmount],
    });
    this.swapCalls.push({ target: this.usdc, callData: approveCalldata, value: 0n });

    // Step 2: Swap via module
    const swapCalldata = encodeFunctionData({
      abi: SWAP_MODULE_ABI,
      functionName: 'swapAndTransfer',
      args: [this.usdc, tokenOut, usdcAmount, minTokenOut, aggregator, swapData],
    });
    this.swapCalls.push({ target: this.swapModule, callData: swapCalldata, value: 0n });

    return this;
  }

  /**
   * Add the user's action call (executed after swap)
   */
  thenCall(target: Address, callData: Hex, value: bigint = 0n): this {
    this.actionCalls.push({ target, callData, value });
    return this;
  }

  /**
   * Set fee configuration
   */
  withFees(indexerFee: bigint, resolverFee: bigint): this {
    this.feeConfig = {
      paymentToken: this.usdc,
      indexerFee,
      resolverFee,
    };
    return this;
  }

  /**
   * Build the final action
   * V3: Now requires sourceChainId and targetChainId for cross-chain signatures
   */
  build(
    sourceChainId: bigint,
    targetChainId: bigint,
    nonce: bigint,
    deadline: bigint,
    expectedAmount: bigint
  ): IAction {
    if (!this.feeConfig) {
      throw new Error('Fees not configured. Call withFees() first.');
    }

    const allCalls = [...this.swapCalls, ...this.actionCalls];

    return {
      sourceChainId,
      targetChainId,
      targets: allCalls.map(c => c.target),
      callDatas: allCalls.map(c => c.callData),
      values: allCalls.map(c => c.value),
      nonce,
      deadline,
      expectedAmount,
      feeConfig: this.feeConfig,
      permit2Setup: [],
      funding: {
        ethNeeded: 0n,           // No resolver funding needed!
        tokensNeeded: [],
        tokenAmounts: [],
        maxReimbursement: 0n,    // No reimbursement needed!
      },
    };
  }
}

// ABI for PonsSwapModule
const SWAP_MODULE_ABI = [
  {
    name: 'swapAndTransfer',
    type: 'function',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'aggregator', type: 'address' },
      { name: 'swapData', type: 'bytes' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;


import type { Address, Hex } from 'viem';
import type { IAction, Permit2Setup, ActionOptions } from '../types.js';

/**
 * Pons ActionBuilder v2.0
 * 
 * Fluent API for building cross-chain actions
 * V2: Supports both single and batch (multi-step) actions
 * 
 * @example
 * // Single action - simple swap
 * const action = new ActionBuilder()
 *   .addCall(uniswapRouter, swapCalldata)
 *   .withFees(USDC, 100000n, 200000n)
 *   .build(nonce, deadline, bridgedAmount);
 * 
 * @example
 * // Batch action - approve + swap + stake
 * const action = new ActionBuilder()
 *   .addCall(USDC, approveCalldata)
 *   .addCall(uniswapRouter, swapCalldata)
 *   .addCall(lido, stakeCalldata, stakeValue)
 *   .withFees(USDC, 100000n, 500000n)
 *   .build(nonce, deadline, bridgedAmount);
 * 
 * @example
 * // DeFi deposit with Permit2
 * const action = new ActionBuilder()
 *   .addCall(aavePool, depositCalldata)
 *   .withPermit2(USDC, aavePool, amount)
 *   .withFees(USDC, 50000n, 100000n)
 *   .build(nonce, deadline, bridgedAmount);
 */
export class ActionBuilder {
  // V2: Store calls as arrays for batch support
  private _calls: Array<{
    target: Address;
    callData: Hex;
    value: bigint;
  }> = [];
  
  private _isNoAction: boolean = false;  // Flag for simple bridge (no action)
  
  // Fees
  private _paymentToken: Address = '0x0000000000000000000000000000000000000000';
  private _indexerFee: bigint = 0n;
  private _relayerFee: bigint = 0n;
  
  // Permit2
  private _permit2Setup: Permit2Setup[] = [];
  
  // Funding
  private _ethNeeded: bigint = 0n;
  private _tokensNeeded: Address[] = [];
  private _tokenAmounts: bigint[] = [];
  private _maxReimbursement: bigint = 0n;

  // ============ Core Methods ============

  /**
   * Add a contract call to the action (can be called multiple times for batch)
   * @param target Contract address to call
   * @param callData Encoded function call
   * @param value Optional ETH value to send with this call
   */
  addCall(target: Address, callData: Hex, value: bigint = 0n): this {
    this._calls.push({ target, callData, value });
    this._isNoAction = false;
    return this;
  }

  /**
   * Legacy method - equivalent to addCall() for single action
   * @deprecated Use addCall() instead
   */
  call(target: Address, callData: Hex): this {
    // Clear any existing calls and add this one
    this._calls = [{ target, callData, value: 0n }];
    this._isNoAction = false;
    return this;
  }

  /**
   * Create a simple bridge action (no execution, USDC stays in SmartAccount)
   * Use this when user just wants to bridge USDC without any action
   */
  noAction(): this {
    this._calls = [];
    this._isNoAction = true;
    return this;
  }

  /**
   * Set ETH value for the LAST added call
   * For more control, pass value directly to addCall()
   */
  withValue(value: bigint): this {
    if (this._calls.length > 0) {
      this._calls[this._calls.length - 1].value = value;
    }
    return this;
  }

  // ============ Fee Methods ============

  /**
   * Set fee configuration
   */
  withFees(paymentToken: Address, indexerFee: bigint, relayerFee: bigint): this {
    this._paymentToken = paymentToken;
    this._indexerFee = indexerFee;
    this._relayerFee = relayerFee;
    return this;
  }

  // ============ Permit2 Methods ============

  /**
   * Add a Permit2 token approval
   */
  withPermit2(token: Address, spender: Address, amount: bigint): this {
    this._permit2Setup.push({ token, spender, amount });
    return this;
  }

  /**
   * Add multiple Permit2 token approvals
   */
  withPermit2Batch(permits: Permit2Setup[]): this {
    this._permit2Setup.push(...permits);
    return this;
  }

  // ============ Funding Methods ============

  /**
   * Request relayer to provide ETH
   * @param ethNeeded Amount of ETH needed
   * @param reimbursement How much USDC to pay relayer for fronting
   */
  needsEth(ethNeeded: bigint, reimbursement: bigint): this {
    this._ethNeeded = ethNeeded;
    this._maxReimbursement += reimbursement;
    return this;
  }

  /**
   * Request relayer to provide a token
   * @param token Token address
   * @param amount Amount needed
   * @param reimbursement How much USDC to pay relayer for fronting
   */
  needsToken(token: Address, amount: bigint, reimbursement: bigint): this {
    this._tokensNeeded.push(token);
    this._tokenAmounts.push(amount);
    this._maxReimbursement += reimbursement;
    return this;
  }

  /**
   * Set maximum reimbursement directly
   */
  withReimbursement(maxReimbursement: bigint): this {
    this._maxReimbursement = maxReimbursement;
    return this;
  }

  // ============ Build Methods ============

  /**
   * Build the complete action
   * @param nonce Unique nonce for replay protection
   * @param deadline Timestamp when action expires
   * @param expectedAmount Amount of USDC being bridged
   */
  build(nonce: bigint, deadline: bigint, expectedAmount: bigint): IAction {
    // Handle no-action case (simple bridge)
    if (this._isNoAction || this._calls.length === 0) {
      // For no-action, we still need arrays (empty or with zero address)
      return {
        targets: ['0x0000000000000000000000000000000000000000'],
        callDatas: ['0x'],
        values: [0n],
        nonce,
        deadline,
        expectedAmount,
        feeConfig: {
          paymentToken: this._paymentToken,
          indexerFee: this._indexerFee,
          relayerFee: this._relayerFee,
        },
        permit2Setup: this._permit2Setup,
        funding: {
          ethNeeded: this._ethNeeded,
          tokensNeeded: this._tokensNeeded,
          tokenAmounts: this._tokenAmounts,
          maxReimbursement: this._maxReimbursement,
        },
      };
    }

    // Validate required fields
    if (this._paymentToken === '0x0000000000000000000000000000000000000000') {
      throw new Error('ActionBuilder: fees not set. Call .withFees(token, indexer, relayer) first');
    }

    return {
      targets: this._calls.map(c => c.target),
      callDatas: this._calls.map(c => c.callData),
      values: this._calls.map(c => c.value),
      nonce,
      deadline,
      expectedAmount,
      feeConfig: {
        paymentToken: this._paymentToken,
        indexerFee: this._indexerFee,
        relayerFee: this._relayerFee,
      },
      permit2Setup: this._permit2Setup,
      funding: {
        ethNeeded: this._ethNeeded,
        tokensNeeded: this._tokensNeeded,
        tokenAmounts: this._tokenAmounts,
        maxReimbursement: this._maxReimbursement,
      },
    };
  }

  /**
   * Reset the builder for reuse
   */
  reset(): this {
    this._calls = [];
    this._isNoAction = false;
    this._paymentToken = '0x0000000000000000000000000000000000000000';
    this._indexerFee = 0n;
    this._relayerFee = 0n;
    this._permit2Setup = [];
    this._ethNeeded = 0n;
    this._tokensNeeded = [];
    this._tokenAmounts = [];
    this._maxReimbursement = 0n;
    return this;
  }

  // ============ Static Factory Methods ============

  /**
   * Create action from ActionOptions (nested struct format)
   * Supports both single action (target/callData) and batch (targets/callDatas)
   */
  static fromOptions(
    options: ActionOptions,
    nonce: bigint,
    deadline: bigint,
    expectedAmount: bigint
  ): IAction {
    const builder = new ActionBuilder();
    
    // Check if batch format is used (takes precedence)
    if (options.targets && options.targets.length > 0) {
      // Batch format
      const values = options.values || options.targets.map(() => 0n);
      const callDatas = options.callDatas || options.targets.map(() => '0x' as Hex);
      
      for (let i = 0; i < options.targets.length; i++) {
        builder.addCall(options.targets[i], callDatas[i], values[i]);
      }
    } else if (options.target) {
      // Single action format (legacy)
      const isNoAction = options.target === '0x0000000000000000000000000000000000000000' && 
                         (!options.callData || options.callData === '0x');
      
      if (isNoAction) {
        builder.noAction();
      } else {
        builder.addCall(options.target, options.callData || '0x', options.value || 0n);
      }
    } else {
      // No action specified
      builder.noAction();
    }
    
    builder.withFees(
      options.feeConfig.paymentToken,
      options.feeConfig.indexerFee,
      options.feeConfig.relayerFee
    );

    // Add Permit2 if specified
    if (options.permit2Setup) {
      builder.withPermit2Batch(options.permit2Setup);
    }

    // Add funding if specified (nested struct)
    if (options.funding) {
      builder._ethNeeded = options.funding.ethNeeded;
      builder._maxReimbursement = options.funding.maxReimbursement;
      
      // Handle tokensNeeded and tokenAmounts arrays
      if (options.funding.tokensNeeded && options.funding.tokenAmounts) {
        for (let i = 0; i < options.funding.tokensNeeded.length; i++) {
          builder._tokensNeeded.push(options.funding.tokensNeeded[i]);
          builder._tokenAmounts.push(options.funding.tokenAmounts[i]);
        }
      }
    }

    return builder.build(nonce, deadline, expectedAmount);
  }

  /**
   * Create a simple USDC transfer action
   */
  static transfer(
    recipient: Address,
    amount: bigint,
    usdcAddress: Address = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' // Sepolia USDC
  ): ActionOptions {
    // Encode transfer(address,uint256)
    const transferSelector = '0xa9059cbb';
    const callData = (transferSelector + 
      recipient.slice(2).padStart(64, '0') + 
      amount.toString(16).padStart(64, '0')) as Hex;
    
    return {
      target: usdcAddress,
      callData,
      value: 0n,
      feeConfig: {
        paymentToken: usdcAddress,
        indexerFee: 0n,
        relayerFee: 0n,
      },
    };
  }

  /**
   * Create a simple contract call action
   */
  static simpleCall(
    target: Address,
    callData: Hex,
    paymentToken: Address,
    indexerFee: bigint,
    relayerFee: bigint,
    nonce: bigint,
    deadline: bigint,
    expectedAmount: bigint
  ): IAction {
    return new ActionBuilder()
      .addCall(target, callData)
      .withFees(paymentToken, indexerFee, relayerFee)
      .build(nonce, deadline, expectedAmount);
  }
}

// ============ Helper Functions ============

/**
 * Validate an action before signing
 * @param action The action to validate
 * @param allowNoAction If true, allows empty/zero targets (simple bridge with no action)
 * @param protocolFeeBps Protocol fee in basis points (default: 10 = 0.1%)
 */
export function validateAction(action: IAction, allowNoAction: boolean = true, protocolFeeBps: bigint = 10n): void {
  // Check if this is a no-action (simple bridge)
  const isNoAction = action.targets.length === 0 || 
    (action.targets.length === 1 && 
     action.targets[0] === '0x0000000000000000000000000000000000000000' && 
     (!action.callDatas[0] || action.callDatas[0] === '0x'));
  
  // Only validate targets/callDatas if not a no-action
  if (!isNoAction) {
    if (action.targets.length === 0) {
      throw new Error('Invalid action: no targets specified');
    }

    if (action.targets.length !== action.callDatas.length || 
        action.targets.length !== action.values.length) {
      throw new Error('Invalid action: arrays length mismatch');
    }

    for (let i = 0; i < action.targets.length; i++) {
      if (!action.targets[i] || action.targets[i] === '0x0000000000000000000000000000000000000000') {
        throw new Error(`Invalid target address at index ${i}`);
      }
    }
  } else if (!allowNoAction) {
    throw new Error('No-action (simple bridge) not allowed for this operation');
  }

  if (!action.feeConfig.paymentToken || action.feeConfig.paymentToken === '0x0000000000000000000000000000000000000000') {
    throw new Error('Invalid payment token');
  }

  if (action.nonce <= 0n) {
    throw new Error('Invalid nonce');
  }

  if (action.deadline <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error('Deadline has passed');
  }

  if (action.expectedAmount <= 0n) {
    throw new Error('Invalid expected amount');
  }

  // Calculate protocol fee (percentage of expectedAmount)
  const protocolFee = (action.expectedAmount * protocolFeeBps) / 10000n;
  
  // Validate that expectedAmount covers all fees and costs
  const totalFees = action.feeConfig.indexerFee + action.feeConfig.relayerFee + action.funding.maxReimbursement + protocolFee;
  if (action.expectedAmount < totalFees) {
    const shortfall = Number(totalFees - action.expectedAmount) / 1e6;
    throw new Error(
      `Insufficient amount for fees: expected ${Number(action.expectedAmount) / 1e6} USDC, ` +
      `but need ${Number(totalFees) / 1e6} USDC ` +
      `(indexer: ${Number(action.feeConfig.indexerFee) / 1e6}, ` +
      `relayer: ${Number(action.feeConfig.relayerFee) / 1e6}, ` +
      `protocol: ${Number(protocolFee) / 1e6}, ` +
      `reimbursement: ${Number(action.funding.maxReimbursement) / 1e6}). ` +
      `Shortfall: ${shortfall.toFixed(6)} USDC. ` +
      `💡 Increase burn amount to cover all fees.`
    );
  }

  // Validate funding arrays match
  if (action.funding.tokensNeeded.length !== action.funding.tokenAmounts.length) {
    throw new Error('Funding tokens and amounts mismatch');
  }
}

import type { Address, Hex } from 'viem';

/**
 * Pons Intent Framework - SDK for DApp Developers
 * 
 * This allows DApp developers to create custom intents for their use cases.
 * Users sign intents declaring desired outcomes, not specific actions.
 * 
 * @example NFT Marketplace DApp
 * ```typescript
 * class NFTBuyIntent extends IntentBuilder<NFTBuyParams> {
 *   protected encodeIntentData(params: NFTBuyParams): Hex {
 *     return encodeAbiParameters(
 *       [
 *         { type: 'address', name: 'collection' },
 *         { type: 'uint256', name: 'minNFTs' },
 *         { type: 'uint256', name: 'maxPriceEach' }
 *       ],
 *       [params.collection, params.minNFTs, params.maxPriceEach]
 *     );
 *   }
 *   
 *   getValidatorAddress(): Address {
 *     return '0x...' // Your deployed NFTBuyValidator contract
 *   }
 * }
 * 
 * // Usage in your DApp
 * const intent = new NFTBuyIntent()
 *   .setOutcome({ collection: boredApes, minNFTs: 3, maxPriceEach: 10e18 })
 *   .setFees(USDC, 0.1e6, 0.5e6) // indexer + solver fees
 *   .setMaxPayment(50e6) // Max 50 USDC total
 *   .build(nonce, deadline);
 * 
 * await user.signIntent(intent);
 * ```
 */

/**
 * Base intent parameters that all intents must have
 */
export interface BaseIntentParams {
  /** Maximum total payment (fees + execution costs) */
  maxPayment: bigint;
  
  /** Token to pay fees in (usually USDC) */
  paymentToken: Address;
  
  /** Fee for indexer (who mints USDC via CCTP) */
  indexerFee: bigint;
  
  /** Fee for solver (who finds and executes solution) */
  solverFee: bigint;
  
  /** Optional: If solver needs to front ETH/tokens */
  funding?: FundingConfig;
}

/**
 * Funding configuration (if solver fronts assets)
 */
export interface FundingConfig {
  ethNeeded: bigint;
  tokensNeeded: Address[];
  tokenAmounts: bigint[];
  maxReimbursement: bigint;
}

/**
 * Complete intent ready for signing
 */
export interface Intent {
  validator: Address;
  intentData: Hex;
  paymentToken: Address;
  maxPayment: bigint;
  deadline: bigint;
  nonce: bigint;
  indexerFee: bigint;
  solverFee: bigint;
  funding: FundingConfig;
}

/**
 * Abstract base class for DApp developers to extend
 * 
 * @typeParam TParams - Your DApp-specific intent parameters
 * 
 * @example
 * ```typescript
 * interface MyGameIntentParams {
 *   questId: number;
 *   targetScore: bigint;
 *   maxAttempts: number;
 * }
 * 
 * class GameQuestIntent extends IntentBuilder<MyGameIntentParams> {
 *   protected encodeIntentData(params: MyGameIntentParams): Hex {
 *     return encodeAbiParameters(
 *       [
 *         { type: 'uint256', name: 'questId' },
 *         { type: 'uint256', name: 'targetScore' },
 *         { type: 'uint8', name: 'maxAttempts' }
 *       ],
 *       [BigInt(params.questId), params.targetScore, params.maxAttempts]
 *     );
 *   }
 *   
 *   getValidatorAddress(): Address {
 *     return '0xYourGameValidator';
 *   }
 * }
 * ```
 */
export abstract class IntentBuilder<TParams = any> {
  protected _outcomeParams?: TParams;
  protected _paymentToken: Address = '0x0000000000000000000000000000000000000000';
  protected _maxPayment: bigint = 0n;
  protected _indexerFee: bigint = 0n;
  protected _solverFee: bigint = 0n;
  protected _funding?: FundingConfig;

  /**
   * Set the desired outcome (DApp-specific parameters)
   * 
   * @param params Your custom intent parameters
   * @example
   * ```typescript
   * .setOutcome({
   *   collection: '0x...',
   *   minNFTs: 3,
   *   maxPriceEach: parseEther('10')
   * })
   * ```
   */
  setOutcome(params: TParams): this {
    this._outcomeParams = params;
    return this;
  }

  /**
   * Set fees for indexer and solver
   * 
   * @param paymentToken Token to pay fees in (usually USDC)
   * @param indexerFee Fee for indexer (who mints USDC)
   * @param solverFee Fee for solver (who finds solution)
   */
  setFees(paymentToken: Address, indexerFee: bigint, solverFee: bigint): this {
    this._paymentToken = paymentToken;
    this._indexerFee = indexerFee;
    this._solverFee = solverFee;
    return this;
  }

  /**
   * Set maximum total payment
   * 
   * This includes fees + execution costs.
   * User won't pay more than this amount.
   * 
   * @param maxPayment Maximum USDC to spend
   */
  setMaxPayment(maxPayment: bigint): this {
    this._maxPayment = maxPayment;
    return this;
  }

  /**
   * Set funding requirements (if solver needs to front ETH/tokens)
   * 
   * @param ethNeeded ETH solver must send
   * @param tokensNeeded Tokens solver must transfer
   * @param tokenAmounts Amounts for each token
   * @param maxReimbursement Max USDC to reimburse solver
   */
  needsFunding(
    ethNeeded: bigint,
    tokensNeeded: Address[],
    tokenAmounts: bigint[],
    maxReimbursement: bigint
  ): this {
    this._funding = {
      ethNeeded,
      tokensNeeded,
      tokenAmounts,
      maxReimbursement,
    };
    return this;
  }

  /**
   * Build the complete intent
   * 
   * @param nonce Unique nonce for replay protection
   * @param deadline Timestamp when intent expires
   * @returns Complete intent ready for signing
   */
  build(nonce: bigint, deadline: bigint): Intent {
    if (!this._outcomeParams) {
      throw new Error('Intent outcome not set. Call .setOutcome() first.');
    }

    if (this._paymentToken === '0x0000000000000000000000000000000000000000') {
      throw new Error('Payment token not set. Call .setFees() first.');
    }

    if (this._maxPayment === 0n) {
      throw new Error('Max payment not set. Call .setMaxPayment() first.');
    }

    // Validate maxPayment covers fees
    const minPayment = this._indexerFee + this._solverFee + (this._funding?.maxReimbursement || 0n);
    if (this._maxPayment < minPayment) {
      throw new Error(
        `maxPayment (${this._maxPayment}) must be >= fees (${minPayment})`
      );
    }

    return {
      validator: this.getValidatorAddress(),
      intentData: this.encodeIntentData(this._outcomeParams),
      paymentToken: this._paymentToken,
      maxPayment: this._maxPayment,
      deadline,
      nonce,
      indexerFee: this._indexerFee,
      solverFee: this._solverFee,
      funding: this._funding || {
        ethNeeded: 0n,
        tokensNeeded: [],
        tokenAmounts: [],
        maxReimbursement: 0n,
      },
    };
  }

  /**
   * Get the validator contract address for this intent type
   * 
   * DApp developers must implement this to return their deployed validator.
   * 
   * @returns Address of your deployed IntentValidator contract
   */
  protected abstract getValidatorAddress(): Address;

  /**
   * Encode intent parameters into bytes
   * 
   * DApp developers must implement this to encode their custom parameters.
   * 
   * @param params Your DApp-specific intent parameters
   * @returns ABI-encoded intent data
   * 
   * @example
   * ```typescript
   * protected encodeIntentData(params: SwapIntentParams): Hex {
   *   return encodeAbiParameters(
   *     [
   *       { type: 'address', name: 'outputToken' },
   *       { type: 'uint256', name: 'minOutput' }
   *     ],
   *     [params.outputToken, params.minOutput]
   *   );
   * }
   * ```
   */
  protected abstract encodeIntentData(params: TParams): Hex;

  /**
   * Reset the builder for reuse
   */
  reset(): this {
    this._outcomeParams = undefined;
    this._paymentToken = '0x0000000000000000000000000000000000000000';
    this._maxPayment = 0n;
    this._indexerFee = 0n;
    this._solverFee = 0n;
    this._funding = undefined;
    return this;
  }
}

/**
 * Helper: Validate intent before signing
 * 
 * @param intent Intent to validate
 * @throws Error if intent is invalid
 */
export function validateIntent(intent: Intent): void {
  if (!intent.validator || intent.validator === '0x0000000000000000000000000000000000000000') {
    throw new Error('Invalid validator address');
  }

  if (!intent.intentData || intent.intentData === '0x') {
    throw new Error('Intent data is empty');
  }

  if (intent.deadline <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error('Intent deadline has passed');
  }

  if (intent.nonce <= 0n) {
    throw new Error('Invalid nonce');
  }

  const minPayment = intent.indexerFee + intent.solverFee + intent.funding.maxReimbursement;
  if (intent.maxPayment < minPayment) {
    throw new Error(
      `Insufficient maxPayment: ${intent.maxPayment} < ${minPayment} (fees)`
    );
  }
}


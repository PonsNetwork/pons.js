/**
 * CCTP Fee Utilities
 * 
 * Fetches and calculates CCTP transfer fees from Circle's API
 * Also handles protocol fee calculations for Pons SmartAccount
 * 
 * The SDK automatically handles all fee calculations when building actions.
 * Apps just need to provide the burn amount and the SDK calculates:
 * - CCTP fee (deducted by Circle during transfer)
 * - Protocol fee (percentage of expectedAmount)
 * - Amount available for action (after all fees)
 */

// Default fee values (can be overridden)
export const DEFAULT_FEES = {
  CCTP_FEE_BPS: 1n,        // 0.01% (1 basis point)
  PROTOCOL_FEE_BPS: 10n,   // 0.1% (10 basis points)
  INDEXER_FEE: 100000n,    // 0.1 USDC
  RELAYER_FEE: 150000n,    // 0.15 USDC
} as const;

export interface CCTPFeeConfig {
  finalityThreshold: number;
  minimumFee: number;
}

export interface CCTPFeesResponse {
  fees: CCTPFeeConfig[];
}

/**
 * Complete fee breakdown for a Pons transfer
 */
export interface PonsFeeBreakdown {
  /** Original amount user wants to burn */
  burnAmount: bigint;
  /** CCTP fee deducted during transfer */
  cctpFee: bigint;
  /** Amount received after CCTP (what goes in signature) */
  expectedAmount: bigint;
  /** Protocol fee (percentage of expectedAmount) */
  protocolFee: bigint;
  /** Indexer fee (fixed) */
  indexerFee: bigint;
  /** Relayer fee (fixed) */
  relayerFee: bigint;
  /** Reimbursement for relayer funding */
  reimbursement: bigint;
  /** Total fees to be paid from expectedAmount */
  totalFees: bigint;
  /** Amount left for the action after all fees */
  amountForAction: bigint;
}

/**
 * Fetch CCTP fees from Circle's API
 * 
 * @param sourceDomain CCTP source domain ID
 * @param destDomain CCTP destination domain ID
 * @param circleApiUrl Circle API URL (defaults to sandbox)
 * @returns Array of fee configs for different finality thresholds
 * 
 * @example
 * // Sepolia (domain 0) to Arc Testnet (domain 26)
 * const fees = await fetchCCTPFees(0, 26);
 * // Returns: [{"finalityThreshold":1000,"minimumFee":1},{"finalityThreshold":2000,"minimumFee":0}]
 */
export async function fetchCCTPFees(
  sourceDomain: number,
  destDomain: number,
  circleApiUrl: string = 'https://iris-api-sandbox.circle.com/v2'
): Promise<CCTPFeeConfig[]> {
  const url = `${circleApiUrl}/burn/USDC/fees/${sourceDomain}/${destDomain}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`⚠️ Failed to fetch CCTP fees from ${url}: ${response.status}`);
      return []; // Return empty array if API fails
    }
    
    const data = await response.json() as CCTPFeeConfig[];
    return data;
  } catch (error) {
    console.warn(`⚠️ Error fetching CCTP fees:`, error);
    return []; // Return empty array on error
  }
}

/**
 * Calculate the fee that will be deducted from a CCTP transfer
 * 
 * CCTP fees are based on the burn amount and finality threshold.
 * The fee with the lowest finality threshold is typically used.
 * 
 * @param burnAmount Amount being burned (in USDC wei, e.g., 15000000 for 15 USDC)
 * @param feeConfigs Fee configurations from Circle API
 * @returns Fee amount in USDC wei
 * 
 * @example
 * const fees = await fetchCCTPFees(0, 26);
 * const burnAmount = 15000000n; // 15 USDC
 * const fee = calculateCCTPFee(burnAmount, fees);
 * // Returns: 1500n (0.0015 USDC for 0.01% fee)
 */
export function calculateCCTPFee(
  burnAmount: bigint,
  feeConfigs: CCTPFeeConfig[]
): bigint {
  if (feeConfigs.length === 0) {
    // If no fee configs, assume 0.01% (conservative estimate)
    return (burnAmount * 1n) / 10000n;
  }
  
  // Sort by finality threshold (lowest first)
  const sorted = [...feeConfigs].sort((a, b) => a.finalityThreshold - b.finalityThreshold);
  
  // Use the fee with the lowest finality threshold (fastest, typically has fee)
  const applicableFee = sorted[0];
  
  if (applicableFee.minimumFee === 0) {
    // No fee
    return 0n;
  }
  
  // minimumFee is in basis points (e.g., 1 = 0.01%)
  // Fee = (amount * minimumFee) / 10000
  return (burnAmount * BigInt(applicableFee.minimumFee)) / 10000n;
}

/**
 * Get the expected amount after CCTP fees
 * 
 * This is what the user will actually receive on the destination chain.
 * Use this when building actions to ensure correct expectedAmount.
 * 
 * @param burnAmount Amount being burned
 * @param sourceDomain Source CCTP domain
 * @param destDomain Destination CCTP domain
 * @param circleApiUrl Circle API URL
 * @returns Expected amount after fees
 * 
 * @example
 * const burnAmount = 15000000n; // 15 USDC
 * const expectedAmount = await getExpectedAmount(burnAmount, 0, 26);
 * // Returns: 14998500n (14.9985 USDC after 0.01% fee)
 */
export async function getExpectedAmount(
  burnAmount: bigint,
  sourceDomain: number,
  destDomain: number,
  circleApiUrl?: string
): Promise<bigint> {
  const feeConfigs = await fetchCCTPFees(sourceDomain, destDomain, circleApiUrl);
  const fee = calculateCCTPFee(burnAmount, feeConfigs);
  
  const expectedAmount = burnAmount - fee;
  
  if (fee > 0n) {
    console.log(`💰 [CCTP Fees] Burn: ${Number(burnAmount) / 1e6} USDC, Fee: ${Number(fee) / 1e6} USDC, Expected: ${Number(expectedAmount) / 1e6} USDC`);
  }
  
  return expectedAmount;
}

/**
 * Calculate minimum burn amount needed to receive a target amount after fees
 * 
 * Use this when you know how much the user needs to receive (e.g., to pay for fees + action)
 * and want to calculate how much they need to burn.
 * 
 * @param targetAmount Amount needed after CCTP fees
 * @param sourceDomain Source CCTP domain
 * @param destDomain Destination CCTP domain
 * @param circleApiUrl Circle API URL
 * @returns Minimum burn amount
 * 
 * @example
 * // User needs 15 USDC after fees for indexer (0.1) + relayer (0.15) + action (14.75)
 * const burnAmount = await getMinimumBurnAmount(15000000n, 0, 26);
 * // Returns: 15001500n (15.0015 USDC to burn to get 15 USDC after 0.01% fee)
 */
export async function getMinimumBurnAmount(
  targetAmount: bigint,
  sourceDomain: number,
  destDomain: number,
  circleApiUrl?: string
): Promise<bigint> {
  const feeConfigs = await fetchCCTPFees(sourceDomain, destDomain, circleApiUrl);
  
  if (feeConfigs.length === 0 || feeConfigs[0].minimumFee === 0) {
    // No fee
    return targetAmount;
  }
  
  // Get fee basis points
  const sorted = [...feeConfigs].sort((a, b) => a.finalityThreshold - b.finalityThreshold);
  const feeBps = BigInt(sorted[0].minimumFee);
  
  // To receive targetAmount after fee:
  // burnAmount - (burnAmount * feeBps / 10000) = targetAmount
  // burnAmount * (10000 - feeBps) / 10000 = targetAmount
  // burnAmount = targetAmount * 10000 / (10000 - feeBps)
  const burnAmount = (targetAmount * 10000n) / (10000n - feeBps);
  
  console.log(`💰 [CCTP Fees] Target: ${Number(targetAmount) / 1e6} USDC, Need to burn: ${Number(burnAmount) / 1e6} USDC`);
  
  return burnAmount;
}

/**
 * Calculate minimum expectedAmount needed to cover all fees (including protocol fee)
 * 
 * The protocol fee is calculated as a percentage of expectedAmount, creating a circular dependency:
 *   expectedAmount = indexerFee + relayerFee + protocolFee + reimbursement + amountForAction
 *   protocolFee = expectedAmount * protocolFeeBps / 10000
 * 
 * Solving for expectedAmount:
 *   expectedAmount = (otherFees + amountForAction) * 10000 / (10000 - protocolFeeBps)
 * 
 * @param indexerFee Fee for indexer
 * @param relayerFee Fee for relayer
 * @param reimbursement Reimbursement for relayer
 * @param amountForAction USDC needed for the action itself (0 if action uses other tokens)
 * @param protocolFeeBps Protocol fee in basis points (e.g., 10 = 0.1%)
 * @returns Minimum expectedAmount needed
 */
export function calculateMinExpectedAmount(
  indexerFee: bigint,
  relayerFee: bigint,
  reimbursement: bigint,
  amountForAction: bigint,
  protocolFeeBps: bigint
): bigint {
  const baseCost = indexerFee + relayerFee + reimbursement + amountForAction;
  
  if (protocolFeeBps === 0n) {
    return baseCost;
  }
  
  // expectedAmount = baseCost * 10000 / (10000 - protocolFeeBps)
  // Add 1 to round up and ensure we have enough
  const minExpectedAmount = (baseCost * 10000n + (10000n - protocolFeeBps - 1n)) / (10000n - protocolFeeBps);
  
  return minExpectedAmount;
}

/**
 * Calculate minimum burn amount needed to cover all fees
 * 
 * This accounts for:
 * 1. CCTP fee (deducted during cross-chain transfer)
 * 2. Protocol fee (percentage of expectedAmount)
 * 3. Indexer fee (fixed)
 * 4. Relayer fee (fixed)
 * 5. Reimbursement (for ETH/tokens fronted by relayer)
 * 6. Amount needed for the action itself
 * 
 * @param indexerFee Fee for indexer
 * @param relayerFee Fee for relayer
 * @param reimbursement Reimbursement for relayer
 * @param amountForAction USDC needed for the action (0 if using other tokens)
 * @param protocolFeeBps Protocol fee in basis points
 * @param sourceDomain Source CCTP domain
 * @param destDomain Destination CCTP domain
 * @param circleApiUrl Circle API URL
 * @returns Minimum burn amount needed
 */
export async function calculateMinBurnAmount(
  indexerFee: bigint,
  relayerFee: bigint,
  reimbursement: bigint,
  amountForAction: bigint,
  protocolFeeBps: bigint,
  sourceDomain: number,
  destDomain: number,
  circleApiUrl?: string
): Promise<bigint> {
  // Step 1: Calculate minimum expectedAmount needed after all fees
  const minExpectedAmount = calculateMinExpectedAmount(
    indexerFee, relayerFee, reimbursement, amountForAction, protocolFeeBps
  );
  
  // Step 2: Calculate burn amount needed to achieve this expectedAmount (accounting for CCTP fee)
  const burnAmount = await getMinimumBurnAmount(minExpectedAmount, sourceDomain, destDomain, circleApiUrl);
  
  console.log(`💰 [Fee Calculation]`);
  console.log(`   Indexer fee: ${Number(indexerFee) / 1e6} USDC`);
  console.log(`   Relayer fee: ${Number(relayerFee) / 1e6} USDC`);
  console.log(`   Reimbursement: ${Number(reimbursement) / 1e6} USDC`);
  console.log(`   Amount for action: ${Number(amountForAction) / 1e6} USDC`);
  console.log(`   Protocol fee: ${Number(protocolFeeBps) / 100}%`);
  console.log(`   Min expectedAmount: ${Number(minExpectedAmount) / 1e6} USDC`);
  console.log(`   Min burn amount: ${Number(burnAmount) / 1e6} USDC`);
  
  return burnAmount;
}

/**
 * Get complete fee breakdown for a Pons transfer
 * 
 * @param burnAmount Amount to burn
 * @param indexerFee Fee for indexer
 * @param relayerFee Fee for relayer
 * @param reimbursement Reimbursement for relayer
 * @param protocolFeeBps Protocol fee in basis points
 * @param sourceDomain Source CCTP domain
 * @param destDomain Destination CCTP domain
 * @param circleApiUrl Circle API URL
 * @returns Complete fee breakdown
 */
export async function getFeeBreakdown(
  burnAmount: bigint,
  indexerFee: bigint,
  relayerFee: bigint,
  reimbursement: bigint,
  protocolFeeBps: bigint,
  sourceDomain: number,
  destDomain: number,
  circleApiUrl?: string
): Promise<PonsFeeBreakdown> {
  const feeConfigs = await fetchCCTPFees(sourceDomain, destDomain, circleApiUrl);
  const cctpFee = calculateCCTPFee(burnAmount, feeConfigs);
  const expectedAmount = burnAmount - cctpFee;
  
  const protocolFee = (expectedAmount * protocolFeeBps) / 10000n;
  const totalFees = protocolFee + indexerFee + relayerFee + reimbursement;
  const amountForAction = expectedAmount > totalFees ? expectedAmount - totalFees : 0n;
  
  return {
    burnAmount,
    cctpFee,
    expectedAmount,
    protocolFee,
    indexerFee,
    relayerFee,
    reimbursement,
    totalFees,
    amountForAction,
  };
}

/**
 * Validate that a burn amount will be sufficient for fees and action
 * 
 * @param burnAmount Amount user wants to burn
 * @param indexerFee Fee for indexer
 * @param relayerFee Fee for relayer/executor
 * @param reimbursement Reimbursement for relayer (for ETH/tokens fronted)
 * @param protocolFeeBps Protocol fee in basis points (e.g., 10 = 0.1%)
 * @param sourceDomain Source CCTP domain
 * @param destDomain Destination CCTP domain
 * @param circleApiUrl Circle API URL
 * @returns Validation result with details
 */
export async function validateBurnAmount(
  burnAmount: bigint,
  indexerFee: bigint,
  relayerFee: bigint,
  reimbursement: bigint,
  protocolFeeBps: bigint,
  sourceDomain: number,
  destDomain: number,
  circleApiUrl?: string
): Promise<{
  sufficient: boolean;
  breakdown: PonsFeeBreakdown;
  message: string;
}> {
  const breakdown = await getFeeBreakdown(
    burnAmount, indexerFee, relayerFee, reimbursement, 
    protocolFeeBps, sourceDomain, destDomain, circleApiUrl
  );
  
  if (breakdown.expectedAmount < breakdown.totalFees) {
    const shortfall = breakdown.totalFees - breakdown.expectedAmount;
    return {
      sufficient: false,
      breakdown,
      message: `Insufficient amount: burning ${Number(burnAmount) / 1e6} USDC yields ${Number(breakdown.expectedAmount) / 1e6} USDC, but need ${Number(breakdown.totalFees) / 1e6} USDC for fees (shortfall: ${Number(shortfall) / 1e6} USDC)`
    };
  }
  
  return {
    sufficient: true,
    breakdown,
    message: `Valid: burning ${Number(burnAmount) / 1e6} USDC yields ${Number(breakdown.expectedAmount) / 1e6} USDC, with ${Number(breakdown.amountForAction) / 1e6} USDC left for action after fees`
  };
}

/**
 * Calculate all fees for a given burn amount
 * 
 * This is the main function apps should use to determine fee breakdowns.
 * Returns all fee components and the amount available for action/reimbursement.
 * 
 * @param burnAmount Amount user wants to burn
 * @param options Optional fee overrides (uses defaults if not provided)
 * @returns Complete fee breakdown
 * 
 * @example
 * // Get fee breakdown for 15 USDC
 * const fees = await calculateFeesForBurn(15000000n);
 * console.log(fees.amountForAction); // Amount available for swap/reimbursement
 * console.log(fees.expectedAmount);  // Amount for signature
 * 
 * @example
 * // Use in landing page
 * const fees = await calculateFeesForBurn(parseUnits(userInput, 6));
 * const ethForSwap = calculateEthFromUsdc(fees.amountForAction);
 * 
 * const transferParams = {
 *   amount: burnAmount,
 *   action: {
 *     feeConfig: {
 *       indexerFee: fees.indexerFee,
 *       relayerFee: fees.relayerFee,
 *     },
 *     funding: {
 *       maxReimbursement: fees.amountForAction,
 *       ethNeeded: ethForSwap,
 *     },
 *   },
 * };
 */
export async function calculateFeesForBurn(
  burnAmount: bigint,
  options?: {
    indexerFee?: bigint;
    relayerFee?: bigint;
    protocolFeeBps?: bigint;
    sourceDomain?: number;
    destDomain?: number;
    circleApiUrl?: string;
  }
): Promise<{
  burnAmount: bigint;
  cctpFee: bigint;
  expectedAmount: bigint;
  protocolFee: bigint;
  indexerFee: bigint;
  relayerFee: bigint;
  totalFees: bigint;
  amountForAction: bigint;
}> {
  const indexerFee = options?.indexerFee ?? DEFAULT_FEES.INDEXER_FEE;
  const relayerFee = options?.relayerFee ?? DEFAULT_FEES.RELAYER_FEE;
  const protocolFeeBps = options?.protocolFeeBps ?? DEFAULT_FEES.PROTOCOL_FEE_BPS;
  const sourceDomain = options?.sourceDomain ?? 0;
  const destDomain = options?.destDomain ?? 26;
  
  // Get CCTP fee
  const feeConfigs = await fetchCCTPFees(sourceDomain, destDomain, options?.circleApiUrl);
  const cctpFee = calculateCCTPFee(burnAmount, feeConfigs);
  
  // Calculate amounts
  const expectedAmount = burnAmount - cctpFee;
  const protocolFee = (expectedAmount * protocolFeeBps) / 10000n;
  const totalFees = protocolFee + indexerFee + relayerFee;
  const amountForAction = expectedAmount > totalFees ? expectedAmount - totalFees : 0n;
  
  return {
    burnAmount,
    cctpFee,
    expectedAmount,
    protocolFee,
    indexerFee,
    relayerFee,
    totalFees,
    amountForAction,
  };
}

/**
 * Synchronous fee calculation (uses default CCTP fee of 0.01%)
 * Use this when you don't want to make API calls
 * 
 * @example
 * const fees = calculateFeesSync(15000000n);
 */
export function calculateFeesSync(
  burnAmount: bigint,
  options?: {
    indexerFee?: bigint;
    relayerFee?: bigint;
    protocolFeeBps?: bigint;
    cctpFeeBps?: bigint;
  }
): {
  burnAmount: bigint;
  cctpFee: bigint;
  expectedAmount: bigint;
  protocolFee: bigint;
  indexerFee: bigint;
  relayerFee: bigint;
  totalFees: bigint;
  amountForAction: bigint;
} {
  const indexerFee = options?.indexerFee ?? DEFAULT_FEES.INDEXER_FEE;
  const relayerFee = options?.relayerFee ?? DEFAULT_FEES.RELAYER_FEE;
  const protocolFeeBps = options?.protocolFeeBps ?? DEFAULT_FEES.PROTOCOL_FEE_BPS;
  const cctpFeeBps = options?.cctpFeeBps ?? DEFAULT_FEES.CCTP_FEE_BPS;
  
  // Calculate CCTP fee
  const cctpFee = (burnAmount * cctpFeeBps) / 10000n;
  
  // Calculate amounts
  const expectedAmount = burnAmount - cctpFee;
  const protocolFee = (expectedAmount * protocolFeeBps) / 10000n;
  const totalFees = protocolFee + indexerFee + relayerFee;
  const amountForAction = expectedAmount > totalFees ? expectedAmount - totalFees : 0n;
  
  return {
    burnAmount,
    cctpFee,
    expectedAmount,
    protocolFee,
    indexerFee,
    relayerFee,
    totalFees,
    amountForAction,
  };
}

// ============================================================================
// REVERSE CALCULATIONS - For Dynamic Actions (NFTs, Games, DeFi, etc.)
// ============================================================================

/**
 * REVERSE CALCULATION: Calculate how much to burn for a desired action amount
 * 
 * Use this for dynamic actions where you know how much you NEED for the action
 * (e.g., NFT price, game action cost, DeFi deposit).
 * 
 * @param actionAmount How much USDC you need for the action/reimbursement
 * @param options Fee options
 * @returns Full fee breakdown with required burn amount
 * 
 * @example
 * // NFT costs 10 USDC - how much should user burn?
 * const fees = calculateBurnForAction(10_000000n);
 * console.log(fees.burnAmount); // ~10.28 USDC (includes all fees)
 * 
 * @example
 * // Game action needs 5 USDC
 * const fees = calculateBurnForAction(5_000000n);
 * const transferParams = {
 *   amount: fees.burnAmount,
 *   action: {
 *     feeConfig: { indexerFee: fees.indexerFee, relayerFee: fees.relayerFee },
 *     funding: { maxReimbursement: actionAmount },
 *   },
 * };
 */
export function calculateBurnForAction(
  actionAmount: bigint,
  options?: {
    indexerFee?: bigint;
    relayerFee?: bigint;
    protocolFeeBps?: bigint;
    cctpFeeBps?: bigint;
  }
): {
  burnAmount: bigint;
  cctpFee: bigint;
  expectedAmount: bigint;
  protocolFee: bigint;
  indexerFee: bigint;
  relayerFee: bigint;
  totalFees: bigint;
  amountForAction: bigint;
} {
  const indexerFee = options?.indexerFee ?? DEFAULT_FEES.INDEXER_FEE;
  const relayerFee = options?.relayerFee ?? DEFAULT_FEES.RELAYER_FEE;
  const protocolFeeBps = options?.protocolFeeBps ?? DEFAULT_FEES.PROTOCOL_FEE_BPS;
  const cctpFeeBps = options?.cctpFeeBps ?? DEFAULT_FEES.CCTP_FEE_BPS;
  
  // Work backwards from actionAmount:
  // actionAmount = expectedAmount - protocolFee - indexerFee - relayerFee
  // actionAmount = expectedAmount - (expectedAmount * protocolFeeBps / 10000) - indexerFee - relayerFee
  // actionAmount = expectedAmount * (1 - protocolFeeBps/10000) - indexerFee - relayerFee
  // actionAmount + indexerFee + relayerFee = expectedAmount * (10000 - protocolFeeBps) / 10000
  // expectedAmount = (actionAmount + indexerFee + relayerFee) * 10000 / (10000 - protocolFeeBps)
  
  const baseNeeded = actionAmount + indexerFee + relayerFee;
  const expectedAmount = (baseNeeded * 10000n) / (10000n - protocolFeeBps);
  
  // Now calculate burn amount from expectedAmount:
  // expectedAmount = burnAmount - cctpFee = burnAmount - (burnAmount * cctpFeeBps / 10000)
  // expectedAmount = burnAmount * (1 - cctpFeeBps/10000) = burnAmount * (10000 - cctpFeeBps) / 10000
  // burnAmount = expectedAmount * 10000 / (10000 - cctpFeeBps)
  
  const burnAmount = (expectedAmount * 10000n) / (10000n - cctpFeeBps);
  
  // Recalculate fees for verification
  const cctpFee = burnAmount - expectedAmount;
  const protocolFee = (expectedAmount * protocolFeeBps) / 10000n;
  const totalFees = protocolFee + indexerFee + relayerFee;
  
  return {
    burnAmount,
    cctpFee,
    expectedAmount,
    protocolFee,
    indexerFee,
    relayerFee,
    totalFees,
    amountForAction: actionAmount, // This is what we targeted
  };
}

/**
 * Calculate fees for different action types
 * 
 * This helper determines the right calculation based on action type:
 * - 'swap': User provides ETH value needed, SDK calculates USDC reimbursement
 * - 'purchase': User provides exact cost (NFT, game item), SDK calculates burn
 * - 'deposit': User provides deposit amount, SDK calculates burn
 * - 'bridge': Simple bridge, no action cost, just fees
 * 
 * @example
 * // Buying an NFT for 10 USDC
 * const fees = calculateFeesForActionType('purchase', { actionCost: 10_000000n });
 * 
 * @example
 * // Swapping for ETH (relayer provides ETH, gets USDC back)
 * const fees = calculateFeesForActionType('swap', { reimbursement: 14_000000n });
 * 
 * @example
 * // Simple bridge to smart account
 * const fees = calculateFeesForActionType('bridge', { burnAmount: 15_000000n });
 */
export function calculateFeesForActionType(
  actionType: 'swap' | 'purchase' | 'deposit' | 'bridge',
  params: {
    burnAmount?: bigint;      // For 'bridge' and 'swap' - user specifies burn
    actionCost?: bigint;      // For 'purchase' and 'deposit' - action cost known
    reimbursement?: bigint;   // For 'swap' - what relayer gets back
    indexerFee?: bigint;
    relayerFee?: bigint;
    protocolFeeBps?: bigint;
    cctpFeeBps?: bigint;
  }
): {
  burnAmount: bigint;
  cctpFee: bigint;
  expectedAmount: bigint;
  protocolFee: bigint;
  indexerFee: bigint;
  relayerFee: bigint;
  totalFees: bigint;
  amountForAction: bigint;
  actionType: string;
} {
  const feeOptions = {
    indexerFee: params.indexerFee,
    relayerFee: params.relayerFee,
    protocolFeeBps: params.protocolFeeBps,
    cctpFeeBps: params.cctpFeeBps,
  };
  
  let result;
  
  switch (actionType) {
    case 'purchase':
    case 'deposit':
      // User knows exactly what they need for the action
      if (!params.actionCost) {
        throw new Error(`${actionType} requires actionCost parameter`);
      }
      result = calculateBurnForAction(params.actionCost, feeOptions);
      break;
      
    case 'swap':
      // User specifies burn amount OR reimbursement
      if (params.reimbursement) {
        result = calculateBurnForAction(params.reimbursement, feeOptions);
      } else if (params.burnAmount) {
        result = calculateFeesSync(params.burnAmount, feeOptions);
      } else {
        throw new Error('swap requires either burnAmount or reimbursement');
      }
      break;
      
    case 'bridge':
    default:
      // Simple bridge - user specifies burn amount
      if (!params.burnAmount) {
        throw new Error('bridge requires burnAmount parameter');
      }
      result = calculateFeesSync(params.burnAmount, feeOptions);
      break;
  }
  
  return { ...result, actionType };
}

/**
 * Validate if an action is feasible with the given burn amount
 * 
 * @example
 * // Check if 15 USDC is enough to buy a 14 USDC NFT
 * const result = validateActionFeasibility(15_000000n, 14_000000n);
 * if (!result.feasible) {
 *   console.log(result.message);
 *   console.log(`Need at least: ${result.minimumBurn} USDC`);
 * }
 */
export function validateActionFeasibility(
  burnAmount: bigint,
  actionCost: bigint,
  options?: {
    indexerFee?: bigint;
    relayerFee?: bigint;
    protocolFeeBps?: bigint;
    cctpFeeBps?: bigint;
  }
): {
  feasible: boolean;
  burnAmount: bigint;
  amountForAction: bigint;
  actionCost: bigint;
  surplus: bigint;
  shortfall: bigint;
  minimumBurn: bigint;
  message: string;
} {
  const feesFromBurn = calculateFeesSync(burnAmount, options);
  const feesForAction = calculateBurnForAction(actionCost, options);
  
  const feasible = feesFromBurn.amountForAction >= actionCost;
  const surplus = feasible ? feesFromBurn.amountForAction - actionCost : 0n;
  const shortfall = feasible ? 0n : actionCost - feesFromBurn.amountForAction;
  
  return {
    feasible,
    burnAmount,
    amountForAction: feesFromBurn.amountForAction,
    actionCost,
    surplus,
    shortfall,
    minimumBurn: feesForAction.burnAmount,
    message: feasible 
      ? `✅ Feasible: ${Number(burnAmount) / 1e6} USDC provides ${Number(feesFromBurn.amountForAction) / 1e6} USDC for action (${Number(surplus) / 1e6} USDC surplus)`
      : `❌ Insufficient: ${Number(burnAmount) / 1e6} USDC only provides ${Number(feesFromBurn.amountForAction) / 1e6} USDC, but action needs ${Number(actionCost) / 1e6} USDC. Minimum burn: ${Number(feesForAction.burnAmount) / 1e6} USDC`,
  };
}


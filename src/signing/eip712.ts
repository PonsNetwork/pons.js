import type { Address, Hex } from 'viem';
import type { IAction, WalletSigner, FundingConfig, Permit2Setup } from '../types.js';

/**
 * Pons SDK EIP-712 Signing v3.0
 *
 * V3: Supports cross-chain signatures (sourceChainId, targetChainId)
 *     - User signs on source chain (their current network)
 *     - Action executes on target chain (destination)
 *     - No MetaMask network switching required!
 *
 * V2: Supports batch actions (arrays of targets/values/callDatas)
 *
 * Single, unified signing function that supports all action features:
 * - Cross-chain signatures (sign on chain A, execute on chain B)
 * - Batch actions (1 to N contract calls)
 * - Permit2 token approvals
 * - Resolver funding (ETH and tokens)
 * - Customizable fees
 */

// ============ EIP-712 Domain ============

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

/**
 * Build EIP-712 domain separator
 * @param sourceChainId The chain where user is signing (their current network)
 *                      This allows signing on one chain for execution on another
 * @param smartAccountAddress The user's smart account address (same on all chains via CREATE2)
 */
export function buildDomainSeparator(
  sourceChainId: number,
  smartAccountAddress: Address
): EIP712Domain {
  return {
    name: 'PonsSmartAccount',
    version: '1',
    chainId: sourceChainId,
    verifyingContract: smartAccountAddress,
  };
}

// ============ EIP-712 Types ============

/**
 * EIP-712 types using nested structs
 * V3: Updated for cross-chain signatures (sourceChainId, targetChainId)
 * Matches SmartAccount.sol type hashes
 */
const ACTION_TYPES = {
  Action: [
    { name: 'sourceChainId', type: 'uint256' },
    { name: 'targetChainId', type: 'uint256' },
    { name: 'targets', type: 'address[]' },
    { name: 'values', type: 'uint256[]' },
    { name: 'callDatas', type: 'bytes[]' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'expectedAmount', type: 'uint256' },
    { name: 'feeConfig', type: 'FeeConfig' },
    { name: 'permit2Setup', type: 'Permit2Setup[]' },
    { name: 'fundingConfig', type: 'FundingConfig' },
  ],
  FeeConfig: [
    { name: 'paymentToken', type: 'address' },
    { name: 'indexerFee', type: 'uint256' },
    { name: 'resolverFee', type: 'uint256' },
  ],
  FundingConfig: [
    { name: 'ethNeeded', type: 'uint256' },
    { name: 'tokensNeeded', type: 'address[]' },
    { name: 'tokenAmounts', type: 'uint256[]' },
    { name: 'maxReimbursement', type: 'uint256' },
  ],
  Permit2Setup: [
    { name: 'token', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'amount', type: 'uint160' },
  ],
};

// ============ Main Signing Function ============

/**
 * Sign a Pons action with EIP-712
 *
 * V3: Supports cross-chain signatures
 *     - sourceChainId: chain where user is signing (from action)
 *     - targetChainId: chain where action will execute (from action)
 *     - User stays on their current network, no MetaMask switching required!
 *
 * This single function handles all action types:
 * - Cross-chain signatures (sign on chain A, execute on chain B)
 * - Single action (arrays of length 1)
 * - Batch actions (arrays of length N)
 * - Actions with Permit2
 * - Actions requiring resolver funding
 * - Custom fee configurations
 *
 * @param action The complete action to sign (includes sourceChainId and targetChainId)
 * @param smartAccountAddress The user's smart account address
 * @param signer The wallet signer
 * @returns The EIP-712 signature
 */
export async function signAction(
  action: IAction,
  smartAccountAddress: Address,
  signer: WalletSigner
): Promise<Hex> {
  // Use sourceChainId (user's current chain) for domain separator
  // This allows signing on one chain for execution on another
  const domain = buildDomainSeparator(Number(action.sourceChainId), smartAccountAddress);

  // Build message with nested structs (matches SmartAccount.sol v3)
  const message = {
    // Cross-chain signature fields
    sourceChainId: action.sourceChainId,
    targetChainId: action.targetChainId,
    // Core action fields
    targets: action.targets,
    values: action.values,
    callDatas: action.callDatas,
    nonce: action.nonce,
    deadline: action.deadline,
    expectedAmount: action.expectedAmount,
    // Nested FeeConfig struct
    feeConfig: {
      paymentToken: action.feeConfig.paymentToken,
      indexerFee: action.feeConfig.indexerFee,
      resolverFee: action.feeConfig.resolverFee,
    },
    // Permit2Setup array
    permit2Setup: action.permit2Setup.map(p => ({
      token: p.token,
      spender: p.spender,
      amount: p.amount,
    })),
    // Nested FundingConfig struct
    fundingConfig: {
      ethNeeded: action.funding.ethNeeded,
      tokensNeeded: action.funding.tokensNeeded,
      tokenAmounts: action.funding.tokenAmounts,
      maxReimbursement: action.funding.maxReimbursement,
    },
  };

  try {
    const signature = await signer.signTypedData({
      domain,
      types: ACTION_TYPES,
      primaryType: 'Action',
      message,
    });

    return signature;
  } catch (error) {
    throw new Error(`Failed to sign action: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============ Wallet Signer Helpers ============

/**
 * Create a wallet signer wrapper for different wallet types
 * Supports: viem, wagmi, Privy, MetaMask, etc.
 */
export function createWalletSigner(signer: any): WalletSigner {
  // Check if it's already compatible
  if (signer.address && typeof signer.signTypedData === 'function') {
    return signer as WalletSigner;
  }

  // Handle viem wallet client
  if (signer.account && typeof signer.signTypedData === 'function') {
    return {
      address: signer.account.address,
      signTypedData: async (args: any) => {
        return await signer.signTypedData(args);
      },
      signMessage: async (args: any) => {
        if (typeof signer.signMessage === 'function') {
          return await signer.signMessage(args);
        }
        throw new Error('signMessage not supported');
      },
    };
  }

  // Handle Privy embedded wallet
  if (signer.address && signer.signTypedData) {
    return {
      address: signer.address as Address,
      signTypedData: async (args: any) => {
        return await signer.signTypedData(args);
      },
      signMessage: async (args: any) => {
        if (typeof signer.signMessage === 'function') {
          return await signer.signMessage(args);
        }
        throw new Error('signMessage not supported');
      },
    };
  }

  throw new Error('Unsupported wallet signer type');
}

// ============ Utility Functions ============

/**
 * Create an empty FundingConfig
 */
export function emptyFunding(): FundingConfig {
  return {
    ethNeeded: 0n,
    tokensNeeded: [],
    tokenAmounts: [],
    maxReimbursement: 0n,
  };
}

/**
 * Create an empty Permit2Setup array
 */
export function emptyPermit2Setup(): Permit2Setup[] {
  return [];
}

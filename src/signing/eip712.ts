import type { Address, Hex } from 'viem';
import type { IAction, WalletSigner, FundingConfig, Permit2Setup } from '../types.js';

/**
 * Pons SDK EIP-712 Signing v2.0
 * 
 * V2: Supports batch actions (arrays of targets/values/callDatas)
 * 
 * Single, unified signing function that supports all action features:
 * - Batch actions (1 to N contract calls)
 * - Permit2 token approvals
 * - Relayer funding (ETH and tokens)
 * - Customizable fees
 */

// ============ EIP-712 Domain ============

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export function buildDomainSeparator(
  chainId: number,
  smartAccountAddress: Address
): EIP712Domain {
  return {
    name: 'PonsSmartAccount',
    version: '1',
    chainId,
    verifyingContract: smartAccountAddress,
  };
}

// ============ EIP-712 Types ============

/**
 * EIP-712 types using nested structs
 * V2: Updated for batch actions (arrays)
 * Matches SmartAccount.sol type hashes
 */
const ACTION_TYPES = {
  Action: [
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
    { name: 'relayerFee', type: 'uint256' },
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
 * V2: Supports batch actions with arrays
 * 
 * This single function handles all action types:
 * - Single action (arrays of length 1)
 * - Batch actions (arrays of length N)
 * - Actions with Permit2
 * - Actions requiring relayer funding
 * - Custom fee configurations
 * 
 * @param action The complete action to sign
 * @param smartAccountAddress The user's smart account address
 * @param chainId The destination chain ID
 * @param signer The wallet signer
 * @returns The EIP-712 signature
 */
export async function signAction(
  action: IAction,
  smartAccountAddress: Address,
  chainId: number,
  signer: WalletSigner
): Promise<Hex> {
  const domain = buildDomainSeparator(chainId, smartAccountAddress);

  // Build message with nested structs (matches SmartAccount.sol v2)
  const message = {
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
      relayerFee: action.feeConfig.relayerFee,
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

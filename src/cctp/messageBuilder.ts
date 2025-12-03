import type { Address, Hex, Log } from 'viem';
import { encodeAbiParameters, decodeAbiParameters } from 'viem';
import type { IAction, HookData, Permit2Setup } from '../types.js';

/**
 * Pons CCTP Message Builder v2.0
 * 
 * Encodes and decodes hook data for CCTP messages.
 * V2: Supports batch actions (arrays of targets/values/callDatas)
 */

// ============ Hook Data Encoding ============

/**
 * Encode hook data for CCTP message
 * 
 * V2: Supports batch actions with arrays
 * This single function supports all action features:
 * - Batch actions (targets[], callDatas[], values[])
 * - Fee configuration
 * - Permit2 setup
 * - Relayer funding
 */
export function encodeHookData(action: IAction, signature: Hex): Hex {
  return encodeAbiParameters(
    [
      // Core execution (V2: arrays for batch support)
      { type: 'address[]', name: 'targets' },
      { type: 'uint256[]', name: 'values' },
      { type: 'bytes[]', name: 'callDatas' },
      
      // Timing
      { type: 'uint256', name: 'nonce' },
      { type: 'uint256', name: 'deadline' },
      
      // Bridged amount
      { type: 'uint256', name: 'expectedAmount' },
      
      // Fees
      { type: 'address', name: 'paymentToken' },
      { type: 'uint256', name: 'indexerFee' },
      { type: 'uint256', name: 'relayerFee' },
      
      // Permit2 setup (as tuple array)
      { type: 'tuple[]', name: 'permit2Setup', components: [
        { type: 'address', name: 'token' },
        { type: 'address', name: 'spender' },
        { type: 'uint160', name: 'amount' },
      ]},
      
      // Funding
      { type: 'uint256', name: 'ethNeeded' },
      { type: 'address[]', name: 'tokensNeeded' },
      { type: 'uint256[]', name: 'tokenAmounts' },
      { type: 'uint256', name: 'maxReimbursement' },
      
      // Signature
      { type: 'bytes', name: 'signature' },
      
      // Version marker (2 for v2.0 with batch support)
      { type: 'uint8', name: 'version' },
    ],
    [
      action.targets,
      action.values,
      action.callDatas,
      action.nonce,
      action.deadline,
      action.expectedAmount,
      action.feeConfig.paymentToken,
      action.feeConfig.indexerFee,
      action.feeConfig.relayerFee,
      action.permit2Setup.map(p => ({ token: p.token, spender: p.spender, amount: p.amount })),
      action.funding.ethNeeded,
      action.funding.tokensNeeded,
      action.funding.tokenAmounts,
      action.funding.maxReimbursement,
      signature,
      2, // Version 2.0 (batch support)
    ]
  );
}

// ============ Hook Data Decoding ============

/**
 * Decode hook data from CCTP message
 * V2: Returns arrays for batch action support
 */
export function decodeHookData(hookData: Hex): HookData {
  const decoded = decodeAbiParameters(
    [
      { type: 'address[]', name: 'targets' },
      { type: 'uint256[]', name: 'values' },
      { type: 'bytes[]', name: 'callDatas' },
      { type: 'uint256', name: 'nonce' },
      { type: 'uint256', name: 'deadline' },
      { type: 'uint256', name: 'expectedAmount' },
      { type: 'address', name: 'paymentToken' },
      { type: 'uint256', name: 'indexerFee' },
      { type: 'uint256', name: 'relayerFee' },
      { type: 'tuple[]', name: 'permit2Setup', components: [
        { type: 'address', name: 'token' },
        { type: 'address', name: 'spender' },
        { type: 'uint160', name: 'amount' },
      ]},
      { type: 'uint256', name: 'ethNeeded' },
      { type: 'address[]', name: 'tokensNeeded' },
      { type: 'uint256[]', name: 'tokenAmounts' },
      { type: 'uint256', name: 'maxReimbursement' },
      { type: 'bytes', name: 'signature' },
      { type: 'uint8', name: 'version' },
    ],
    hookData
  );

  // Parse Permit2Setup array
  const permit2SetupRaw = decoded[9] as readonly { token: Address; spender: Address; amount: bigint }[];
  const permit2Setup: Permit2Setup[] = permit2SetupRaw.map((p) => ({
    token: p.token,
    spender: p.spender,
    amount: p.amount,
  }));

  return {
    targets: [...(decoded[0] as readonly Address[])],
    values: [...(decoded[1] as readonly bigint[])],
    callDatas: [...(decoded[2] as readonly Hex[])],
    nonce: decoded[3] as bigint,
    deadline: decoded[4] as bigint,
    expectedAmount: decoded[5] as bigint,
    signature: decoded[14] as Hex,
    feeConfig: {
      paymentToken: decoded[6] as Address,
      indexerFee: decoded[7] as bigint,
      relayerFee: decoded[8] as bigint,
    },
    permit2Setup,
    funding: {
      ethNeeded: decoded[10] as bigint,
      tokensNeeded: [...(decoded[11] as readonly Address[])],
      tokenAmounts: [...(decoded[12] as readonly bigint[])],
      maxReimbursement: decoded[13] as bigint,
    },
  };
}

/**
 * Decode hook data v1 format (legacy single action)
 * Use this if you need to support old messages
 */
export function decodeHookDataV1(hookData: Hex): HookData {
  const decoded = decodeAbiParameters(
    [
      { type: 'address', name: 'target' },
      { type: 'uint256', name: 'value' },
      { type: 'bytes', name: 'callData' },
      { type: 'uint256', name: 'nonce' },
      { type: 'uint256', name: 'deadline' },
      { type: 'uint256', name: 'expectedAmount' },
      { type: 'address', name: 'paymentToken' },
      { type: 'uint256', name: 'indexerFee' },
      { type: 'uint256', name: 'relayerFee' },
      { type: 'tuple[]', name: 'permit2Setup', components: [
        { type: 'address', name: 'token' },
        { type: 'address', name: 'spender' },
        { type: 'uint160', name: 'amount' },
      ]},
      { type: 'uint256', name: 'ethNeeded' },
      { type: 'address[]', name: 'tokensNeeded' },
      { type: 'uint256[]', name: 'tokenAmounts' },
      { type: 'uint256', name: 'maxReimbursement' },
      { type: 'bytes', name: 'signature' },
      { type: 'uint8', name: 'version' },
    ],
    hookData
  );

  const permit2SetupRaw = decoded[9] as readonly { token: Address; spender: Address; amount: bigint }[];
  const permit2Setup: Permit2Setup[] = permit2SetupRaw.map((p) => ({
    token: p.token,
    spender: p.spender,
    amount: p.amount,
  }));

  // Convert single action to array format
  return {
    targets: [decoded[0] as Address],
    values: [decoded[1] as bigint],
    callDatas: [decoded[2] as Hex],
    nonce: decoded[3] as bigint,
    deadline: decoded[4] as bigint,
    expectedAmount: decoded[5] as bigint,
    signature: decoded[14] as Hex,
    feeConfig: {
      paymentToken: decoded[6] as Address,
      indexerFee: decoded[7] as bigint,
      relayerFee: decoded[8] as bigint,
    },
    permit2Setup,
    funding: {
      ethNeeded: decoded[10] as bigint,
      tokensNeeded: [...(decoded[11] as readonly Address[])],
      tokenAmounts: [...(decoded[12] as readonly bigint[])],
      maxReimbursement: decoded[13] as bigint,
    },
  };
}

/**
 * Smart decode that handles both v1 and v2 formats
 */
export function decodeHookDataAuto(hookData: Hex): HookData {
  try {
    // Try v2 format first
    return decodeHookData(hookData);
  } catch {
    // Fall back to v1 format
    return decodeHookDataV1(hookData);
  }
}

// ============ CCTP Message Parsing ============

/**
 * Parse CCTP message to extract mint amount
 */
export function parseCCTPMessage(message: Hex): {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  nonce: bigint;
  sender: Hex;
  recipient: Hex;
  destinationCaller: Hex;
  messageBody: Hex;
  amount?: bigint;
  mintRecipient?: Address;
} {
  // CCTP message format
  const version = parseInt(message.slice(2, 10), 16);
  const sourceDomain = parseInt(message.slice(10, 18), 16);
  const destinationDomain = parseInt(message.slice(18, 26), 16);
  const nonce = BigInt('0x' + message.slice(26, 42));
  const sender = ('0x' + message.slice(42, 106)) as Hex;
  const recipient = ('0x' + message.slice(106, 170)) as Hex;
  const destinationCaller = ('0x' + message.slice(170, 234)) as Hex;
  const messageBody = ('0x' + message.slice(234)) as Hex;

  // Try to parse message body for amount (BurnMessage format)
  try {
    const decoded = decodeAbiParameters(
      [
        { type: 'uint32', name: 'version' },
        { type: 'bytes32', name: 'burnToken' },
        { type: 'bytes32', name: 'mintRecipient' },
        { type: 'uint256', name: 'amount' },
        { type: 'bytes32', name: 'messageSender' },
      ],
      messageBody
    );

    return {
      version,
      sourceDomain,
      destinationDomain,
      nonce,
      sender,
      recipient,
      destinationCaller,
      messageBody,
      amount: decoded[3],
      mintRecipient: ('0x' + decoded[2].slice(26)) as Address,
    };
  } catch {
    return {
      version,
      sourceDomain,
      destinationDomain,
      nonce,
      sender,
      recipient,
      destinationCaller,
      messageBody,
    };
  }
}

/**
 * Extract MessageSent event from transaction logs
 */
export function extractMessageSentEvent(logs: Log[]): {
  message: Hex;
} | null {
  const MessageSentTopic = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036';

  const messageSentLog = logs.find((log) => log.topics[0] === MessageSentTopic);

  if (!messageSentLog) {
    return null;
  }

  return { message: messageSentLog.data };
}

// ============ Utility Functions ============

/**
 * Convert address to bytes32 (for CCTP recipient field)
 */
export function addressToBytes32(address: Address): Hex {
  return ('0x' + '0'.repeat(24) + address.slice(2).toLowerCase()) as Hex;
}

/**
 * Convert bytes32 to address
 */
export function bytes32ToAddress(bytes32: Hex): Address {
  return ('0x' + bytes32.slice(26)) as Address;
}

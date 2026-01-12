import { concat, pad, toHex } from 'viem';
import type { UserOperation, PackedUserOperation } from '../types.js';

/**
 * Packs a UserOperation into the format required by EntryPoint v0.7
 * 
 * @param userOp The unpacked UserOperation (v0.6 style fields)
 * @returns The PackedUserOperation (v0.7 style fields)
 */
export function packUserOperation(userOp: UserOperation): PackedUserOperation {
    const accountGasLimits = concat([
        pad(toHex(userOp.verificationGasLimit), { size: 16 }),
        pad(toHex(userOp.callGasLimit), { size: 16 })
    ]);

    const gasFees = concat([
        pad(toHex(userOp.maxPriorityFeePerGas), { size: 16 }),
        pad(toHex(userOp.maxFeePerGas), { size: 16 })
    ]);

    return {
        sender: userOp.sender,
        nonce: userOp.nonce,
        initCode: userOp.initCode,
        callData: userOp.callData,
        accountGasLimits,
        preVerificationGas: userOp.preVerificationGas,
        gasFees,
        paymasterAndData: userOp.paymasterAndData,
        signature: userOp.signature,
    };
}

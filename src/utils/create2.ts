import type { Address, Hex } from 'viem';
import {
  keccak256,
  encodeAbiParameters,
  concat,
  getCreate2Address,
} from 'viem';

/**
 * Pons CREATE2 Address Computation
 * 
 * Enables trustless verification of smart account addresses.
 * Anyone can compute the expected address using:
 * - Factory address
 * - Owner address
 * - Salt
 * - Proxy bytecode hash
 */

/**
 * Compute CREATE2 address for a Pons smart account
 * 
 * This is the same computation done by SmartAccountFactory
 * and can be verified by anyone without trusting the SDK.
 */
export function computeCreate2Address(
  factory: Address,
  owner: Address,
  salt: bigint,
  initCodeHash: Hex
): Address {
  // Salt is hashed with owner to prevent front-running
  const combinedSalt = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [owner, salt]
    )
  );

  return getCreate2Address({
    from: factory,
    salt: combinedSalt,
    bytecodeHash: initCodeHash,
  });
}

/**
 * Compute the init code hash for smart account proxy
 * 
 * The init code is: proxy bytecode + constructor args (implementation, initData)
 * This should match what SmartAccountFactory produces.
 */
export function computeInitCodeHash(
  proxyBytecode: Hex,
  implementation: Address,
  owner: Address
): Hex {
  // Encode the initialize() call data
  const initializeCalldata = encodeAbiParameters(
    [
      { type: 'bytes4' }, // selector for initialize(address)
      { type: 'address' },
    ],
    [
      '0xc4d66de8' as `0x${string}`, // bytes4(keccak256("initialize(address)"))
      owner,
    ]
  );

  // Constructor args: (address implementation, bytes memory data)
  const constructorArgs = encodeAbiParameters(
    [{ type: 'address' }, { type: 'bytes' }],
    [implementation, initializeCalldata]
  );

  // Init code = proxy bytecode + constructor args
  const initCode = concat([proxyBytecode, constructorArgs]);

  return keccak256(initCode);
}

/**
 * Parameters for CREATE2 verification
 */
export interface Create2Params {
  factory: Address;
  owner: Address;
  salt: bigint;
  initCodeHash: Hex;
}

/**
 * Verify a smart account address using CREATE2
 * 
 * Returns true if the claimed address matches the computed address.
 */
export function verifyCreate2Address(
  claimedAddress: Address,
  params: Create2Params
): boolean {
  const computedAddress = computeCreate2Address(
    params.factory,
    params.owner,
    params.salt,
    params.initCodeHash
  );

  return computedAddress.toLowerCase() === claimedAddress.toLowerCase();
}

/**
 * Default init code hash for standard Pons proxy
 * 
 * This is computed once and can be verified by:
 * 1. Reading proxyBytecode from factory
 * 2. Computing initCodeHash with implementation address
 * 
 * For production, this should be fetched from the factory contract
 * or configured per deployment.
 */
export const DEFAULT_INIT_CODE_HASH: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';


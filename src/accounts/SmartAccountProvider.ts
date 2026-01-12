import type { Address, Hex } from 'viem';
// import type { UserOperation } from '../types.js'; // Unused

/**
 * Interface for Smart Account Providers
 * 
 * Allows pons.js to support various account implementations:
 * - SimpleAccount (Default, based on ERC-4337 samples)
 * - Kernel / ZeroDev
 * - Safe
 * - Biconomy
 */
export interface SmartAccountProvider {
    /**
     * Calculate the deterministic address of the smart account
     */
    getAddress(owner: Address, salt?: bigint): Promise<Address>;

    /**
     * Get the initCode for deploying the account
     * Returns '0x' if already deployed (optional optimization, typically Bundlers handle this)
     * But usually we return the initCode if we *think* it needs deployment
     */
    getInitCode(owner: Address, salt?: bigint): Promise<Hex>;

    /**
     * Encode the calldata for the 'execute' function
     * Different accounts might have different execute signatures (execute, executeBatch, etc.)
     */
    encodeExecute(
        target: Address,
        value: bigint,
        data: Hex
    ): Promise<Hex>;

    /**
     * Encode a batch execution (if supported)
     */
    encodeExecuteBatch?(
        targets: Address[],
        values: bigint[],
        datas: Hex[]
    ): Promise<Hex>;

    /**
     * Get the dummy signature for gas estimation
     */
    getDummySignature(): Hex;
}

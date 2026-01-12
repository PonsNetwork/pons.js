import type { Address, Hex, PublicClient } from 'viem';
import { encodeFunctionData, encodePacked } from 'viem';
import type { SmartAccountProvider } from './SmartAccountProvider.js';
import { FACTORY_ABI } from '../config/constants.js';

/**
 * Default Simple Account Implementation
 * 
 * Uses the canonical Pons Factory and SimpleAccount logic.
 */
export class SimpleAccount implements SmartAccountProvider {
    constructor(
        private client: PublicClient,
        private factoryAddress: Address
    ) { }

    async getAddress(owner: Address, salt: bigint = 0n): Promise<Address> {
        return await this.client.readContract({
            address: this.factoryAddress,
            abi: FACTORY_ABI,
            functionName: 'getAddress',
            args: [owner, salt],
        }) as Address;
    }

    async getInitCode(owner: Address, salt: bigint = 0n): Promise<Hex> {
        return encodePacked(
            ['address', 'bytes'],
            [
                this.factoryAddress,
                encodeFunctionData({
                    abi: FACTORY_ABI,
                    functionName: 'createAccount',
                    args: [owner, salt]
                })
            ]
        );
    }

    async encodeExecute(target: Address, value: bigint, callData: Hex): Promise<Hex> {
        const executeAbi = [{
            name: 'execute',
            type: 'function',
            stateMutability: 'payable',
            inputs: [
                { name: 'dest', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'func', type: 'bytes' }
            ],
            outputs: []
        }] as const;

        return encodeFunctionData({
            abi: executeAbi,
            functionName: 'execute',
            args: [target, value, callData]
        });
    }

    async encodeExecuteBatch(targets: Address[], values: bigint[], datas: Hex[]): Promise<Hex> {
        const executeBatchAbi = [{
            name: 'executeBatch',
            type: 'function',
            stateMutability: 'payable',
            inputs: [
                { name: 'dest', type: 'address[]' },
                { name: 'value', type: 'uint256[]' },
                { name: 'func', type: 'bytes[]' }
            ],
            outputs: []
        }] as const;

        return encodeFunctionData({
            abi: executeBatchAbi,
            functionName: 'executeBatch',
            args: [targets, values, datas]
        });
    }

    getDummySignature(): Hex {
        return '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c';
    }
}

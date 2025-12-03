import type { Address, Hex, PublicClient } from 'viem';
import { createPublicClient, createWalletClient, http } from 'viem';
import type {
  PonsClientConfig,
  PonsConfig,
  CCTPTransferParams,
  TransferResult,
  TransferAnnouncement,
  IAction,
} from './types.js';
import { isSimpleConfig } from './types.js';
import { WakuManager } from './waku/WakuManager.js';
import { WakuRestManager } from './waku/WakuRestManager.js';
import { TransferTracker } from './polling/TransferTracker.js';
import { signAction, createWalletSigner } from './signing/eip712.js';
import { encodeHookData, addressToBytes32, decodeHookData } from './cctp/messageBuilder.js';
import { FACTORY_ABI, TOKEN_MESSENGER_ABI, ERC20_ABI, DEFAULTS, WAKU_CONFIG, PONS_GATEWAY } from './config/constants.js';
import { getChain, type FullChainConfig } from './config/chains.js';
import { PonsGatewayClient } from './gateway/PonsGatewayClient.js';
import { calculateDeadline } from './utils/helpers.js';
import { DEFAULT_INIT_CODE_HASH } from './utils/create2.js';
import { ActionBuilder, validateAction } from './actions/ActionBuilder.js';

/**
 * Pons SDK Client v2.0
 * 
 * Cross-chain execution made simple. Just specify source and destination chains!
 * 
 * @example
 * // SIMPLE: Just specify chains - SDK handles everything!
 * const pons = new PonsClient({
 *   from: 'sepolia',      // Source chain
 *   to: 'arc-testnet',    // Destination chain
 * });
 * 
 * await pons.initialize();
 * 
 * // Execute cross-chain transfer
 * const result = await pons.executeCCTPTransfer({
 *   amount: parseUnits('10', 6),  // 10 USDC
 *   action: { ... },
 * }, walletClient);
 * 
 * @example
 * // With custom RPC for better performance
 * const pons = new PonsClient({
 *   from: 'sepolia',
 *   to: 'arc-testnet',
 *   sourceRpcUrl: 'https://my-sepolia-rpc.com',
 * });
 * 
 * @example
 * // Advanced: Full config (for custom chains)
 * const pons = new PonsClient({
 *   sourceChain: { id: 11155111, name: 'Sepolia', ... },
 *   destinationChain: { id: 5042002, name: 'Arc', ... },
 * });
 */
export class PonsClient {
  private sourceClient: PublicClient;
  private destinationClient: PublicClient;
  private wakuManager?: WakuManager;
  private wakuRestManager?: WakuRestManager;
  private gatewayClient?: PonsGatewayClient;
  private useWakuPeer: boolean;
  private useGateway: boolean;
  private wakuEnabled: boolean;
  private factoryAddress: Address;
  private resolvedConfig: PonsClientConfig;

  constructor(config: PonsConfig) {
    // Resolve simplified config to full config
    this.resolvedConfig = this.resolveConfig(config);
    
    // Get source and destination chain configs
    const sourceChain = this.resolvedConfig.sourceChain;
    const destChain = this.resolvedConfig.destinationChain;
    
    // Resolve factory address from chain config or explicit override
    const destChainConfig = getChain(destChain.id) as FullChainConfig;
    const factoryAddress = this.resolvedConfig.factoryAddress || destChainConfig.factory;
    
    if (!factoryAddress) {
      throw new Error(
        `No factory deployed on ${destChain.name} (chain ${destChain.id}). ` +
        `Supported destination chains: Arc Testnet (5042002)`
      );
    }
    this.factoryAddress = factoryAddress;
    
    console.log(`🚀 Pons SDK initialized`);
    console.log(`   ${sourceChain.name} → ${destChain.name}`);
    console.log(`   Factory: ${this.factoryAddress}`);

    this.sourceClient = createPublicClient({
      transport: http(sourceChain.rpcUrl),
    });

    this.destinationClient = createPublicClient({
      transport: http(destChain.rpcUrl),
    });

    // Determine mode: Gateway (default) > Direct Peer > Direct REST
    const cfg = this.resolvedConfig;
    this.useGateway = !cfg.ponsPeerAddress && !cfg.ponsRelayUrl;
    this.useWakuPeer = !!cfg.ponsPeerAddress;
    this.wakuEnabled = true;

    if (this.wakuEnabled) {
      if (this.useGateway) {
        // Default: Use Pons Gateway
        console.log('🌐 Using Pons Gateway mode');
        const gatewayUrl = cfg.gatewayUrl || PONS_GATEWAY.DEFAULT_URL;
        this.gatewayClient = new PonsGatewayClient(gatewayUrl);
      } else if (this.useWakuPeer) {
        console.log('🔗 Using Pons Peer mode (direct)');
        this.wakuManager = new WakuManager(
          cfg.ponsBootstrapPeers,
          cfg.ponsPeerAddress,
          cfg.ponsWsPort ?? 8000,
          cfg.ponsClusterId ?? WAKU_CONFIG.CLUSTER_ID,
          cfg.ponsShard ?? WAKU_CONFIG.SHARD,
          cfg.contentTopicPrefix ?? WAKU_CONFIG.CONTENT_TOPIC_PREFIX,
          cfg.contentTopicSuffix ?? WAKU_CONFIG.CONTENT_TOPIC_SUFFIX
        );
      } else {
        console.log('🌐 Using Pons Relay mode (direct)');
        const restUrl = cfg.ponsRelayUrl || WAKU_CONFIG.DEFAULT_REST_URL;
        this.wakuRestManager = new WakuRestManager(
          restUrl,
          cfg.ponsClusterId ?? WAKU_CONFIG.CLUSTER_ID,
          cfg.ponsShard ?? WAKU_CONFIG.SHARD,
          cfg.contentTopicPrefix ?? WAKU_CONFIG.CONTENT_TOPIC_PREFIX,
          cfg.contentTopicSuffix ?? WAKU_CONFIG.CONTENT_TOPIC_SUFFIX
        );
      }
    }
  }

  /**
   * Resolve simplified config to full config
   */
  private resolveConfig(config: PonsConfig): PonsClientConfig {
    if (!isSimpleConfig(config)) {
      // Already full config
      return config;
    }

    // Resolve chain configs from names/IDs
    const sourceChainConfig = getChain(config.from);
    const destChainConfig = getChain(config.to);

    // Apply custom RPC URLs if provided
    const sourceChain = {
      ...sourceChainConfig,
      ...(config.sourceRpcUrl && { rpcUrl: config.sourceRpcUrl }),
    };

    const destinationChain = {
      ...destChainConfig,
      ...(config.destinationRpcUrl && { rpcUrl: config.destinationRpcUrl }),
    };

    return {
      sourceChain,
      destinationChain,
      factoryAddress: config.factoryAddress,
      gatewayUrl: config.gatewayUrl,
    };
  }

  /**
   * Initialize the client (required before use)
   */
  async initialize(): Promise<void> {
    if (!this.wakuEnabled) {
      return;
    }

    try {
      if (this.useGateway && this.gatewayClient) {
        await this.gatewayClient.initialize();
      } else if (this.useWakuPeer && this.wakuManager) {
        await this.wakuManager.initialize();
      } else if (this.wakuRestManager) {
        await this.wakuRestManager.initialize();
      }
    } catch (error) {
      console.warn('⚠️ Network initialization failed, SDK will continue without it:', error);
    }
  }

  /**
   * Calculate smart account address for a given owner
   */
  async calculateSmartAccountAddress(
    owner: Address,
    salt: bigint = 0n
  ): Promise<Address> {
    try {
      const address = await this.destinationClient.readContract({
        address: this.factoryAddress,
        abi: FACTORY_ABI,
        functionName: 'getAddress',
        args: [owner, salt],
      });

      return address as Address;
    } catch (error) {
      throw new Error(`Failed to calculate smart account address: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute a CCTP transfer with action
   * 
   * @param params Transfer parameters including action options
   * @param signer Wallet signer (Privy, wagmi, viem, or any compatible wallet)
   * 
   * Note: No network switching required! Users stay connected to the source chain (Arc).
   * The EIP-712 signature includes the destination chainId in its domain separator,
   * so the signature will be valid on the destination chain without switching networks.
   */
  async executeCCTPTransfer(
    params: CCTPTransferParams,
    signer: any
  ): Promise<TransferResult> {
    // Create wallet signer wrapper
    const walletSigner = createWalletSigner(signer);

    // Calculate smart account address
    const salt = params.salt ?? 0n;
    const smartAccountAddress = await this.calculateSmartAccountAddress(
      walletSigner.address,
      salt
    );

    // Calculate timing
    const deadline = params.deadline ?? calculateDeadline(Number(DEFAULTS.DEADLINE_OFFSET));
    const nonce = params.nonce ?? BigInt(Date.now());

    // Build the complete action
    const action = ActionBuilder.fromOptions(
      params.action,
      nonce,
      deadline,
      params.amount
    );

    // Validate action
    validateAction(action);

    console.log('📦 [PonsClient] Action built:', {
      targets: action.targets,
      values: action.values.map(v => v.toString()),
      actionCount: action.targets.length,
      nonce: action.nonce.toString(),
      deadline: action.deadline.toString(),
      expectedAmount: action.expectedAmount.toString(),
      feeConfig: {
        paymentToken: action.feeConfig.paymentToken,
        indexerFee: action.feeConfig.indexerFee.toString(),
        relayerFee: action.feeConfig.relayerFee.toString(),
      },
      permit2Setup: action.permit2Setup.length,
      funding: {
        ethNeeded: action.funding.ethNeeded.toString(),
        tokensNeeded: action.funding.tokensNeeded.length,
        maxReimbursement: action.funding.maxReimbursement.toString(),
      },
    });

    // Sign the action for destination chain
    // MetaMask requires chain switch for EIP-712 signing (chainId must match active chain)
    console.log(`🔐 Signing action for destination chain (chainId: ${this.resolvedConfig.destinationChain.id})...`);
    
    let signature: `0x${string}`;
    const destChainId = this.resolvedConfig.destinationChain.id;
    
    // Check if we need to switch chains for signing
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;
      const currentChainId = await ethereum.request({ method: 'eth_chainId' });
      const currentChainIdNum = parseInt(currentChainId, 16);
      
      if (currentChainIdNum !== destChainId) {
        console.log(`🔄 Switching to destination chain for signing...`);
        const destChainHex = `0x${destChainId.toString(16)}`;
        
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: destChainHex }],
          });
        } catch (switchError: any) {
          // Chain not added - try to add it
          if (switchError.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: destChainHex,
                chainName: this.resolvedConfig.destinationChain.name,
                rpcUrls: [this.resolvedConfig.destinationChain.rpcUrl],
              }],
            });
          } else {
            throw switchError;
          }
        }
        
        // Sign on destination chain
        signature = await signAction(
          action,
          smartAccountAddress,
          destChainId,
          walletSigner
        );
        
        // Switch back to source chain
        console.log(`🔄 Switching back to source chain...`);
        const sourceChainHex = `0x${this.resolvedConfig.sourceChain.id.toString(16)}`;
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: sourceChainHex }],
        });
      } else {
        // Already on destination chain
        signature = await signAction(
          action,
          smartAccountAddress,
          destChainId,
          walletSigner
        );
      }
    } else {
      // Non-browser environment or no ethereum - try direct signing
      signature = await signAction(
        action,
        smartAccountAddress,
        destChainId,
        walletSigner
      );
    }
    
    console.log('✅ Action signed');

    // Encode hook data
    const hookData = encodeHookData(action, signature);

    // Check and approve USDC if needed
    await this.ensureUSDCApproval(
      walletSigner.address,
      params.amount,
      signer
    );

    // Execute CCTP burn
    const txHash = await this.executeCCTPBurn(
      params.amount,
      smartAccountAddress,
      hookData,
      params.maxFee ?? DEFAULTS.MAX_FEE,
      signer
    );

    // Announce to network with trustless proofs
    if (this.wakuEnabled && (this.gatewayClient || this.wakuManager || this.wakuRestManager)) {
      console.log('📡 Broadcasting to Pons network (with proofs)...');
      await this.announceTransfer(
        txHash,
        walletSigner.address,
        smartAccountAddress,
        action,
        hookData,
        salt
      );
      console.log('✅ Transfer announced to relayers/indexers');
    }

    return {
      txHash,
      smartAccountAddress,
      nonce,
      expectedAmount: params.amount,
      deadline,
    };
  }

  /**
   * Ensure USDC approval for token messenger
   */
  private async ensureUSDCApproval(
    owner: Address,
    amount: bigint,
    signer: any
  ): Promise<void> {
    try {
      const balance = await this.sourceClient.readContract({
        address: this.resolvedConfig.sourceChain.usdc,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [owner],
      }) as bigint;

      console.log(`💰 USDC Balance: ${balance.toString()} (${(Number(balance) / 1e6).toFixed(6)} USDC)`);
      console.log(`💸 Amount needed: ${amount.toString()} (${(Number(amount) / 1e6).toFixed(6)} USDC)`);

      if (balance < amount) {
        throw new Error(`Insufficient USDC balance. Have: ${(Number(balance) / 1e6).toFixed(6)} USDC, Need: ${(Number(amount) / 1e6).toFixed(6)} USDC`);
      }

      const allowance = await this.sourceClient.readContract({
        address: this.resolvedConfig.sourceChain.usdc,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner, this.resolvedConfig.sourceChain.tokenMessenger],
      }) as bigint;

      console.log(`✓ Current allowance: ${allowance.toString()} (${(Number(allowance) / 1e6).toFixed(6)} USDC)`);

      if (allowance < amount) {
        console.log('⏳ Approving USDC...');
        
        const walletClient = signer.account 
          ? signer 
          : createWalletClient({
              account: owner,
              transport: http(this.resolvedConfig.sourceChain.rpcUrl),
            });

        const approveTx = await walletClient.writeContract({
          address: this.resolvedConfig.sourceChain.usdc,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [this.resolvedConfig.sourceChain.tokenMessenger, amount],
          chain: {
            id: this.resolvedConfig.sourceChain.id,
            name: this.resolvedConfig.sourceChain.name,
          } as any,
        });

        console.log(`⏳ Waiting for approval transaction: ${approveTx}`);
        const receipt = await this.sourceClient.waitForTransactionReceipt({ hash: approveTx });
        
        if (receipt.status === 'reverted') {
          throw new Error('Approval transaction reverted');
        }

        console.log('✅ USDC approved');
      } else {
        console.log('✓ Sufficient allowance already exists');
      }
    } catch (error) {
      throw new Error(`Failed to approve USDC: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute CCTP burn transaction
   */
  private async executeCCTPBurn(
    amount: bigint,
    mintRecipient: Address,
    hookData: Hex,
    maxFee: bigint,
    signer: any
  ): Promise<Hex> {
    try {
      console.log('🔥 Burning USDC on source chain...');
      console.log('📋 Burn parameters:');
      console.log(`   Amount: ${amount.toString()} (${(Number(amount) / 1e6).toFixed(6)} USDC)`);
      console.log(`   Destination Domain: ${this.resolvedConfig.destinationChain.domain}`);
      console.log(`   Mint Recipient: ${mintRecipient}`);

      const walletClient = signer.account 
        ? signer 
        : createWalletClient({
            transport: http(this.resolvedConfig.sourceChain.rpcUrl),
          });

      const txHash = await walletClient.writeContract({
        address: this.resolvedConfig.sourceChain.tokenMessenger,
        abi: TOKEN_MESSENGER_ABI,
        functionName: 'depositForBurnWithHook',
        args: [
          amount,
          this.resolvedConfig.destinationChain.domain,
          addressToBytes32(mintRecipient),
          this.resolvedConfig.sourceChain.usdc,
          '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
          maxFee,
          1000, // minFinalityThreshold
          hookData,
        ],
        chain: {
          id: this.resolvedConfig.sourceChain.id,
          name: this.resolvedConfig.sourceChain.name,
        } as any,
      });

      console.log(`⏳ Waiting for burn transaction: ${txHash}`);
      const receipt = await this.sourceClient.waitForTransactionReceipt({ hash: txHash });
      
      if (receipt.status === 'reverted') {
        throw new Error('Burn transaction reverted');
      }
      
      console.log('✅ USDC burned:', txHash);
      return txHash;
    } catch (error) {
      console.error('❌ Burn failed with error:', error);
      throw new Error(`Failed to burn USDC: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Announce transfer to Pons network with trustless validation proofs
   * 
   * The announcement includes cryptographic proofs that allow any resolver
   * to verify the message without trusting the sender:
   * - User signature (EIP-712)
   * - CREATE2 parameters for address verification
   */
  private async announceTransfer(
    txHash: Hex,
    userAddress: Address,
    smartAccountAddress: Address,
    action: IAction,
    hookData: Hex,
    salt: bigint = 0n
  ): Promise<void> {
    if (!this.gatewayClient && !this.wakuManager && !this.wakuRestManager) {
      return;
    }

    try {
      const hexToUint8Array = (hex: string): Uint8Array => {
        const hexString = hex.startsWith('0x') ? hex.slice(2) : hex;
        const bytes = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
          bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
        }
        return bytes;
      };

      // Extract signature from hookData for proofs
      let userSignature = '0x';
      try {
        const decodedHook = decodeHookData(hookData);
        userSignature = decodedHook.signature;
      } catch {
        console.warn('⚠️ Could not decode hookData for proofs');
      }

      const announcement: TransferAnnouncement = {
        version: '2.0', // Version 2.0 includes validation proofs
        timestamp: Date.now(),
        userAddress,
        smartAccountAddress,
        sourceTxHash: txHash,
        sourceDomain: this.resolvedConfig.sourceChain.domain,
        destinationDomain: this.resolvedConfig.destinationChain.domain,
        destinationChainId: this.resolvedConfig.destinationChain.id,
        expectedAmount: action.expectedAmount.toString(),
        nonce: action.nonce.toString(),
        deadline: Number(action.deadline),
        hookData: hexToUint8Array(hookData),
        feeConfig: {
          paymentToken: action.feeConfig.paymentToken,
          indexerFee: action.feeConfig.indexerFee.toString(),
          relayerFee: action.feeConfig.relayerFee.toString(),
        },
        fundingConfig: {
          ethNeeded: action.funding.ethNeeded.toString(),
          tokensNeeded: action.funding.tokensNeeded,
          tokenAmounts: action.funding.tokenAmounts.map(a => a.toString()),
          maxReimbursement: action.funding.maxReimbursement.toString(),
        },
        permit2Setup: action.permit2Setup.map(p => ({
          token: p.token,
          spender: p.spender,
          amount: p.amount.toString(),
        })),
        // Trustless validation proofs
        proofs: {
          userSignature,
          create2Params: {
            factory: this.factoryAddress,
            owner: userAddress,
            salt: salt.toString(),
            initCodeHash: DEFAULT_INIT_CODE_HASH,
          },
        },
      };

      console.log('📋 Transfer Announcement (with proofs):');
      console.log(`   Source TX: ${txHash}`);
      console.log(`   Smart Account: ${smartAccountAddress}`);
      console.log(`   Amount: ${(Number(action.expectedAmount) / 1e6).toFixed(6)} USDC`);
      console.log(`   Fees: ${(Number(action.feeConfig.indexerFee) / 1e6).toFixed(6)} + ${(Number(action.feeConfig.relayerFee) / 1e6).toFixed(6)} USDC`);
      console.log(`   🔒 Includes trustless validation proofs`);

      if (this.useGateway && this.gatewayClient) {
        await this.gatewayClient.announce(announcement, this.resolvedConfig.destinationChain.id);
      } else if (this.useWakuPeer && this.wakuManager) {
        await this.wakuManager.announceTransfer(announcement, this.resolvedConfig.destinationChain.id);
      } else if (this.wakuRestManager) {
        await this.wakuRestManager.announceTransfer(announcement, this.resolvedConfig.destinationChain.id);
      }
      
      console.log('✅ Announcement sent');
    } catch (error) {
      console.error('Failed to announce transfer:', error);
    }
  }

  /**
   * Track a transfer by transaction hash
   */
  trackTransfer(
    sourceTxHash: Hex,
    smartAccountAddress: Address,
    nonce: bigint
  ): TransferTracker {
    const tracker = new TransferTracker(
      sourceTxHash,
      smartAccountAddress,
      nonce,
      this.resolvedConfig.sourceChain,
      this.resolvedConfig.destinationChain,
      this.wakuManager,
      this.wakuEnabled
    );

    tracker.start();
    return tracker;
  }

  /**
   * Cleanup and stop
   */
  async stop(): Promise<void> {
    if (this.gatewayClient) {
      await this.gatewayClient.stop();
    }
    if (this.wakuManager) {
      await this.wakuManager.stop();
    }
    if (this.wakuRestManager) {
      await this.wakuRestManager.stop();
    }
  }

  // Getters for advanced usage
  getGatewayClient(): PonsGatewayClient | undefined { return this.gatewayClient; }
  getWakuManager(): WakuManager | undefined { return this.wakuManager; }
  getWakuRestManager(): WakuRestManager | undefined { return this.wakuRestManager; }
  isUsingGateway(): boolean { return this.useGateway; }
  isUsingWakuPeer(): boolean { return this.useWakuPeer; }
  isWakuEnabled(): boolean { return this.wakuEnabled; }
}

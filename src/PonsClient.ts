import type { Address, Hex, PublicClient } from 'viem';
import { createPublicClient, createWalletClient, http } from 'viem';
import type {
  PonsClientConfig,
  PonsConfig,
  CCTPTransferParams,
  TransferResult,
  TransferAnnouncement,
  IAction,
  ExecutionProgress, // Type
} from './types.js';
import {
  ExecutionStep, // Value (Enum)
  isSimpleConfig,
} from './types.js';
import { TransferTracker } from './polling/TransferTracker.js';
import { signAction, createWalletSigner } from './signing/eip712.js';
import { encodeHookData, addressToBytes32, decodeHookData } from './cctp/messageBuilder.js';
import { validateBurnAmount, calculateMinBurnAmount } from './cctp/fees.js';
import { FACTORY_ABI, PONS_GATEWAY_ABI, ERC20_ABI, DEFAULTS, PONS_GATEWAY } from './config/constants.js';
import { getChain, CHAINS, type FullChainConfig, type ChainName } from './config/chains.js';
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
 * const result = await pons.execute({
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
 * 
 * @example
 * // EASIEST: Auto-fetch config from gateway (no addresses needed!)
 * const pons = await PonsClient.create({
 *   from: 'sepolia',
 *   to: 'arc-testnet',
 * });
 */
export class PonsClient {
  /**
   * Create a PonsClient using bundled SDK chain configs
   *
   * All chain configs (factory, CCTP contracts, ponsGateway) come from the SDK's
   * bundled chain definitions. No external fetching required.
   *
   * @example
   * import { PonsClient, Chain } from '@pons/sdk';
   *
   * const pons = await PonsClient.create({
   *   from: Chain.SEPOLIA,
   *   to: Chain.ARC_TESTNET,
   *   sourceRpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
   *   destinationRpcUrl: 'https://rpc.testnet.arc.network',
   * });
   */
  static async create(config: {
    /** Source chain (use Chain.SEPOLIA, Chain.ETHEREUM, etc.) */
    from: ChainName;
    /** Destination chain (use Chain.ARC_TESTNET, etc.) */
    to: ChainName;
    /** RPC URL for source chain (required) */
    sourceRpcUrl: string;
    /** RPC URL for destination chain (required) */
    destinationRpcUrl: string;
    /** Gateway URL (optional, defaults to gateway.pons.sh) */
    gatewayUrl?: string;
  }): Promise<PonsClient> {
    const gatewayUrl = config.gatewayUrl || PONS_GATEWAY.DEFAULT_URL;

    // Get bundled chain configs from SDK
    const sourceChain = getChain(config.from);
    const destChain = getChain(config.to);

    // Validate chains exist
    if (!sourceChain) {
      throw new Error(`Source chain "${config.from}" not found in SDK config`);
    }
    if (!destChain) {
      throw new Error(`Destination chain "${config.to}" not found in SDK config`);
    }
    if (!destChain.factory) {
      throw new Error(`No factory configured for ${config.to}. SmartAccounts can only be created on chains with deployed factories.`);
    }

    // Update chain configs with provided RPC URLs
    CHAINS[config.from] = {
      ...sourceChain,
      rpcUrl: config.sourceRpcUrl,
    } as FullChainConfig;

    CHAINS[config.to] = {
      ...destChain,
      rpcUrl: config.destinationRpcUrl,
    } as FullChainConfig;

    console.log(`🚀 Pons SDK initialized`);
    console.log(`   ${sourceChain.name} → ${destChain.name}`);
    console.log(`   Factory: ${destChain.factory}`);
    console.log(`   PonsGateway (source): ${sourceChain.ponsGateway}`);

    // Create client with bundled config
    const client = new PonsClient({
      from: config.from as any,
      to: config.to as any,
      sourceRpcUrl: config.sourceRpcUrl,
      destinationRpcUrl: config.destinationRpcUrl,
      gatewayUrl,
    });

    await client.initialize();
    return client;
  }

  private sourceClient: PublicClient;
  private destinationClient: PublicClient;
  private gatewayClient?: PonsGatewayClient;
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

    // Initialize Gateway client for network announcements
    const gatewayUrl = this.resolvedConfig.gatewayUrl || PONS_GATEWAY.DEFAULT_URL;
    console.log('🌐 Using Pons Gateway mode');
    this.gatewayClient = new PonsGatewayClient(gatewayUrl);
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
    try {
      if (this.gatewayClient) {
        await this.gatewayClient.initialize();
      }
    } catch (error) {
      console.warn('⚠️ Gateway initialization failed, SDK will continue without it:', error);
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
   * Execute a cross-chain transfer with action
   * 
   * @param params Transfer parameters including action options
   * @param signer Wallet signer (Privy, wagmi, viem, or any compatible wallet)
   * 
   * Note: No network switching required! Users stay connected to the source chain.
   * The EIP-712 signature includes the destination chainId in its domain separator,
   * so the signature will be valid on the destination chain without switching networks.
   */
  async execute(
    params: CCTPTransferParams,
    signer: any,
    onProgress?: (progress: ExecutionProgress) => void
  ): Promise<TransferResult> {
    // Helper to emit progress
    const emitProgress = (step: ExecutionStep, message?: string, txHash?: string) => {
      if (onProgress) onProgress({ step, message, txHash });
    };

    emitProgress(ExecutionStep.BUILDING, 'Preparing transaction...');

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

    // Get protocol fee (default to 10 bps = 0.1% if not available)
    const protocolFeeBps = params.protocolFeeBps ?? 10n;

    // Validate burn amount covers all fees (CCTP + Protocol + Indexer + Resolver + Reimbursement)
    const validation = await validateBurnAmount(
      params.amount,
      params.action.feeConfig.indexerFee,
      params.action.feeConfig.resolverFee,
      params.action.funding?.maxReimbursement ?? 0n,
      protocolFeeBps,
      this.resolvedConfig.sourceChain.domain,
      this.resolvedConfig.destinationChain.domain
    );

    if (!validation.sufficient) {
      // Calculate how much user should burn to make this work
      const minBurn = await calculateMinBurnAmount(
        params.action.feeConfig.indexerFee,
        params.action.feeConfig.resolverFee,
        params.action.funding?.maxReimbursement ?? 0n,
        0n, // Amount for action (if user needs USDC for the action itself)
        protocolFeeBps,
        this.resolvedConfig.sourceChain.domain,
        this.resolvedConfig.destinationChain.domain
      );

      throw new Error(
        `${validation.message}\n` +
        `💡 Suggestion: Burn at least ${Number(minBurn) / 1e6} USDC to cover all fees.`
      );
    }

    // Log fee breakdown
    console.log('💰 [Fee Breakdown]');
    console.log(`   Burn amount: ${Number(validation.breakdown.burnAmount) / 1e6} USDC`);
    console.log(`   CCTP fee: ${Number(validation.breakdown.cctpFee) / 1e6} USDC`);
    console.log(`   Expected amount: ${Number(validation.breakdown.expectedAmount) / 1e6} USDC`);
    console.log(`   Protocol fee (${Number(protocolFeeBps) / 100}%): ${Number(validation.breakdown.protocolFee) / 1e6} USDC`);
    console.log(`   Indexer fee: ${Number(validation.breakdown.indexerFee) / 1e6} USDC`);
    console.log(`   Resolver fee: ${Number(validation.breakdown.resolverFee) / 1e6} USDC`);
    console.log(`   Reimbursement: ${Number(validation.breakdown.reimbursement) / 1e6} USDC`);
    console.log(`   Total fees: ${Number(validation.breakdown.totalFees) / 1e6} USDC`);
    console.log(`   Amount for action: ${Number(validation.breakdown.amountForAction) / 1e6} USDC`);

    // Use the validated expectedAmount (after CCTP fees)
    const expectedAmount = validation.breakdown.expectedAmount;

    // Get chain IDs for cross-chain signature
    const sourceChainId = this.resolvedConfig.sourceChain.id;
    const destChainId = this.resolvedConfig.destinationChain.id;

    // Build the complete action with chain IDs for cross-chain signature
    // V3: User signs on source chain, action executes on destination chain
    const action = ActionBuilder.fromOptions(
      params.action,
      BigInt(sourceChainId),  // Chain where user is signing
      BigInt(destChainId),    // Chain where action will execute
      nonce,
      deadline,
      expectedAmount  // Use expectedAmount after CCTP fees
    );

    // Validate action (now includes fee validation)
    validateAction(action, true, protocolFeeBps);

    console.log('📦 [PonsClient] Action built:', {
      sourceChainId: action.sourceChainId.toString(),
      targetChainId: action.targetChainId.toString(),
      targets: action.targets,
      values: action.values.map(v => v.toString()),
      actionCount: action.targets.length,
      nonce: action.nonce.toString(),
      deadline: action.deadline.toString(),
      expectedAmount: action.expectedAmount.toString(),
      feeConfig: {
        paymentToken: action.feeConfig.paymentToken,
        indexerFee: action.feeConfig.indexerFee.toString(),
        resolverFee: action.feeConfig.resolverFee.toString(),
      },
      permit2Setup: action.permit2Setup.length,
      funding: {
        ethNeeded: action.funding.ethNeeded.toString(),
        tokensNeeded: action.funding.tokensNeeded.length,
        maxReimbursement: action.funding.maxReimbursement.toString(),
      },
    });

    // Sign the action on source chain (no network switch needed!)
    // V3: Cross-chain signatures allow signing on source chain for destination chain execution
    console.log(`🔐 Signing cross-chain action (source: ${sourceChainId}, target: ${destChainId})...`);
    emitProgress(ExecutionStep.SIGNING, 'Please sign the cross-chain authorization');

    // V3: Cross-chain signatures - no network switching needed!
    // User signs on source chain, signature is valid for destination chain execution
    const signature = await signAction(
      action,
      smartAccountAddress,
      walletSigner
    );

    console.log('✅ Action signed');

    // Encode hook data
    const hookData = encodeHookData(action, signature);

    // Check and approve USDC if needed
    await this.ensureUSDCApproval(
      walletSigner.address,
      params.amount,
      signer,
      emitProgress
    );

    // Execute CCTP burn
    emitProgress(ExecutionStep.EXECUTING_BRIDGE, 'Initiating bridge transaction...');
    const txHash = await this.executeCCTPBurn(
      params.amount,
      smartAccountAddress,
      hookData,
      params.maxFee ?? DEFAULTS.MAX_FEE,
      signer
    );
    emitProgress(ExecutionStep.COMPLETE, 'Bridge initiated', txHash);

    // Announce to network with trustless proofs
    if (this.gatewayClient) {
      console.log('📡 Broadcasting to Pons network (with proofs)...');
      await this.announceTransfer(
        txHash,
        walletSigner.address,
        smartAccountAddress,
        action,
        hookData,
        salt
      );
      console.log('✅ Transfer announced to resolvers/indexers');
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
    signer: any,
    emitProgress?: (step: ExecutionStep, message?: string, txHash?: string) => void
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

      // Spender is PonsGateway
      const spender = this.resolvedConfig.sourceChain.ponsGateway;

      const allowance = await this.sourceClient.readContract({
        address: this.resolvedConfig.sourceChain.usdc,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner, spender],
      }) as bigint;

      console.log(`✓ Current allowance: ${allowance.toString()} (${(Number(allowance) / 1e6).toFixed(6)} USDC)`);
      console.log(`   Spender: ${spender}`);

      if (allowance < amount) {
        console.log('⏳ Approving USDC...');
        if (emitProgress) emitProgress(ExecutionStep.APPROVING_USDC, 'Please approve USDC spending');

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
          args: [spender, amount],
          chain: {
            id: this.resolvedConfig.sourceChain.id,
            name: this.resolvedConfig.sourceChain.name,
          } as any,
        });

        console.log(`⏳ Waiting for approval transaction: ${approveTx}`);
        if (emitProgress) emitProgress(ExecutionStep.WAITING_APPROVAL, 'Waiting for approval confirmation...', approveTx);
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
   * Execute CCTP burn transaction via PonsGateway
   */
  private async executeCCTPBurn(
    amount: bigint,
    mintRecipient: Address,
    hookData: Hex,
    maxFee: bigint,
    signer: any
  ): Promise<Hex> {
    try {
      const ponsGateway = this.resolvedConfig.sourceChain.ponsGateway;

      console.log('🌉 Bridging USDC via PonsGateway...');
      console.log('📋 Bridge parameters:');
      console.log(`   Amount: ${amount.toString()} (${(Number(amount) / 1e6).toFixed(6)} USDC)`);
      console.log(`   Destination Domain: ${this.resolvedConfig.destinationChain.domain}`);
      console.log(`   Mint Recipient: ${mintRecipient}`);
      console.log(`   PonsGateway: ${ponsGateway}`);

      const walletClient = signer.account
        ? signer
        : createWalletClient({
          transport: http(this.resolvedConfig.sourceChain.rpcUrl),
        });

      const txHash = await walletClient.writeContract({
        address: ponsGateway,
        abi: PONS_GATEWAY_ABI,
        functionName: 'bridge',
        args: [
          amount,
          this.resolvedConfig.destinationChain.domain,
          addressToBytes32(mintRecipient),
          '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`, // destinationCaller
          maxFee,
          1000, // minFinalityThreshold
          hookData,
        ],
        chain: {
          id: this.resolvedConfig.sourceChain.id,
          name: this.resolvedConfig.sourceChain.name,
        } as any,
        gas: 1_500_000n,
      });

      console.log(`⏳ Waiting for bridge transaction: ${txHash}`);
      const receipt = await this.sourceClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === 'reverted') {
        throw new Error('Bridge transaction reverted');
      }

      console.log('✅ Bridge initiated via PonsGateway:', txHash);
      return txHash;
    } catch (error) {
      console.error('❌ Bridge failed with error:', error);
      throw new Error(`Failed to bridge USDC: ${error instanceof Error ? error.message : String(error)}`);
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
    if (!this.gatewayClient) {
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
          resolverFee: action.feeConfig.resolverFee.toString(),
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
      console.log(`   Fees: ${(Number(action.feeConfig.indexerFee) / 1e6).toFixed(6)} + ${(Number(action.feeConfig.resolverFee) / 1e6).toFixed(6)} USDC`);
      console.log(`   🔒 Includes trustless validation proofs`);

      if (this.gatewayClient) {
        await this.gatewayClient.announce(announcement, this.resolvedConfig.destinationChain.id);
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
      this.resolvedConfig.destinationChain
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
  }

  // Getters for advanced usage
  getGatewayClient(): PonsGatewayClient | undefined { return this.gatewayClient; }
}

import type { Address, Hex, PublicClient } from 'viem';
import { createPublicClient, createWalletClient, http, encodeFunctionData, toHex, pad, keccak256, encodeAbiParameters, encodePacked, concat } from 'viem';
import type {
  PonsClientConfig,
  PonsConfig,
  CCTPTransferParams,
  TransferResult,
  TransferAnnouncement,
  IAction,
  ExecutionProgress, // Type
  UserOperation,
} from './types.js';
import {
  ExecutionStep, // Value (Enum)
  isSimpleConfig,
} from './types.js';
import { TransferTracker } from './polling/TransferTracker.js';
import { signAction, createWalletSigner } from './signing/eip712.js';
import { encodeHookData, addressToBytes32, decodeHookData } from './cctp/messageBuilder.js';
import { validateBurnAmount, calculateMinBurnAmount } from './cctp/fees.js';
import { PONS_GATEWAY_ABI, ERC20_ABI, DEFAULTS, PONS_GATEWAY } from './config/constants.js';
import { getChain, CHAINS, type FullChainConfig, type ChainName } from './config/chains.js';
import { PonsGatewayClient } from './gateway/PonsGatewayClient.js';
import { calculateDeadline } from './utils/helpers.js';
import { DEFAULT_INIT_CODE_HASH } from './utils/create2.js';
import { ActionBuilder, validateAction } from './actions/ActionBuilder.js';
import { packUserOperation } from './utils/userOp.js';
import type { SmartAccountProvider } from './accounts/SmartAccountProvider.js';
import { SimpleAccount } from './accounts/SimpleAccount.js';

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
    /** RPC URL for source chain (optional) */
    sourceRpcUrl?: string;
    /** RPC URL for destination chain (optional) */
    destinationRpcUrl?: string;
    /** Gateway URL (optional, defaults to gateway.pons.sh) */
    gatewayUrl?: string;
    bundlerUrl?: string;
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
      bundlerUrl: config.bundlerUrl,
    });

    await client.initialize();
    return client;
  }

  private sourceClient: PublicClient;
  private destinationClient: PublicClient;
  private gatewayClient?: PonsGatewayClient;
  private factoryAddress: Address;
  private resolvedConfig: PonsClientConfig;
  private accountProvider: SmartAccountProvider;

  constructor(config: PonsConfig) {
    // Resolve simplified config to full config
    this.resolvedConfig = this.resolveConfig(config);

    // Get source and destination chain configs
    const sourceChain = this.resolvedConfig.sourceChain;
    const destChain = this.resolvedConfig.destinationChain;

    // Resolve factory address from chain config or explicit override
    const destChainConfig = getChain(destChain.id) as FullChainConfig;
    const factoryAddress = this.resolvedConfig.factoryAddress || destChainConfig.factory;

    // Initialize clients first as providers might need them
    this.sourceClient = createPublicClient({
      transport: http(sourceChain.rpcUrl),
    });

    this.destinationClient = createPublicClient({
      transport: http(destChain.rpcUrl),
    });

    if (this.resolvedConfig.accountProvider) {
      // Use custom provider
      this.accountProvider = this.resolvedConfig.accountProvider;
      // If custom provider is used, factoryAddress might be irrelevant or internal to it
      this.factoryAddress = factoryAddress || '0x0000000000000000000000000000000000000000';
    } else {
      // Use Default SimpleAccount
      if (!factoryAddress) {
        throw new Error(
          `No factory deployed on ${destChain.name} (chain ${destChain.id}). ` +
          `Supported destination chains: Arc Testnet (5042002)`
        );
      }
      this.factoryAddress = factoryAddress;
      this.accountProvider = new SimpleAccount(this.destinationClient, this.factoryAddress);
    }

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
      bundlerUrl: config.bundlerUrl,
      paymasterUrl: config.paymasterUrl,
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
    salt: bigint = 0n,
    useSourceChainProvider: boolean = false
  ): Promise<Address> {
    try {
      if (useSourceChainProvider) {
        // Create a temporary provider for source chain (assuming SimpleAccount default for now)
        // In a real app, config should support sourceAccountProvider vs destAccountProvider
        const factory = (this.resolvedConfig.sourceChain as any).factory;
        if (!factory) return '0x0000000000000000000000000000000000000000'; // Should not happen if validated
        const provider = new SimpleAccount(this.sourceClient, factory);
        return await provider.getAddress(owner, salt);
      }
      return await this.accountProvider.getAddress(owner, salt);
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

    // Auto-fill paymentToken from destination chain if not provided
    // This simplifies dApp integration - they don't need to know destination USDC address
    const feeConfig = {
      ...params.action.feeConfig,
      paymentToken: params.action.feeConfig.paymentToken || this.resolvedConfig.destinationChain.usdc as Address,
    };

    // Log auto-fill if applied
    if (!params.action.feeConfig.paymentToken) {
      console.log(`💡 Auto-filled paymentToken: ${feeConfig.paymentToken} (destination chain USDC)`);
    }

    // Create normalized action with auto-filled feeConfig
    const normalizedAction = {
      ...params.action,
      feeConfig,
    };

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
      normalizedAction.feeConfig.indexerFee,
      normalizedAction.feeConfig.resolverFee,
      normalizedAction.funding?.maxReimbursement ?? 0n,
      protocolFeeBps,
      this.resolvedConfig.sourceChain.domain,
      this.resolvedConfig.destinationChain.domain
    );

    if (!validation.sufficient) {
      // Calculate how much user should burn to make this work
      const minBurn = await calculateMinBurnAmount(
        normalizedAction.feeConfig.indexerFee,
        normalizedAction.feeConfig.resolverFee,
        normalizedAction.funding?.maxReimbursement ?? 0n,
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
      normalizedAction,  // Use normalized action with auto-filled paymentToken
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

    // Ensure user is on the source chain before signing (viem requirement: domain.chainId must match client chainId)
    if (signer.switchChain) {
      try {
        console.log(`🔀 Switching to source chain (${sourceChainId}) for signing...`);
        await signer.switchChain({ id: sourceChainId });
      } catch (error) {
        console.warn('⚠️ Failed to switch chain automatically:', error);
        // Continue anyway, user might already be on the correct chain
      }
    }

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
          paymentToken: action.feeConfig.paymentToken!, // filled by normalization above
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

  // ============ Smart Account Execution ============

  /**
   * Build call array for external AA clients (ZeroDev, Alchemy, Pimlico)
   * 
   * Returns a format compatible with most AA SDK sendUserOperation interfaces:
   * - ZeroDev: kernelClient.sendUserOperation({ calls })
   * - Alchemy: smartAccountClient.sendUserOperation({ uo: calls })
   * - Pimlico: bundlerClient.sendUserOperation({ calls })
   * 
   * @example
   * const calls = ponsClient.buildCalls({
   *   targets: [USDC_ADDRESS, PONS_GATEWAY],
   *   values: [0n, 0n],
   *   datas: [approveCalldata, bridgeCalldata]
   * });
   * await kernelClient.sendUserOperation({ calls });
   */
  buildCalls(params: {
    targets: Address[];
    values: bigint[];
    datas: Hex[];
  }): { target: Address; value: bigint; data: Hex }[] {
    if (params.targets.length !== params.values.length || params.targets.length !== params.datas.length) {
      throw new Error('buildCalls: targets, values, and datas arrays must have the same length');
    }

    return params.targets.map((target, i) => ({
      target,
      value: params.values[i],
      data: params.datas[i]
    }));
  }

  /**
   * Execute calls on Smart Account directly from EOA (no bundler needed)
   * 
   * This works because the Smart Account has `onlyOwnerOrEntryPoint` modifier,
   * allowing the owner's EOA to call execute/executeBatch directly.
   * 
   * @param params - Single call (target, value, data) or batch (targets, values, datas)
   * @param signer - Wallet signer (EOA that owns the Smart Account)
   * @param options - Chain selection: useSourceChain (default: uses destination chain)
   * @returns Transaction hash
   * 
   * @example
   * // Batch: Approve USDC + Bridge via PonsGateway
   * await ponsClient.executeOnSmartAccount({
   *   targets: [USDC_ADDRESS, PONS_GATEWAY],
   *   values: [0n, 0n],
   *   datas: [approveCalldata, bridgeCalldata]
   * }, walletClient, { useSourceChain: true });
   */
  async executeOnSmartAccount(
    params: {
      target?: Address;      // Single call
      value?: bigint;
      data?: Hex;
      targets?: Address[];   // Batch call
      values?: bigint[];
      datas?: Hex[];
    },
    signer: any,
    options?: {
      useSourceChain?: boolean;  // Default: destination chain
    }
  ): Promise<Hex> {
    const walletSigner = createWalletSigner(signer);
    const useSource = options?.useSourceChain ?? false;

    // Select chain based on option
    const client = useSource ? this.sourceClient : this.destinationClient;
    const chainConfig = useSource ? this.resolvedConfig.sourceChain : this.resolvedConfig.destinationChain;

    // Get Smart Account address
    const smartAccountAddress = await this.calculateSmartAccountAddress(walletSigner.address, 0n, useSource);

    // Build calldata for execute or executeBatch
    const isBatch = params.targets && params.targets.length > 0;

    let callData: Hex;
    if (isBatch) {
      // Batch execution
      if (!params.targets || !params.values || !params.datas) {
        throw new Error('Batch execution requires targets, values, and datas arrays');
      }
      if (params.targets.length !== params.values.length || params.targets.length !== params.datas.length) {
        throw new Error('Batch arrays must have the same length');
      }

      callData = encodeFunctionData({
        abi: [{
          name: 'executeBatch',
          type: 'function',
          inputs: [
            { name: 'dest', type: 'address[]' },
            { name: 'value', type: 'uint256[]' },
            { name: 'func', type: 'bytes[]' }
          ],
          outputs: []
        }],
        functionName: 'executeBatch',
        args: [params.targets, params.values, params.datas]
      });
    } else {
      // Single execution
      if (!params.target) {
        throw new Error('Single execution requires target');
      }

      callData = encodeFunctionData({
        abi: [{
          name: 'execute',
          type: 'function',
          inputs: [
            { name: 'dest', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'func', type: 'bytes' }
          ],
          outputs: []
        }],
        functionName: 'execute',
        args: [params.target, params.value ?? 0n, params.data ?? '0x']
      });
    }

    // Send transaction directly from EOA to Smart Account
    // The signer should already be a walletClient with account
    const walletClient = signer.account
      ? signer
      : createWalletClient({
        account: walletSigner.address,
        transport: http(chainConfig.rpcUrl),
      });

    // Request wallet to switch to the correct chain before sending
    try {
      await walletClient.switchChain({ id: chainConfig.id });
    } catch (switchError: any) {
      // If chain doesn't exist in wallet, try to add it
      if (switchError.code === 4902) {
        await walletClient.addChain({
          chain: {
            id: chainConfig.id,
            name: chainConfig.name,
            nativeCurrency: (chainConfig as any).nativeCurrency || { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
            blockExplorers: (chainConfig as any).blockExplorerUrl
              ? { default: { name: chainConfig.name, url: (chainConfig as any).blockExplorerUrl } }
              : undefined,
          } as any,
        });
        await walletClient.switchChain({ id: chainConfig.id });
      } else {
        console.warn('Failed to switch chain:', switchError);
        // Continue anyway, let the user handle it in wallet
      }
    }

    console.log(`📡 Sending tx on chain ${chainConfig.id} (${chainConfig.name})`);

    const txHash = await walletClient.sendTransaction({
      to: smartAccountAddress,
      data: callData,
      chain: {
        id: chainConfig.id,
        name: chainConfig.name,
      } as any,
    });

    console.log(`✅ executeOnSmartAccount tx: ${txHash}`);
    return txHash;
  }

  // ============ UserOp Support (ERC-4337) ============

  /**
   * Build a UserOperation for the Smart Account
   */
  async buildUserOperation(
    call: { target: Address; value: bigint; data: Hex },
    signer: any
  ): Promise<UserOperation> {
    const walletSigner = createWalletSigner(signer);
    // Determine the active chain client (destination chain is where SA lives)
    const client = this.destinationClient;
    const chainId = this.resolvedConfig.destinationChain.id;

    // Get SA address
    const sender = await this.calculateSmartAccountAddress(walletSigner.address, 0n);

    // 1. Get Nonce
    // EntryPoint 0.7 uses 2D nonce, but for simplicity we read standard nonce
    // Note: We should ideally use the EntryPoint contract to get nonce
    // For now, assuming we can get it via standard RPC or manual track.
    // Let's us a simple nonce assumption or try to read from contract if possible.
    // A robust impl would use EntryPoint.getNonce(sender, key)

    // For this implementation, we'll try to use a simplified flow or assume 0 for first tx if not deployed
    // But since we are likely deployed or will be, we need real nonce.
    // Let's skip deep EntryPoint integration and try to just build the struct with basic info
    // passed to a bundler which fills the rest, OR we do it manually.

    // To keep it simple and dependency-free:
    const nonce = 0n; // Placeholder - Real impl needs EntryPoint

    // 2. InitCode
    const isDeployed = await client.getBytecode({ address: sender });
    let initCode: Hex = '0x';

    if (!isDeployed) {
      initCode = await this.accountProvider.getInitCode(walletSigner.address, 0n);
    }

    // 3. CallData
    const callData = await this.accountProvider.encodeExecute(call.target, call.value, call.data);

    // 4. Construct UserOp
    // We need to fill gas limits. If we have a bundler, `eth_estimateUserOperationGas` is best.
    // If not, we have to guess.

    const userOp: UserOperation = {
      sender,
      nonce, // TODO: Fetch real nonce from EntryPoint
      initCode,
      callData,
      callGasLimit: 100_000n, // Fallback
      verificationGasLimit: 100_000n, // Fallback
      preVerificationGas: 50_000n, // Fallback
      maxFeePerGas: 10_000_000_000n, // Fallback (10 gwei)
      maxPriorityFeePerGas: 10_000_000_000n, // Fallback
      paymasterAndData: '0x',
      signature: this.accountProvider.getDummySignature()
    };

    // If bundler is available, estimate gas
    if (this.resolvedConfig.bundlerUrl) {
      try {
        const bundlerClient = createPublicClient({
          transport: http(this.resolvedConfig.bundlerUrl)
        });

        // EntryPoint v0.8
        const entryPoint = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108';

        const rpcOp = this.formatRpcUserOp(userOp);

        const estimates = await bundlerClient.request({
          method: 'eth_estimateUserOperationGas' as any,
          params: [rpcOp, entryPoint]
        }) as any;

        if (estimates) {
          console.log('⛽ Gas Estimated via Bundler:', estimates);
          userOp.preVerificationGas = BigInt(estimates.preVerificationGas);
          userOp.verificationGasLimit = BigInt(estimates.verificationGasLimit);
          userOp.callGasLimit = BigInt(estimates.callGasLimit);
        }

      } catch (error) {
        console.warn('⚠️ Failed to estimate userOp gas via bundler, using defaults:', error);
      }
    }

    return userOp;
  }

  /**
   * Sign and send a UserOperation
   */
  async sendUserOperation(
    userOp: UserOperation,
    signer: any
  ): Promise<Hex> {
    // EntryPoint v0.8 (matching deployed Factory)
    const entryPoint = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' as Address;
    const chainId = this.resolvedConfig.destinationChain.id;

    if (!this.resolvedConfig.bundlerUrl) {
      throw new Error("Bundler URL required to send UserOperation");
    }

    // 1. Compute userOpHash
    const userOpHash = this.computeUserOpHash(userOp, entryPoint, BigInt(chainId));
    console.log('🔐 UserOp Hash:', userOpHash);

    // 2. Sign with user's wallet (personal_sign adds Ethereum message prefix)
    const walletSigner = createWalletSigner(signer);

    // Convert hex hash to bytes for signing
    const hashBytes = new Uint8Array(
      (userOpHash.slice(2).match(/.{2}/g) || []).map(byte => parseInt(byte, 16))
    );

    if (!walletSigner.signMessage) {
      throw new Error('Wallet does not support signMessage. Cannot sign UserOperation.');
    }

    const signature = await walletSigner.signMessage({ message: hashBytes });
    console.log('✍️ Signature:', signature);

    // 3. Update signature in userOp
    userOp.signature = signature;

    // 4. Submit to bundler
    console.log(`🚀 Sending UserOp to Bundler: ${this.resolvedConfig.bundlerUrl}`);
    const bundlerClient = createPublicClient({
      transport: http(this.resolvedConfig.bundlerUrl)
    });

    try {
      // Use formatRpcUserOp to get v0.7/0.8 compliant struct
      const rpcOp = this.formatRpcUserOp(userOp);

      console.log('📤 Sending v0.8 UserOp:', JSON.stringify(rpcOp, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
        , 2));

      const uoHash = await bundlerClient.request({
        method: 'eth_sendUserOperation' as any,
        params: [rpcOp, entryPoint]
      }) as Hex;

      console.log(`✅ UserOp Sent! Hash: ${uoHash}`);
      return uoHash;
    } catch (error) {
      console.error('❌ Failed to send UserOp:', error);
      throw error;
    }
  }

  /**
   * Compute userOpHash for EntryPoint v0.7
   * hash = keccak256(abi.encode(keccak256(pack(userOp)), entryPoint, chainId))
   */
  private computeUserOpHash(userOp: UserOperation, entryPoint: Address, chainId: bigint): Hex {
    // Ensure initCode and paymasterAndData have safe defaults
    const initCode = userOp.initCode || '0x' as Hex;
    const paymasterAndData = userOp.paymasterAndData || '0x' as Hex;

    // Pack the UserOp fields for v0.7 (PackedUserOperation hash)
    // For v0.7+ we need to pack accountGasLimits and gasFees
    const accountGasLimits = concat([
      pad(toHex(userOp.verificationGasLimit), { size: 16 }),
      pad(toHex(userOp.callGasLimit), { size: 16 })
    ]);

    const gasFees = concat([
      pad(toHex(userOp.maxPriorityFeePerGas), { size: 16 }),
      pad(toHex(userOp.maxFeePerGas), { size: 16 })
    ]);

    // Hash of packed UserOp (without signature)
    const packedHash = keccak256(encodePacked(
      ['address', 'uint256', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32'],
      [
        userOp.sender,
        userOp.nonce,
        keccak256(initCode),
        keccak256(userOp.callData),
        accountGasLimits,
        userOp.preVerificationGas,
        gasFees,
        keccak256(paymasterAndData)
      ]
    ));

    // Final userOpHash includes entryPoint and chainId
    const userOpHash = keccak256(encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
      [packedHash, entryPoint, chainId]
    ));

    return userOpHash;
  }


  /**
   * Helper to format UserOp for v0.7/0.8 RPC (Unpacked)
   */
  private formatRpcUserOp(userOp: UserOperation): any {
    const factory = (userOp.initCode && userOp.initCode.length > 2)
      ? userOp.initCode.slice(0, 42) as Address
      : undefined;
    const factoryData = (userOp.initCode && userOp.initCode.length > 2)
      ? ('0x' + userOp.initCode.slice(42)) as Hex
      : undefined;

    const hasPaymaster = userOp.paymasterAndData && userOp.paymasterAndData.length > 2;
    const paymaster = hasPaymaster
      ? userOp.paymasterAndData.slice(0, 42) as Address
      : undefined;
    const paymasterData = hasPaymaster
      ? ('0x' + userOp.paymasterAndData.slice(42)) as Hex
      : undefined;

    // Filter out undefined values automatically by JSON.stringify but manual here for clarity
    return {
      sender: userOp.sender,
      nonce: toHex(userOp.nonce),
      factory,
      factoryData,
      callData: userOp.callData,
      callGasLimit: toHex(userOp.callGasLimit),
      verificationGasLimit: toHex(userOp.verificationGasLimit),
      preVerificationGas: toHex(userOp.preVerificationGas),
      maxFeePerGas: toHex(userOp.maxFeePerGas),
      maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
      paymaster,
      paymasterVerificationGasLimit: hasPaymaster ? toHex(300000n) : undefined,
      paymasterPostOpGasLimit: hasPaymaster ? toHex(100000n) : undefined,
      paymasterData,
      signature: userOp.signature
    };
  }
}


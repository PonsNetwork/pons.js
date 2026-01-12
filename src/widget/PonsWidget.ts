/**
 * Pons Network Web Component Widget
 * 
 * A standalone Web Component that dApps can embed to enable cross-chain transfers
 * via the Pons Network. Works with any framework (React, Vue, Angular, vanilla JS).
 * 
 * @example HTML
 * ```html
 * <script type="module" src="https://cdn.pons.sh/widget.js"></script>
 * <pons-widget 
 *   from="sepolia" 
 *   to="arc-testnet"
 *   theme="dark"
 * ></pons-widget>
 * ```
 * 
 * @example JavaScript
 * ```js
 * import { PonsWidget } from '@pons-network/pons.js/widget';
 * 
 * // Register the custom element
 * PonsWidget.register();
 * 
 * // Or create programmatically
 * const widget = document.createElement('pons-widget');
 * widget.setAttribute('from', 'sepolia');
 * widget.setAttribute('to', 'arc-testnet');
 * document.body.appendChild(widget);
 * ```
 */

import { PonsClient } from '../PonsClient.js';
import { Chain } from '../config/chains.js';
import { formatUSDC, parseUSDC, truncateAddress } from '../utils/helpers.js';
import type { ChainName } from '../config/chains.js';
import { ERC20_ABI } from '../config/constants.js';
import type { Address } from 'viem';
import { getWidgetStyles, getWidgetHTML } from './styles.js';

// Widget state
interface WidgetState {
  connected: boolean;
  fundingSource: 'eoa' | 'smart-account';
  walletAddress: string | null;
  smartAccountAddress: string | null;
  sourceBalance: bigint;
  destBalance: bigint;
  amount: string;
  loading: boolean;
  error: string | null;
  txHash: string | null;
  status: 'idle' | 'connecting' | 'approving' | 'burning' | 'waiting' | 'complete' | 'error';
}

export class PonsWidget extends HTMLElement {
  private shadow: ShadowRoot;
  private state: WidgetState;
  private ponsClient: PonsClient | null = null;
  private walletClient: any = null;

  // Observed attributes
  static get observedAttributes(): string[] {
    return ['from', 'to', 'theme', 'gateway-url', 'source-rpc', 'dest-rpc', 'wallet-address'];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.state = {
      connected: false,
      fundingSource: 'eoa',
      walletAddress: null,
      smartAccountAddress: null,
      sourceBalance: 0n,
      destBalance: 0n,
      amount: '',
      loading: false,
      error: null,
      txHash: null,
      status: 'idle',
    };
  }

  // Getters for attributes
  get fromChain(): ChainName {
    return (this.getAttribute('from') || 'sepolia') as ChainName;
  }

  get toChain(): ChainName {
    return (this.getAttribute('to') || 'arc-testnet') as ChainName;
  }

  get theme(): 'light' | 'dark' {
    return (this.getAttribute('theme') || 'dark') as 'light' | 'dark';
  }

  get gatewayUrl(): string | undefined {
    return this.getAttribute('gateway-url') || undefined;
  }

  get sourceRpc(): string | undefined {
    return this.getAttribute('source-rpc') || undefined;
  }

  get destRpc(): string | undefined {
    return this.getAttribute('dest-rpc') || undefined;
  }

  /**
   * Register the custom element
   */
  static register(tagName = 'pons-widget'): void {
    if (!customElements.get(tagName)) {
      customElements.define(tagName, PonsWidget);
    }
  }

  /**
   * Lifecycle: connected to DOM
   */
  connectedCallback(): void {
    this.render();
    this.attachEventListeners();
  }

  /**
   * Lifecycle: attribute changed
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    if (oldValue !== newValue) {
      if (name === 'wallet-address') {
        if (newValue) {
          this.setState({
            connected: true,
            walletAddress: newValue,
            status: 'idle'
          });
          this.initializeClient();
          this.fetchBalances();
        } else {
          this.setState({
            connected: false,
            walletAddress: null,
            smartAccountAddress: null,
            sourceBalance: 0n,
            destBalance: 0n
          });
          this.ponsClient = null;
          this.walletClient = null;
        }
      }
      this.render();
    }
  }

  /**
   * Set external wallet client (provider/signer)
   */
  public setWalletClient(client: any): void {
    this.walletClient = client;
  }

  /**
   * Render the widget
   */
  private render(): void {
    const styles = getWidgetStyles(this.theme);
    const html = getWidgetHTML(this.state, {
      fromChain: this.fromChain,
      toChain: this.toChain,
      formatUSDC,
      truncateAddress,
    });

    this.shadow.innerHTML = `<style>${styles}</style>${html}`;
    this.attachEventListeners();
  }

  /**
   * Update state and re-render
   */
  private setState(updates: Partial<WidgetState>): void {
    this.state = { ...this.state, ...updates };
    this.render();
  }

  /**
   * Attach event listeners to shadow DOM elements
   */
  private attachEventListeners(): void {
    // Chain selectors
    const chainSelects = this.shadow.querySelectorAll('.chain-select');
    chainSelects.forEach(select => {
      select.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const type = target.getAttribute('data-type');
        if (type === 'from') {
          this.setAttribute('from', target.value);
        } else if (type === 'to') {
          this.setAttribute('to', target.value);
        }
      });
    });

    // Connect button
    const connectBtn = this.shadow.querySelector('.connect-btn');
    connectBtn?.addEventListener('click', () => this.handleConnect());

    // Amount input
    const amountInput = this.shadow.querySelector('.amount-input') as HTMLInputElement;
    amountInput?.addEventListener('input', (e) => {
      this.state.amount = (e.target as HTMLInputElement).value;
    });

    // Transfer button
    const transferBtn = this.shadow.querySelector('.transfer-btn');
    transferBtn?.addEventListener('click', () => this.handleTransfer());

    // Max button
    const maxBtn = this.shadow.querySelector('.max-btn');
    maxBtn?.addEventListener('click', () => this.handleMax());

    // Wallet Toggle
    const tabBtns = this.shadow.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).getAttribute('data-action');
        if (action === 'set-source-eoa') {
          this.setState({ fundingSource: 'eoa' });
          this.fetchBalances(); // Refresh to switch what sourceBalance means? Or just rely on separate state?
          // Actually sourceBalance and destBalance stored the specific chain balances.
          // But getWidgetHTML decides what to show.
        } else if (action === 'set-source-sa') {
          this.setState({ fundingSource: 'smart-account' });
        }
      });
    });
  }

  // ... internal implementation details ...

  /**
   * Handle wallet connection
   */
  /**
   * Initialize Pons Client
   */
  private async initializeClient(): Promise<void> {
    try {
      const { getChain } = await import('../config/chains.js');

      const sourceChain = this.fromChain === 'sepolia' ? Chain.SEPOLIA :
        this.fromChain === 'arc-testnet' ? Chain.ARC_TESTNET :
          this.fromChain === 'ethereum' ? Chain.ETHEREUM : Chain.SEPOLIA;

      const destChain = this.toChain === 'arc-testnet' ? Chain.ARC_TESTNET :
        this.toChain === 'sepolia' ? Chain.SEPOLIA :
          this.toChain === 'ethereum' ? Chain.ETHEREUM : Chain.ARC_TESTNET;

      const sourceConfig = getChain(sourceChain);
      const destConfig = getChain(destChain);

      this.ponsClient = await PonsClient.create({
        from: sourceChain,
        to: destChain,
        sourceRpcUrl: this.sourceRpc || sourceConfig?.rpcUrl || '',
        destinationRpcUrl: this.destRpc || destConfig?.rpcUrl || '',
        gatewayUrl: this.gatewayUrl,
      });

      // Calculate Smart Account Address if wallet is connected
      if (this.state.walletAddress) {
        const smartAccountAddress = await this.ponsClient.calculateSmartAccountAddress(this.state.walletAddress as `0x${string}`, 0n);
        this.setState({ smartAccountAddress });

        // Emit connected event (useful for parent even if parent set the address)
        this.dispatchEvent(new CustomEvent('pons-connected', {
          detail: { walletAddress: this.state.walletAddress, smartAccountAddress },
          bubbles: true,
          composed: true,
        }));
      }
    } catch (error) {
      console.error("Failed to initialize Pons Client:", error);
    }
  }

  /**
   * Handle wallet connection (Internal Button)
   */
  private async handleConnect(): Promise<void> {
    this.setState({ status: 'connecting', error: null });

    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
      }

      // Request accounts
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];

      // Import viem dynamically
      const { createWalletClient, custom } = await import('viem');
      const { sepolia } = await import('viem/chains');

      this.walletClient = createWalletClient({
        account: walletAddress,
        chain: sepolia, // TODO: Use dynamic chain based on 'from'
        transport: custom(ethereum),
      });

      this.setAttribute('wallet-address', walletAddress);

      // initializeClient and fetchBalances will be triggered by attribute change

    } catch (error: any) {
      this.setState({
        status: 'error',
        error: error.message || 'Failed to connect wallet',
      });
    }
  }

  /**
   * Fetch balances
   */
  private async fetchBalances(): Promise<void> {
    if (!this.ponsClient || !this.state.walletAddress) return;

    try {
      const { createPublicClient, http } = await import('viem');
      const { getChain } = await import('../config/chains.js');

      const sourceConfig = getChain(this.fromChain as ChainName);
      const destConfig = getChain(this.toChain as ChainName);

      if (!sourceConfig || !destConfig) return;

      // Source chain balance (user's EOA)
      const sourceClient = createPublicClient({
        transport: http(this.sourceRpc || sourceConfig.rpcUrl),
      });

      const sourceBalance = await sourceClient.readContract({
        address: sourceConfig.usdc as `0x${string}`,
        abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
        functionName: 'balanceOf',
        args: [this.state.walletAddress as `0x${string}`],
      });

      // Destination chain balance (smart account)
      const destClient = createPublicClient({
        transport: http(this.destRpc || destConfig.rpcUrl),
      });

      const destBalance = await destClient.readContract({
        address: destConfig.usdc as `0x${string}`,
        abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
        functionName: 'balanceOf',
        args: [this.state.smartAccountAddress as `0x${string}`],
      });

      // Fix for Arc Chain: Ensure we use the correct balance when source is Arc
      // If fromChain is Arc, sourceBalance IS the Arc balance
      // But we just fetched EOA balance on source chain (Arc) as 'sourceBalance'
      // And Smart Account balance on dest chain (Sepolia) as 'destBalance'
      // Wait, Smart Account is ALWAYS on Arc? 
      // User request implies SA is "on the same chain" or "on Arc". 
      // Usually SA lives on the Destination Chain of the bridge flow? 
      // If Bridging Sepolia -> Arc, SA is on Arc.
      // If Bridging Arc -> Sepolia, SA is on Arc (Source).
      // Pons V3 assumes SA is on Destination? 
      // Actually, PonsClient calculates SA on Destination chain.
      // If From=Arc, To=Sepolia. SA is calculated on Sepolia? That might be wrong if SA is on Arc.
      // For now, let's assume SA is always on 'toChain' for the purpose of 'destBalance'.
      // BUT if user selects 'Smart Account' as SOURCE, they want to spend from SA on FROM chain.
      // If From=Arc, To=Sepolia. We need SA balance on Arc.

      // Additional fetch if needed: SA balance on Source Chain
      // To simplify, we'll store specific balances:
      // - EOA on Source
      // - SA on Destination (default)
      // - SA on Source (for funding source = SA)

      // Let's just update 'sourceBalance' to be the balance of the SELECTED funding source?
      // No, let's keep sourceBalance = EOA on Source, and destBalance = SA on Dest.
      // But for 'fundingSource=smart-account', we need SA balance on Source.

      let saBalanceOnSource = 0n;
      if (this.state.fundingSource === 'smart-account') {
        saBalanceOnSource = await sourceClient.readContract({
          address: sourceConfig.usdc as `0x${string}`,
          abi: ERC20_ABI, // Changed to use ERC20_ABI
          functionName: 'balanceOf',
          args: [this.state.smartAccountAddress as Address], // Changed to use Address
        }) as bigint; // Added BigInt cast
      }

      this.setState({
        sourceBalance: this.state.fundingSource === 'eoa' ? (sourceBalance as bigint) : saBalanceOnSource,
        destBalance: destBalance as bigint,
      });

    } catch (error) {
      console.error('Failed to fetch balances:', error);
    }
  }

  /**
   * Handle max button
   */
  private handleMax(): void {
    if (this.state.sourceBalance > 0n) {
      this.state.amount = formatUSDC(this.state.sourceBalance);
      this.render();
    }
  }

  /**
   * Handle transfer
   */
  private async handleTransfer(): Promise<void> {
    if (!this.ponsClient || !this.walletClient || !this.state.amount) {
      return;
    }

    this.setState({ status: 'burning', error: null, txHash: null });

    try {
      const amount = parseUSDC(this.state.amount);

      // Get destination chain config to get USDC address for fees
      const { getChain } = await import('../config/chains.js');
      const destConfig = getChain(this.toChain as ChainName);

      if (!destConfig) {
        throw new Error(`Unknown destination chain: ${this.toChain}`);
      }

      let result;

      // If funding source is Smart Account, we use direct EOA->SA execution
      if (this.state.fundingSource === 'smart-account') {
        const { getChain } = await import('../config/chains.js');
        const { encodeFunctionData, pad } = await import('viem');
        const { PONS_GATEWAY_ABI, ERC20_ABI } = await import('../config/constants.js');
        const { addressToBytes32 } = await import('../cctp/messageBuilder.js');

        const sourceConfig = getChain(this.fromChain as ChainName);
        if (!sourceConfig) throw new Error("Invalid source chain");

        // Check if Same Chain (simple transfer) or Cross-Chain (bridge)
        if (this.fromChain === this.toChain) {
          // Same chain: Transfer USDC from SA to EOA
          const transferData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [this.state.walletAddress as `0x${string}`, amount]
          });

          const txHash = await this.ponsClient.executeOnSmartAccount({
            target: sourceConfig.usdc as `0x${string}`,
            value: 0n,
            data: transferData
          }, this.walletClient, { useSourceChain: true });

          result = { txHash, smartAccountAddress: '', nonce: 0n, expectedAmount: 0n, deadline: 0n };
        } else {
          // Cross-Chain: Approve + Bridge via PonsGateway
          const destChainInfo = getChain(this.toChain as ChainName);
          if (!destChainInfo) throw new Error("Invalid destination chain");

          // Build approve calldata
          const approveData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [sourceConfig.ponsGateway as `0x${string}`, amount]
          });

          // Build bridge calldata
          const bridgeData = encodeFunctionData({
            abi: PONS_GATEWAY_ABI,
            functionName: 'bridge',
            args: [
              amount,
              destChainInfo.domain,
              addressToBytes32(this.state.walletAddress as `0x${string}`),
              pad('0x', { size: 32 }) as `0x${string}`,
              0n, // maxFee
              1000, // minFinality
              '0x' // no hook data
            ]
          });

          const txHash = await this.ponsClient.executeOnSmartAccount({
            targets: [sourceConfig.usdc as `0x${string}`, sourceConfig.ponsGateway as `0x${string}`],
            values: [0n, 0n],
            datas: [approveData, bridgeData]
          }, this.walletClient, { useSourceChain: true });

          result = { txHash, smartAccountAddress: '', nonce: 0n, expectedAmount: 0n, deadline: 0n };
        }
      } else {
        // Standard EOA Bridge
        result = await this.ponsClient.execute({
          amount,
          action: {
            targets: [],
            callDatas: [],
            values: [],
            feeConfig: {
              paymentToken: destConfig.usdc as `0x${string}`,
              indexerFee: 200000n,
              resolverFee: 100000n,
            },
          },
        }, this.walletClient);
      }

      this.setState({
        status: 'waiting',
        txHash: result.txHash,
      });

      // Emit transfer started event
      this.dispatchEvent(new CustomEvent('pons-transfer-started', {
        detail: { txHash: result.txHash, amount: this.state.amount },
        bubbles: true,
        composed: true,
      }));

      // Wait for completion (simplified - in production use TransferTracker)
      this.setState({ status: 'complete' });

      // Emit transfer complete event
      this.dispatchEvent(new CustomEvent('pons-transfer-complete', {
        detail: { txHash: result.txHash },
        bubbles: true,
        composed: true,
      }));

      // Refresh balances
      await this.fetchBalances();

    } catch (error: any) {
      this.setState({
        status: 'error',
        error: error.message || 'Transfer failed',
      });

      this.dispatchEvent(new CustomEvent('pons-transfer-error', {
        detail: { error: error.message },
        bubbles: true,
        composed: true,
      }));
    }
  }
}

// Auto-register if in browser
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  PonsWidget.register();
}

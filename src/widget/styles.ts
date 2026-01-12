/**
 * Pons Widget Styles
 * CSS-in-JS for the Web Component
 */

export function getWidgetStyles(theme: 'light' | 'dark'): string {
  const isDark = theme === 'dark';

  const colors = isDark ? {
    bg: '#1a1b23',
    bgSecondary: '#252631',
    text: '#ffffff',
    textSecondary: '#9ca3af',
    border: '#374151',
    primary: '#6366f1',
    primaryHover: '#4f46e5',
    success: '#10b981',
    error: '#ef4444',
    inputBg: '#1f2937',
  } : {
    bg: '#ffffff',
    bgSecondary: '#f9fafb',
    text: '#111827',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
    primary: '#6366f1',
    primaryHover: '#4f46e5',
    success: '#10b981',
    error: '#ef4444',
    inputBg: '#f3f4f6',
  };

  return `
    :host {
      display: block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    .pons-widget {
      background: ${colors.bg};
      border: 1px solid ${colors.border};
      border-radius: 16px;
      padding: 24px;
      max-width: 420px;
      color: ${colors.text};
    }

    .pons-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }

    .pons-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 18px;
    }

    .pons-logo svg {
      width: 24px;
      height: 24px;
    }

    .wallet-info {
      font-size: 12px;
      color: ${colors.textSecondary};
      background: ${colors.bgSecondary};
      padding: 6px 12px;
      border-radius: 8px;
    }

    .chain-selector {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .chain-box {
      flex: 1;
      background: ${colors.bgSecondary};
      border-radius: 12px;
      padding: 12px;
      text-align: center;
    }

    .chain-label {
      font-size: 11px;
      color: ${colors.textSecondary};
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .chain-name {
      font-weight: 600;
      font-size: 14px;
    }

    .chain-select {
      width: 100%;
      background: transparent;
      border: none;
      color: ${colors.text};
      font-weight: 600;
      font-size: 14px;
      outline: none;
      cursor: pointer;
      padding: 0;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
      background-repeat: no-repeat;
      background-position: right center;
      background-size: 16px;
      padding-right: 20px;
    }

    .chain-select option {
      background: ${colors.bgSecondary};
      color: ${colors.text};
    }

    .chain-arrow {
      color: ${colors.primary};
      font-size: 20px;
    }

    .amount-section {
      margin-bottom: 16px;
    }

    .amount-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .balance {
      color: ${colors.textSecondary};
    }

    .input-row {
      display: flex;
      background: ${colors.inputBg};
      border-radius: 12px;
      padding: 12px;
      gap: 8px;
    }

    .amount-input {
      flex: 1;
      background: transparent;
      border: none;
      font-size: 24px;
      font-weight: 600;
      color: ${colors.text};
      outline: none;
    }

    .amount-input::placeholder {
      color: ${colors.textSecondary};
    }

    .max-btn {
      background: ${colors.primary};
      color: white;
      border: none;
      border-radius: 6px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .max-btn:hover {
      background: ${colors.primaryHover};
    }

    .token-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
    }

    .connect-btn, .transfer-btn {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .connect-btn {
      background: ${colors.primary};
      color: white;
    }

    .connect-btn:hover {
      background: ${colors.primaryHover};
    }

    .transfer-btn {
      background: ${colors.primary};
      color: white;
    }

    .transfer-btn:hover:not(:disabled) {
      background: ${colors.primaryHover};
    }

    .transfer-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .status-section {
      margin-top: 16px;
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
    }

    .status-waiting {
      background: ${colors.bgSecondary};
      color: ${colors.textSecondary};
    }

    .status-complete {
      background: rgba(16, 185, 129, 0.1);
      color: ${colors.success};
    }

    .status-error {
      background: rgba(239, 68, 68, 0.1);
      color: ${colors.error};
    }

    .dest-balance {
      margin-top: 12px;
      padding: 12px;
      background: ${colors.bgSecondary};
      border-radius: 8px;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
    }

    .loading {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid ${colors.textSecondary};
      border-top-color: ${colors.primary};
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      opacity: 0;
      visibility: hidden;
      transition: all 0.2s;
    }

    .modal-overlay.open {
      opacity: 1;
      visibility: visible;
    }

    .modal-content {
      background: ${colors.bg};
      border: 1px solid ${colors.border};
      border-radius: 24px;
      padding: 32px;
      width: 100%;
      max-width: 480px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
      transform: translateY(20px);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .modal-overlay.open .modal-content {
      transform: translateY(0);
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }

    .modal-title {
      font-size: 20px;
      font-weight: 700;
    }

    .close-btn {
      background: transparent;
      border: none;
      color: ${colors.textSecondary};
      cursor: pointer;
      font-size: 24px;
      padding: 4px;
      line-height: 1;
    }

    .close-btn:hover {
      color: ${colors.text};
    }

    .account-section {
      background: ${colors.bgSecondary};
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .section-label {
      font-size: 12px;
      color: ${colors.textSecondary};
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }

    .address-display {
      font-family: monospace;
      font-size: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .copy-icon {
      cursor: pointer;
      font-size: 14px;
      color: ${colors.textSecondary};
    }
    .copy-icon:hover { color: ${colors.primary}; }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 20px;
      background: ${colors.bgSecondary};
      padding: 4px;
      border-radius: 12px;
    }
    
    .tab-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: ${colors.textSecondary};
      padding: 8px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .tab-btn:hover {
      color: ${colors.text};
    }
    
    .tab-btn.active {
      background: ${colors.bg};
      color: ${colors.text};
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }

    /* Form */
    .form-group {
      margin-bottom: 16px;
    }
    
    .form-label {
      display: block;
      font-size: 12px;
      color: ${colors.textSecondary};
      margin-bottom: 6px;
    }
    
    .form-input {
      width: 100%;
      background: ${colors.inputBg};
      border: 1px solid transparent;
      border-radius: 12px;
      padding: 12px;
      color: ${colors.text};
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
    }
    
    .form-input:focus {
      border-color: ${colors.primary};
    }

    .token-select {
        appearance: none;
        background: ${colors.inputBg};
        border: none;
        color: ${colors.text};
        padding: 8px 12px;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        outline: none;
    }
  `;
}

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

interface HTMLContext {
  fromChain: string;
  toChain: string;
  formatUSDC: (amount: bigint) => string;
  truncateAddress: (address: string) => string;
}

export function getWidgetHTML(state: WidgetState, ctx: HTMLContext): string {
  const chainDisplayName = (chain: string) => {
    const names: Record<string, string> = {
      'sepolia': 'Sepolia',
      'ethereum': 'Ethereum',
      'arc-testnet': 'Arc Testnet',
      'arc': 'Arc Network',
      'base': 'Base',
      'arbitrum': 'Arbitrum',
    };
    return names[chain] || chain;
  };

  const ponsLogo = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L4 6v12l8 4 8-4V6l-8-4z" fill="currentColor" opacity="0.3"/>
    <path d="M12 2L4 6l8 4 8-4-8-4z" fill="currentColor"/>
    <path d="M12 22v-8l8-4v8l-8 4z" fill="currentColor" opacity="0.7"/>
  </svg>`;

  if (!state.connected) {
    return `
      <div class="pons-widget">
        <div class="pons-header">
          <div class="pons-logo">${ponsLogo} Pons</div>
        </div>
        <div class="chain-selector">
          <div class="chain-box">
            <div class="chain-label">From</div>
            <div class="chain-name">${chainDisplayName(ctx.fromChain)}</div>
          </div>
          <div class="chain-arrow">→</div>
          <div class="chain-box">
            <div class="chain-label">To</div>
            <div class="chain-name">${chainDisplayName(ctx.toChain)}</div>
          </div>
        </div>
        <button class="connect-btn">
          ${state.status === 'connecting' ? '<span class="loading"></span> Connecting...' : '🔗 Connect Wallet'}
        </button>
        ${state.error ? `<div class="status-section status-error">❌ ${state.error}</div>` : ''}
      </div>
    `;
  }

  const statusHTML = (): string => {
    switch (state.status) {
      case 'approving':
        return `<div class="status-section status-waiting"><span class="loading"></span> Approving USDC...</div>`;
      case 'burning':
        return `<div class="status-section status-waiting"><span class="loading"></span> Burning USDC on source chain...</div>`;
      case 'waiting':
        return `<div class="status-section status-waiting"><span class="loading"></span> Waiting for attestation...</div>`;
      case 'complete':
        return `<div class="status-section status-complete">✅ Transfer complete!</div>`;
      case 'error':
        return `<div class="status-section status-error">❌ ${state.error}</div>`;
      default:
        return '';
    }
  };

  // Determine displayed balance based on funding source
  const displayedBalance = state.fundingSource === 'eoa' ? state.sourceBalance : state.destBalance;
  const balanceLabel = state.fundingSource === 'eoa' ? 'EOA Balance' : 'Smart Account';

  return `
    <div class="pons-widget">
      <div class="pons-header">
        <div class="pons-logo">${ponsLogo} Pons</div>
        <div class="wallet-info">${ctx.truncateAddress(state.fundingSource === 'eoa' ? state.walletAddress! : state.smartAccountAddress!)}</div>
      </div>
      
      <!-- Wallet Toggle -->
      <div class="tabs" style="margin-bottom: 16px;">
        <button class="tab-btn ${state.fundingSource === 'eoa' ? 'active' : ''}" data-action="set-source-eoa">EOA Wallet</button>
        <button class="tab-btn ${state.fundingSource === 'smart-account' ? 'active' : ''}" data-action="set-source-sa">Smart Account</button>
      </div>

      <div class="chain-selector">
        <div class="chain-box">
          <div class="chain-label">From</div>
          <select class="chain-select" data-type="from">
            <option value="sepolia" ${ctx.fromChain === 'sepolia' ? 'selected' : ''}>Sepolia</option>
            <option value="arc-testnet" ${ctx.fromChain === 'arc-testnet' ? 'selected' : ''}>Arc Testnet</option>
            <option value="ethereum" ${ctx.fromChain === 'ethereum' ? 'selected' : ''}>Ethereum</option>
            <option value="base" ${ctx.fromChain === 'base' ? 'selected' : ''}>Base</option>
            <option value="arbitrum" ${ctx.fromChain === 'arbitrum' ? 'selected' : ''}>Arbitrum</option>
          </select>
        </div>
        <div class="chain-arrow">→</div>
        <div class="chain-box">
          <div class="chain-label">To</div>
          <select class="chain-select" data-type="to">
            <option value="sepolia" ${ctx.toChain === 'sepolia' ? 'selected' : ''}>Sepolia</option>
            <option value="arc-testnet" ${ctx.toChain === 'arc-testnet' ? 'selected' : ''}>Arc Testnet</option>
            <option value="ethereum" ${ctx.toChain === 'ethereum' ? 'selected' : ''}>Ethereum</option>
            <option value="base" ${ctx.toChain === 'base' ? 'selected' : ''}>Base</option>
            <option value="arbitrum" ${ctx.toChain === 'arbitrum' ? 'selected' : ''}>Arbitrum</option>
          </select>
        </div>
      </div>
      <div class="amount-section">
        <div class="amount-header">
          <span>Amount</span>
          <span class="balance">${balanceLabel}: ${ctx.formatUSDC(displayedBalance)} USDC</span>
        </div>
        <div class="input-row">
          <input type="text" class="amount-input" placeholder="0.00" value="${state.amount}" />
          <button class="max-btn">MAX</button>
          <div class="token-badge">USDC</div>
        </div>
      </div>
      <button class="transfer-btn" ${state.status !== 'idle' ? 'disabled' : ''}>
        ${state.status === 'idle' ? (state.fundingSource === 'eoa' ? '🌉 Bridge via Pons' : '💸 Transfer from SA') : '<span class="loading"></span> Processing...'}
      </button>
      ${statusHTML()}
      
      <!-- Show other balance for info -->
      <div class="dest-balance">
        <span>${state.fundingSource === 'eoa' ? 'Smart Account' : 'EOA'} Balance</span>
        <span>${ctx.formatUSDC(state.fundingSource === 'eoa' ? state.destBalance : state.sourceBalance)} USDC</span>
      </div>
    </div>
  `;
}


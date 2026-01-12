/**
 * Pons Widget - Web Component for dApp integration
 * 
 * @example
 * ```html
 * <script type="module">
 *   import { PonsWidget } from '@pons-network/pons.js/widget';
 *   PonsWidget.register();
 * </script>
 * 
 * <pons-widget from="sepolia" to="arc-testnet" theme="dark"></pons-widget>
 * ```
 */

export { PonsWidget } from './PonsWidget.js';
export { PonsAccountModal } from './PonsAccountModal.js';
export { getWidgetStyles, getWidgetHTML } from './styles.js';


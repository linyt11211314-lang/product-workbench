/**
 * 智能定价存储（localStorage 持久化最近一次输入与参数）
 */
import { SYSTEM_PRICING_PARAMS } from '../services/pricing.js';

const KEY_INPUT = 'sgn.pricing.input';
const KEY_PARAMS = 'sgn.pricing.params';

export function getPricingParams() {
  try {
    return { ...SYSTEM_PRICING_PARAMS, ...JSON.parse(localStorage.getItem(KEY_PARAMS) || '{}') };
  } catch { return { ...SYSTEM_PRICING_PARAMS }; }
}
export function savePricingParams(params) {
  try { localStorage.setItem(KEY_PARAMS, JSON.stringify(params)); } catch {}
  return params;
}
export function getPricingInput() {
  try { return JSON.parse(localStorage.getItem(KEY_INPUT) || '{}'); } catch { return {}; }
}
export function savePricingInput(input) {
  try { localStorage.setItem(KEY_INPUT, JSON.stringify(input)); } catch {}
  return input;
}

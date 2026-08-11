/**
 * 智能定价页面 —— 基于 services/pricing.js
 */
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import {
  SYSTEM_PRICING_PARAMS, calculatePricing, generateTargetMarginPriceTiers, roundUpToAmazon99,
  reversePriceByProfit, reversePriceByMargin,
} from '../services/pricing.js';
import { getPricingParams, savePricingParams, getPricingInput, savePricingInput } from '../store/pricingStore.js';

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');

export function render(container, ctx = {}) {
  const params = getPricingParams();
  const last = getPricingInput();

  container.innerHTML = `
    <div class="card">
      <div class="card-title">${icon('target')} 智能定价 · AED 售价测算</div>
      <p class="muted" style="margin:0 0 14px">输入尺寸/重量/成本，自动按体积重与实重取大值计抛，反推含佣金、广告、退货、VAT 的保本/目标利润售价（AED）。</p>
      <div class="pricing-grid">
        <div>
          <label class="form-label">长 (cm)</label>
          <input class="input" id="p-l" type="number" value="${last.lengthCm ?? 20}" />
        </div>
        <div><label class="form-label">宽 (cm)</label><input class="input" id="p-w" type="number" value="${last.widthCm ?? 15}" /></div>
        <div><label class="form-label">高 (cm)</label><input class="input" id="p-h" type="number" value="${last.heightCm ?? 10}" /></div>
        <div><label class="form-label">实重 (kg)</label><input class="input" id="p-wt" type="number" value="${last.actualWeightKg ?? 0.5}" /></div>
        <div><label class="form-label">采购成本 (RMB)</label><input class="input" id="p-cost" type="number" value="${last.purchaseRmb ?? 30}" /></div>
        <div><label class="form-label">本地配送 (AED)</label><input class="input" id="p-del" type="number" value="${last.deliveryAed ?? 5}" /></div>
        <div><label class="form-label">目标售价 (AED)</label><input class="input" id="p-price" type="number" value="${last.salePriceAed ?? 89}" /></div>
        <div></div>
      </div>
      <div class="row" style="gap:10px;margin-top:12px">
        <button class="btn btn-primary btn-sm" id="p-calc">${icon('zap')} 计算利润</button>
        <button class="btn btn-soft btn-sm" id="p-tier">${icon('target')} 生成目标利润率三档</button>
      </div>
    </div>

    <div class="card" id="p-result" style="display:none"></div>

    <div class="card">
      <div class="card-title">${icon('settings')} 测算参数（可自定义，自动保存）</div>
      <div class="pricing-grid">
        <div><label class="form-label">汇率 RMB→AED</label><input class="input" id="pa-rate" type="number" step="0.0001" value="${params.exchangeRate}" /></div>
        <div><label class="form-label">体积重除数</label><input class="input" id="pa-div" type="number" value="${params.volumetricDivisor}" /></div>
        <div><label class="form-label">运费 RMB/kg</label><input class="input" id="pa-fr" type="number" step="0.1" value="${params.freightRmbPerKg}" /></div>
        <div><label class="form-label">佣金率</label><input class="input" id="pa-com" type="number" step="0.01" value="${params.commissionRate}" /></div>
        <div><label class="form-label">广告率</label><input class="input" id="pa-ads" type="number" step="0.01" value="${params.adsRate}" /></div>
        <div><label class="form-label">退货率</label><input class="input" id="pa-ret" type="number" step="0.01" value="${params.returnRate}" /></div>
        <div><label class="form-label">VAT 率</label><input class="input" id="pa-vat" type="number" step="0.01" value="${params.vatRate}" /></div>
        <div><label class="form-label">保守档偏移</label><input class="input" id="pa-cd" type="number" step="0.01" value="${params.conservativeDelta}" /></div>
        <div><label class="form-label">激进档偏移</label><input class="input" id="pa-ad" type="number" step="0.01" value="${params.aggressiveDelta}" /></div>
      </div>
      <button class="btn btn-soft btn-sm" id="pa-save" style="margin-top:10px">${icon('save')} 保存参数</button>
    </div>
  `;

  const $ = (id) => container.querySelector(id);
  const readInput = () => ({
    lengthCm: +$('#p-l').value || 0,
    widthCm: +$('#p-w').value || 0,
    heightCm: +$('#p-h').value || 0,
    actualWeightKg: +$('#p-wt').value || 0,
    purchaseRmb: +$('#p-cost').value || 0,
    deliveryAed: +$('#p-del').value || 0,
    salePriceAed: +$('#p-price').value || 0,
  });
  const readParams = () => ({
    exchangeRate: +$('#pa-rate').value || SYSTEM_PRICING_PARAMS.exchangeRate,
    volumetricDivisor: +$('#pa-div').value || SYSTEM_PRICING_PARAMS.volumetricDivisor,
    freightRmbPerKg: +$('#pa-fr').value || SYSTEM_PRICING_PARAMS.freightRmbPerKg,
    commissionRate: +$('#pa-com').value || 0,
    adsRate: +$('#pa-ads').value || 0,
    returnRate: +$('#pa-ret').value || 0,
    vatRate: +$('#pa-vat').value || 0,
    conservativeDelta: +$('#pa-cd').value || 0,
    aggressiveDelta: +$('#pa-ad').value || 0,
  });

  function showResult(input, p, r) {
    const el = $('#p-result');
    el.style.display = 'block';
    el.innerHTML = `
      <div class="card-title">${icon('chart')} 测算结果</div>
      <div class="kv-grid">
        <div><span>体积重</span><b>${fmt(r.volumetricWeightKg, 3)} kg</b></div>
        <div><span>计费重</span><b>${fmt(r.chargeableWeightKg, 3)} kg</b></div>
        <div><span>运费</span><b>${fmt(r.freightAed)} AED</b></div>
        <div><span>采购成本</span><b>${fmt(r.purchaseAed)} AED</b></div>
        <div><span>固定成本合计</span><b>${fmt(r.fixedCostAed)} AED</b></div>
        <div><span>佣金</span><b>${fmt(r.commissionAed)} AED</b></div>
        <div><span>广告</span><b>${fmt(r.adsAed)} AED</b></div>
        <div><span>退货</span><b>${fmt(r.returnAed)} AED</b></div>
        <div><span>VAT</span><b>${fmt(r.vatAed)} AED</b></div>
        <div><span>净利润</span><b class="${r.netProfitAed >= 0 ? 'pos' : 'neg'}">${fmt(r.netProfitAed)} AED</b></div>
        <div><span>净利润率</span><b class="${r.netMargin >= 0 ? 'pos' : 'neg'}">${fmt(r.netMargin * 100, 1)}%</b></div>
      </div>`;
  }

  $('#p-calc').onclick = () => {
    const input = readInput(); const p = readParams();
    savePricingInput(input); savePricingParams(p);
    try {
      const r = calculatePricing(input, p, input.salePriceAed);
      showResult(input, p, r);
    } catch (e) { toastError(e.message); }
  };

  $('#p-tier').onclick = () => {
    const input = readInput(); const p = readParams();
    savePricingInput(input); savePricingParams(p);
    try {
      const r = calculatePricing(input, p, input.salePriceAed);
      showResult(input, p, r);
      const tiers = generateTargetMarginPriceTiers(input, p, 0.3);
      const el = $('#p-result');
      const div = document.createElement('div');
      div.style.marginTop = '14px';
      div.innerHTML = `<div class="card-title">${icon('target')} 目标利润率 30% 三档售价</div>
        <div class="tier-row">
          <div class="tier"><span>保守</span><b>${fmt(tiers[0])} AED</b></div>
          <div class="tier"><span>基准</span><b>${fmt(tiers[1])} AED</b></div>
          <div class="tier"><span>激进</span><b>${fmt(tiers[2])} AED</b></div>
        </div>`;
      el.appendChild(div);
      toastSuccess('已生成三档售价');
    } catch (e) { toastError(e.message); }
  };

  $('#pa-save').onclick = () => {
    savePricingParams(readParams());
    toastSuccess('参数已保存');
  };
}

function toastError(m) { toast(m, 'error', 4000); }
function toastSuccess(m) { toast(m, 'success'); }

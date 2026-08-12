/**
 * 智能定价服务 —— 移植自 Codex lib/pricing.ts
 * 以 AED（迪拉姆）为售价币种，RMB 为采购/运费币种，按体积重/实重取大值计抛。
 */
export const SYSTEM_PRICING_PARAMS = {
  exchangeRate: 1.8428,
  volumetricDivisor: 6000,
  freightRmbPerKg: 9.3,
  commissionRate: 0.15,
  adsRate: 0.01,
  returnRate: 0.01,
  vatRate: 0.05,
  conservativeDelta: 0.08,
  aggressiveDelta: 0.12,
};

function validate(input, params) {
  const values = [...Object.values(input), ...Object.values(params)];
  if (values.some((v) => !Number.isFinite(v) || v < 0)) throw new Error('输入必须是非负数字');
  if (params.exchangeRate <= 0 || params.volumetricDivisor <= 0) throw new Error('汇率和体积重除数必须大于 0');
}

function costs(input, params) {
  validate(input, params);
  const volumetricWeightKg = (input.lengthCm * input.widthCm * input.heightCm) / params.volumetricDivisor;
  const chargeableWeightKg = Math.max(volumetricWeightKg, input.actualWeightKg);
  const freightRmb = chargeableWeightKg * params.freightRmbPerKg;
  const freightAed = freightRmb / params.exchangeRate;
  const purchaseAed = input.purchaseRmb / params.exchangeRate;
  return {
    volumetricWeightKg,
    chargeableWeightKg,
    freightRmb,
    freightAed,
    purchaseAed,
    fixedCostAed: input.deliveryAed + freightAed + purchaseAed,
  };
}

export function combinedRate(params) {
  return params.commissionRate + params.adsRate + params.returnRate + params.vatRate;
}

export function calculatePricing(input, params, salePriceAed) {
  if (!Number.isFinite(salePriceAed) || salePriceAed < 0) throw new Error('售价必须是非负数字');
  const base = costs(input, params);
  const commissionAed = salePriceAed * params.commissionRate;
  const adsAed = salePriceAed * params.adsRate;
  const returnAed = salePriceAed * params.returnRate;
  const vatAed = salePriceAed * params.vatRate;
  const netProfitAed = salePriceAed - commissionAed - adsAed - returnAed - vatAed - base.fixedCostAed;
  return {
    salePriceAed,
    ...base,
    commissionAed,
    adsAed,
    returnAed,
    vatAed,
    netProfitAed,
    netMargin: salePriceAed === 0 ? 0 : netProfitAed / salePriceAed,
  };
}

export function reversePriceByProfit(input, params, targetProfitAed) {
  const denominator = 1 - combinedRate(params);
  if (denominator <= 0) throw new Error('综合费率过高，无法反推售价');
  return (targetProfitAed + costs(input, params).fixedCostAed) / denominator;
}

export function reversePriceByMargin(input, params, targetMargin) {
  const denominator = 1 - combinedRate(params) - targetMargin;
  if (denominator <= 0) throw new Error('目标利润率与综合费率之和过高，无法反推售价');
  return costs(input, params).fixedCostAed / denominator;
}

export function roundUpToAmazon99(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error('售价必须是非负数字');
  return Number((Math.ceil(value - 0.99 - 1e-9) + 0.99).toFixed(2));
}

export function generateTargetMarginPriceTiers(input, params, targetMargin = 0.3) {
  const target = reversePriceByMargin(input, params, targetMargin);
  return [
    roundUpToAmazon99(target * (1 - params.conservativeDelta)),
    roundUpToAmazon99(target),
    roundUpToAmazon99(target * (1 + params.aggressiveDelta)),
  ];
}

// ===== 选品库 / 产品转交沿用旧版报价模型（兼容 library.js、productTransfer.js）=====
import { AMAZON_SITES } from '../config.js';

const __round2 = (n) => Math.round(n * 100) / 100;

/**
 * 计费重量（kg）：体积重 与 实重 取较大值
 * 体积重(kg) = 长×宽×高(cm³) ÷ 除数（默认 6000）
 * @returns { actual, vol, chargeable } 实重 / 体积重 / 计费重量（kg）
 */
export function calcChargeableWeight({ lengthCm = 0, widthCm = 0, heightCm = 0, weightG = 0, volWeightDivisor = 6000 } = {}) {
  const actual = Number(weightG) / 1000 || 0;
  const d = Number(volWeightDivisor) > 0 ? Number(volWeightDivisor) : 6000;
  const L = Number(lengthCm) || 0;
  const W = Number(widthCm) || 0;
  const H = Number(heightCm) || 0;
  const vol = __round2((L * W * H) / d);
  return { actual, vol, chargeable: __round2(Math.max(actual, vol)) };
}

/**
 * 计算推荐报价（纳入 VAT + 月度仓储 + 退货损耗三项附加费率）
 * 售价 = (采购成本折算 + 头程 + FBA) / (1 - 佣金率 - 广告费 - VAT - 仓储 - 退货 - 目标利润率)
 */
export function calculateQuote(input = {}) {
  const cost = Number(input.cost) || 0;
  const exchangeRate = Number(input.exchangeRate) || 7.2;
  const targetProfitRate = Number(input.targetProfitRate) || 0.3;
  const adRate = Number(input.adRate) || 0.01;
  const referralRate = Number(input.referralRate) || 0.15;
  const avtRate = Number(input.avtRate) || 0;
  const storageRate = Number(input.storageRate) || 0;
  const returnRate = Number(input.returnRate) || 0;
  const fbaFee = Number(input.fbaFee) || 0;
  const shippingPerUnit = Number(input.shippingPerUnit) || 0;
  const symbol = input.symbol || '$';

  if (cost <= 0) return { error: '请填写采购成本' };
  const denom = 1 - referralRate - adRate - avtRate - storageRate - returnRate - targetProfitRate;
  if (denom <= 0.05) {
    return { error: '目标利润率 + 佣金率 + 广告费 + VAT + 仓储 + 退货率合计需低于 95%' };
  }

  const costUsd = __round2(cost / exchangeRate);
  const price = __round2((costUsd + shippingPerUnit + fbaFee) / denom);
  const referral = __round2(price * referralRate);
  const ad = __round2(price * adRate);
  const avt = __round2(price * avtRate);
  const storage = __round2(price * storageRate);
  const returnCost = __round2(price * returnRate);
  const profit = __round2(price - referral - ad - avt - storage - returnCost - fbaFee - shippingPerUnit - costUsd);
  const margin = price > 0 ? profit / price : 0;

  return {
    price,
    profit,
    margin,
    symbol,
    breakdown: {
      costUsd,
      fbaFee,
      shippingPerUnit,
      referral,
      ad,
      avt,
      storage,
      return: returnCost,
      targetProfitRate,
    },
  };
}

/** 默认测算参数（百分比字段为整数，如 30 表示 30%） */
export const DEFAULT_QUOTE = {
  lengthCm: '', widthCm: '', heightCm: '', weightG: '',
  cost: '', exchangeRate: 7.2,
  targetProfitRate: 30, adRate: 1, referralRate: 15,
  avtRate: 5, storageRate: 1, returnRate: 8,
  fbaFee: '', shippingPerUnit: 0, seaFreightRate: '', volWeightDivisor: 6000,
};

/** 快速重算（列表视图用）：缺关键参数（cost）返回 null */
export function quickQuote(q, productSite) {
  if (!q || q.cost == null || q.cost === '' || Number(q.cost) <= 0) return null;
  const siteInfo = AMAZON_SITES.find((s) => s.code === (productSite || q.site || 'US')) || AMAZON_SITES[0];
  const r = calculateQuote({
    cost: q.cost,
    exchangeRate: Number(q.exchangeRate) || siteInfo.rate,
    targetProfitRate: Number(q.targetProfitRate || 30) / 100,
    adRate: Number(q.adRate || 1) / 100,
    referralRate: Number(q.referralRate || 15) / 100,
    avtRate: Number(q.avtRate == null || q.avtRate === '' ? 5 : q.avtRate) / 100,
    storageRate: Number(q.storageRate == null || q.storageRate === '' ? 1 : q.storageRate) / 100,
    returnRate: Number(q.returnRate == null || q.returnRate === '' ? 8 : q.returnRate) / 100,
    fbaFee: q.fbaFee === '' || q.fbaFee == null ? 0 : Number(q.fbaFee),
    shippingPerUnit: Number(q.shippingPerUnit) || 0,
    symbol: siteInfo.symbol,
  });
  if (r.error) return null;
  return r;
}

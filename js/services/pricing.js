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

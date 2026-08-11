/**
 * 数据分析 / 店铺-SKU 表现分析服务 —— 移植自 Codex lib/analysis.ts + source-schema.ts + analysis-summaries.ts
 * 支持从「选品库」直接分析，或导入领星/产品表现 Excel 做批量分析。
 */

// ---- source-schema ----
const SOURCE_FIELDS = {
  sku: ['MSKU', 'SKU', 'AE sku'],
  store: ['店铺', '店铺名称'],
  createdAt: ['创建时间', '上架时间'],
  sales: ['销量', '总销量'],
  sales30: ['30天销量', '近30天销量'],
  categoryRank: ['大类排名'],
  subCategoryRank: ['小类排名'],
  refundRate: ['退款率', '退货率'],
  refundCount: ['退款量', '退货量'],
  rating: ['评分'],
  reviewCount: ['评论数', '评分数'],
  profit: ['订单毛利润', '毛利', '总毛利'],
  revenue: ['销售额', '销售收入'],
  margin: ['订单毛利率', '毛利率'],
  adSpend: ['广告花费', '广告费'],
  available: ['FBA-可售', '可售库存'],
  inbound: ['FBA-在途', '在途库存'],
};

function readSourceValue(row, field) {
  const aliases = SOURCE_FIELDS[field];
  const found = aliases.find((key) => row[key] !== undefined && row[key] !== null && row[key] !== '');
  return found ? row[found] : undefined;
}

export function chooseSheetName(sheetNames, kind) {
  const keyword = kind === 'raw' ? '领星' : '产品表现';
  return sheetNames.find((name) => name.includes(keyword)) ?? sheetNames[0];
}

// ---- analysis ----
export function parseNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  const parsed = Number(String(input ?? '').replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parsePercent(input) {
  if (typeof input === 'string' && input.includes('%')) return parseNumber(input) / 100;
  return parseNumber(input);
}

function extractCategory(input) {
  const rank = String(input ?? '').trim();
  if (!rank) return '未识别类目';
  return (rank.split(/[：:]/, 1)[0] || rank).trim() || '未识别类目';
}

function monthsBetween(input, today) {
  const date = new Date(String(input ?? '').slice(0, 10));
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, (today.getFullYear() - date.getFullYear()) * 12 + today.getMonth() - date.getMonth());
}

function scoreProduct(p) {
  const salesScore = Math.min(35, Math.log10(p.sales + 1) * 17);
  const marginScore = Math.max(0, Math.min(30, p.margin * 100));
  const refundScore = Math.max(0, 20 - p.refundRate * 100);
  const ratingScore = Math.max(0, Math.min(10, p.rating * 2));
  const stockScore = p.sales30 > 0 && p.available + p.inbound < p.sales30 * 0.5 ? 0 : 5;
  return Math.round(salesScore + marginScore + refundScore + ratingScore + stockScore);
}

export function analyzeProducts(rawRows, identities, today = new Date()) {
  const names = new Map(identities.map((item) => [String(item.sku).trim(), String(item.name).trim()]));
  const parsedProducts = rawRows
    .map((row) => {
      const sku = String(readSourceValue(row, 'sku') ?? '').trim();
      if (!sku || !names.has(sku)) return null;
      const categoryRank = String(readSourceValue(row, 'categoryRank') ?? '').trim();
      const base = {
        sku,
        name: names.get(sku) || '待补充',
        store: String(readSourceValue(row, 'store') ?? '未分类').trim() || '未分类',
        createdAt: String(readSourceValue(row, 'createdAt') ?? ''),
        sales: parseNumber(readSourceValue(row, 'sales')),
        sales30: parseNumber(readSourceValue(row, 'sales30')),
        refundRate: parsePercent(readSourceValue(row, 'refundRate')),
        refundCount: parseNumber(readSourceValue(row, 'refundCount')),
        rating: parseNumber(readSourceValue(row, 'rating')),
        reviewCount: parseNumber(readSourceValue(row, 'reviewCount')),
        profit: parseNumber(readSourceValue(row, 'profit')),
        revenue: parseNumber(readSourceValue(row, 'revenue')),
        margin: parsePercent(readSourceValue(row, 'margin')),
        adSpend: parseNumber(readSourceValue(row, 'adSpend')),
        available: parseNumber(readSourceValue(row, 'available')),
        inbound: parseNumber(readSourceValue(row, 'inbound')),
        ageMonths: monthsBetween(readSourceValue(row, 'createdAt'), today),
        category: extractCategory(categoryRank),
        categoryRank,
        subCategoryRank: String(readSourceValue(row, 'subCategoryRank') ?? '').trim(),
      };
      const risks = [];
      if (base.profit <= 0) risks.push('负利润');
      if (base.refundRate >= 0.2) risks.push('高退款');
      if (base.sales === 0) risks.push('零销量');
      if (base.sales30 > 0 && base.available + base.inbound < base.sales30 * 0.5) risks.push('库存风险');
      const healthScore = scoreProduct(base);
      const action = risks.includes('负利润')
        ? '优化利润或淘汰'
        : risks.includes('高退款')
          ? '检查退货原因'
          : risks.includes('库存风险')
            ? '尽快补货'
            : healthScore >= 75
              ? '继续放量'
              : base.sales === 0
                ? '观察或淘汰'
                : '持续优化';
      return { ...base, risks, healthScore, action };
    })
    .filter(Boolean);

  const productsByStoreSku = new Map();
  parsedProducts.forEach((product) => {
    const key = `${product.store}\u0000${product.sku}`;
    const current = productsByStoreSku.get(key);
    if (!current) { productsByStoreSku.set(key, product); return; }
    const revenue = current.revenue + product.revenue;
    const sales = current.sales + product.sales;
    const merged = {
      ...current, sales, sales30: current.sales30 + product.sales30,
      refundCount: current.refundCount + product.refundCount,
      profit: current.profit + product.profit, revenue,
      adSpend: current.adSpend + product.adSpend,
      available: current.available + product.available,
      inbound: current.inbound + product.inbound,
      margin: revenue ? (current.profit + product.profit) / revenue : current.margin,
      refundRate: sales ? (current.refundCount + product.refundCount) / sales : current.refundRate,
    };
    const risks = [];
    if (merged.profit <= 0) risks.push('负利润');
    if (merged.refundRate >= 0.2) risks.push('高退款');
    if (merged.sales === 0) risks.push('零销量');
    if (merged.sales30 > 0 && merged.available + merged.inbound < merged.sales30 * 0.5) risks.push('库存风险');
    productsByStoreSku.set(key, {
      ...merged, risks,
      healthScore: scoreProduct(merged),
      action: risks.includes('负利润') ? '优化利润或淘汰'
        : risks.includes('高退款') ? '检查退货原因'
          : risks.includes('库存风险') ? '尽快补货'
            : merged.sales === 0 ? '观察或淘汰' : '持续优化',
    });
  });
  const products = Array.from(productsByStoreSku.values());

  const sum = (sel) => products.reduce((t, p) => t + sel(p), 0);
  const storesMap = new Map();
  products.forEach((p) => storesMap.set(p.store, [...(storesMap.get(p.store) ?? []), p]));
  const stores = Array.from(storesMap, ([store, items]) => ({
    store,
    skuCount: items.length,
    totalSales: items.reduce((t, i) => t + i.sales, 0),
    sales30: items.reduce((t, i) => t + i.sales30, 0),
    totalProfit: items.reduce((t, i) => t + i.profit, 0),
    negativeCount: items.filter((i) => i.profit <= 0).length,
  }));
  const ageMap = new Map();
  products.forEach((p) => ageMap.set(p.ageMonths, [...(ageMap.get(p.ageMonths) ?? []), p]));
  const ages = Array.from(ageMap, ([months, items]) => ({
    months, skuCount: items.length,
    totalSales: items.reduce((t, i) => t + i.sales, 0),
    totalProfit: items.reduce((t, i) => t + i.profit, 0),
  })).sort((a, b) => a.months - b.months);

  return {
    products,
    stores,
    ages,
    ...buildAnalysisSummaries(products),
    kpis: {
      skuCount: products.length,
      matchedCount: products.filter((p) => p.name !== '待补充').length,
      totalSales: sum((p) => p.sales),
      sales30: sum((p) => p.sales30),
      totalProfit: sum((p) => p.profit),
      averageMargin: sum((p) => p.revenue) > 0 ? sum((p) => p.profit) / sum((p) => p.revenue) : 0,
      averageRefundRate: sum((p) => p.sales) > 0 ? sum((p) => p.refundCount) / sum((p) => p.sales) : 0,
      zeroSalesCount: products.filter((p) => p.sales === 0).length,
      negativeProfitCount: products.filter((p) => p.profit <= 0).length,
      stockRiskCount: products.filter((p) => p.risks.includes('库存风险')).length,
    },
  };
}

// ---- analysis-summaries ----
function summarize(items) {
  const total = (pick) => items.reduce((s, i) => s + pick(i), 0);
  const revenue = total((i) => i.revenue);
  const sales = total((i) => i.sales);
  const profit = total((i) => i.profit);
  const refundCount = total((i) => i.refundCount);
  return {
    skuCount: items.length, sales,
    sales30: total((i) => i.sales30), revenue, profit,
    margin: revenue ? profit / revenue : 0,
    refundCount,
    refundRate: sales ? refundCount / sales : 0,
    adSpend: total((i) => i.adSpend),
    available: total((i) => i.available),
    inbound: total((i) => i.inbound),
  };
}

function groupBy(items, key) {
  const groups = new Map();
  items.forEach((i) => {
    const k = key(i);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  return groups;
}

function creationMonth(input) {
  const m = String(input).match(/^(\d{4})[-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : '日期未识别';
}

export function buildAnalysisSummaries(products) {
  const monthly = Array.from(groupBy(products, (i) => creationMonth(i.createdAt)), ([month, items]) => ({
    month, ...summarize(items),
  })).sort((a, b) => a.month.localeCompare(b.month, 'zh-CN'));

  const categories = Array.from(groupBy(products, (i) => i.category), ([category, items]) => ({
    category, storeCount: new Set(items.map((i) => i.store)).size, ...summarize(items),
  })).sort((a, b) => b.sales - a.sales || a.category.localeCompare(b.category, 'zh-CN'));

  const categoryStores = Array.from(
    groupBy(products, (i) => `${i.category}\u0000${i.store}`),
    ([key, items]) => {
      const [category, store] = key.split('\u0000');
      return { category, store, ...summarize(items) };
    },
  ).sort((a, b) => a.category.localeCompare(b.category, 'zh-CN') || b.sales - a.sales);

  const bySales = [...products].sort((a, b) => b.sales - a.sales);
  const cases = {
    topSales: bySales.slice(0, 5),
    highSalesLowProfit: bySales.filter((i) => i.profit <= 0 || (i.revenue > 0 && i.profit / i.revenue < 0.05)).slice(0, 5),
    topRefund: [...products].filter((i) => i.sales > 0).sort((a, b) => b.refundRate - a.refundRate || b.refundCount - a.refundCount).slice(0, 5),
    zeroSales: products.filter((i) => i.sales === 0).slice(0, 20),
    stockRisk: products.filter((i) => i.risks.includes('库存风险')).slice(0, 20),
  };

  const totals = summarize(products);
  const topCategory = categories[0];
  const lossCount = products.filter((i) => i.profit <= 0).length;
  const highRefundCount = products.filter((i) => i.refundRate >= 0.2).length;
  const narrative = [
    `本期共分析 ${products.length} 个店铺-SKU，累计销量 ${totals.sales.toLocaleString('zh-CN')}，销售额 ${totals.revenue.toFixed(2)} AED，订单毛利润 ${totals.profit.toFixed(2)} AED。`,
    topCategory
      ? `${topCategory.category}为销量贡献最高的类目，共 ${topCategory.skuCount} 个 SKU，贡献销量 ${topCategory.sales.toLocaleString('zh-CN')}，类目毛利率 ${(topCategory.margin * 100).toFixed(1)}%。`
      : '当前没有可识别的类目数据。',
    `需优先处理 ${lossCount} 个亏损或零利润 SKU、${highRefundCount} 个高退款 SKU 和 ${cases.stockRisk.length} 个库存风险 SKU。`,
  ];

  return { monthly, categories, categoryStores, cases, narrative };
}

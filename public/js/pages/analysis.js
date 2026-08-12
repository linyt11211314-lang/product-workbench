/**
 * 数据分析页面 —— 基于 services/analysis.js
 * 直接分析「领星」导出（用户提供的数据源）：按 SKU 关联小类排名作为名称，
 * 输出销量/毛利/退款/库存风险、店铺汇总、类目汇总与 TOP 榜单。
 */
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { analyzeProducts } from '../services/analysis.js';

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('zh-CN', { maximumFractionDigits: d }) : '-');
const pct = (v) => (Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '-');
const money = (v) => fmt(v, 0);

// 从一条领星记录里取 SKU（MSKU 优先，兼容 SKU / AE sku）
function pickSku(row) {
  return String(row['MSKU'] || row['SKU'] || row['AE sku'] || '').trim();
}
// 取产品展示名：优先 小类排名（去掉「：3」这类排名尾巴），其次 产品名称/名称
function pickName(row) {
  const raw = String(row['小类排名'] || row['产品名称'] || row['名称'] || row['Name'] || row['标题'] || '').trim();
  return raw.replace(/[：:]\s*\d+$/, '').trim();
}

export function render(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">${icon('chart')} 店铺-SKU 数据分析</div>
      <p class="muted" style="margin:0 0 12px">上传「领星」数据源 Excel（含 MSKU / 销量 / 订单毛利润 / 销售额 / 订单毛利率 / 退款率 / 大类排名 等列），自动按类目与店铺汇总销量、毛利、退款与库存风险。也可先用示例数据预览。</p>
      <div class="row" style="gap:10px">
        <label class="btn btn-primary btn-sm">${icon('upload')} 导入领星 Excel<input id="a-file" type="file" accept=".xlsx,.xls" hidden /></label>
        <button class="btn btn-soft btn-sm" id="a-demo">${icon('sparkles')} 加载示例数据</button>
      </div>
    </div>
    <div id="a-result"></div>
  `;

  const $ = (id) => container.querySelector(id);

  $('#a-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(new Uint8Array(buf), { type: 'array' });
      // 优先用「领星」数据源表；否则取第一张表。直接用它做分析（无需单独的「产品表现」表）。
      const dataSheetName = wb.SheetNames.find((n) => n.includes('领星')) ?? wb.SheetNames[0];
      const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[dataSheetName]);
      if (!rows.length) { toast('该工作表没有数据行', 'error', 4000); return; }
      const identities = rows
        .map((r) => ({ sku: pickSku(r), name: pickName(r) }))
        .filter((i) => i.sku);
      runAnalysis(rows, identities);
    } catch (err) {
      toast('Excel 解析失败：' + err.message, 'error', 4000);
    }
  });

  $('#a-demo').onclick = () => {
    const identities = [
      { sku: 'AE-001', name: '便携榨汁杯 350ml' },
      { sku: 'AE-002', name: '磁吸折叠手机支架' },
      { sku: 'AE-003', name: '伸缩遛狗绳' },
      { sku: 'AE-004', name: '硅胶厨房铲套装' },
    ];
    const rawRows = [
      { MSKU: 'AE-001', 店铺: 'AE店A', 创建时间: '2026-03-12', 销量: 1200, '30天销量': 320, 大类排名: 'Home：#12', 退款率: '0.04', 退款量: 48, 评分: 4.6, 毛利: 5600, 销售额: 22000, 毛利率: '0.25', 广告费: 1800, 'FBA-可售': 80, 'FBA-在途': 200 },
      { MSKU: 'AE-002', 店铺: 'AE店A', 创建时间: '2026-05-02', 销量: 600, '30天销量': 40, 大类排名: 'Cell：#8', 退款率: '0.22', 退款量: 132, 评分: 4.1, 毛利: -300, 销售额: 9000, 毛利率: '-0.03', 广告费: 1200, 'FBA-可售': 10, 'FBA-在途': 5 },
      { MSKU: 'AE-003', 店铺: 'AE店B', 创建时间: '2026-01-20', 销量: 0, '30天销量': 0, 大类排名: 'Pet：#30', 退款率: '0', 退款量: 0, 评分: 0, 毛利: 0, 销售额: 0, 毛利率: '0', 广告费: 0, 'FBA-可售': 0, 'FBA-在途': 0 },
      { MSKU: 'AE-004', 店铺: 'AE店B', 创建时间: '2026-04-15', 销量: 800, '30天销量': 200, 大类排名: 'Kitchen：#15', 退款率: '0.06', 退款量: 48, 评分: 4.4, 毛利: 3200, 销售额: 12000, 毛利率: '0.27', 广告费: 900, 'FBA-可售': 60, 'FBA-在途': 120 },
    ];
    runAnalysis(rawRows, identities);
  };

  function runAnalysis(rawRows, identities) {
    let result;
    try {
      result = analyzeProducts(rawRows, identities);
    } catch (err) {
      toast('分析失败：' + err.message, 'error', 4000);
      return;
    }
    if (!result.products.length) { toast('未匹配到任何 SKU，请确认 Excel 含 MSKU / 销量 等列', 'error', 5000); return; }
    renderResult(result);
  }

  function renderResult(r) {
    const box = $('#a-result');
    const k = r.kpis;
    const top = [...r.products].sort((a, b) => b.sales - a.sales).slice(0, 50);
    box.innerHTML = `
      <div class="card">
        <div class="card-title">${icon('database')} 核心指标</div>
        <div class="kv-grid">
          <div><span>SKU 总数</span><b>${k.skuCount}</b></div>
          <div><span>有销量 SKU</span><b>${k.activeSku}</b></div>
          <div><span>累计销量</span><b>${money(k.totalSales)}</b></div>
          <div><span>近30天销量</span><b>${money(k.sales30)}</b></div>
          <div><span>销售额</span><b>${money(k.totalRevenue)} AED</b></div>
          <div><span>总毛利</span><b class="${k.totalProfit >= 0 ? 'pos' : 'neg'}">${money(k.totalProfit)} AED</b></div>
          <div><span>平均毛利率</span><b>${pct(k.averageMargin)}</b></div>
          <div><span>平均退款率</span><b>${pct(k.averageRefundRate)}</b></div>
          <div><span>广告花费</span><b>${money(k.totalAdSpend)} AED</b></div>
          <div><span>负利润 SKU</span><b class="neg">${k.negativeProfitCount}</b></div>
          <div><span>零销量 SKU</span><b class="neg">${k.zeroSalesCount}</b></div>
          <div><span>库存风险 SKU</span><b class="neg">${k.stockRiskCount}</b></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${icon('info')} 分析结论</div>
        <ul class="risk-suggest">${r.narrative.map((n) => `<li>${n}</li>`).join('')}</ul>
      </div>

      <div class="card">
        <div class="card-title">${icon('store')} 店铺汇总</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>店铺</th><th>SKU数</th><th>销量</th><th>销售额</th><th>毛利</th><th>负利润数</th></tr></thead>
            <tbody>${r.stores.map((s) => `<tr><td>${s.store}</td><td>${s.skuCount}</td><td>${money(s.totalSales)}</td><td>${money(s.totalRevenue)}</td><td class="${s.totalProfit >= 0 ? 'pos' : 'neg'}">${money(s.totalProfit)}</td><td class="neg">${s.negativeCount}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${icon('box')} 类目汇总</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>类目</th><th>SKU</th><th>销量</th><th>销售额</th><th>毛利</th><th>毛利率</th></tr></thead>
            <tbody>${r.categories.map((c) => `<tr><td>${c.category}</td><td>${c.skuCount}</td><td>${money(c.sales)}</td><td>${money(c.revenue)}</td><td class="${c.profit >= 0 ? 'pos' : 'neg'}">${money(c.profit)}</td><td>${pct(c.margin)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${icon('list')} 产品明细（按销量 TOP ${top.length}）</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>SKU</th><th>名称</th><th>店铺</th><th>销量</th><th>毛利</th><th>毛利率</th><th>退款率</th><th>健康分</th><th>风险</th><th>建议</th></tr></thead>
            <tbody>
              ${top.map((p) => `<tr>
                <td>${p.sku}</td><td>${p.name || '—'}</td><td>${p.store}</td>
                <td>${money(p.sales)}</td><td class="${p.profit >= 0 ? 'pos' : 'neg'}">${money(p.profit)}</td>
                <td>${pct(p.margin)}</td><td>${pct(p.refundRate)}</td>
                <td>${p.healthScore}</td>
                <td>${(p.risks || []).map((x) => `<span class="risk-badge high">${x}</span>`).join(' ') || '—'}</td>
                <td>${p.action}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${r.cases.highSalesLowProfit.length ? `<div class="card"><div class="card-title">${icon('alert')} 高销量低利润（优先优化）</div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>SKU</th><th>名称</th><th>毛利</th><th>毛利率</th></tr></thead>
        <tbody>${r.cases.highSalesLowProfit.map((p) => `<tr><td>${p.sku}</td><td>${p.name || '—'}</td><td class="neg">${money(p.profit)}</td><td>${pct(p.margin)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}

      ${r.cases.topRefund.length ? `<div class="card"><div class="card-title">${icon('alert')} 高退款 TOP${r.cases.topRefund.length}</div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>SKU</th><th>名称</th><th>销量</th><th>退款率</th><th>退款量</th></tr></thead>
        <tbody>${r.cases.topRefund.map((p) => `<tr><td>${p.sku}</td><td>${p.name || '—'}</td><td>${money(p.sales)}</td><td class="neg">${pct(p.refundRate)}</td><td>${money(p.refundCount)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    `;
  }
}

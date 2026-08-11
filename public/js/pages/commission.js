/**
 * 佣金 / 薪酬测算页面 —— 基于 services/commission.js
 */
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import {
  availableCommissionMonths, commissionPeriod, calculateCommission, calculateSalaryPlan, currentMonth,
} from '../services/commission.js';
import { getCommissionState, saveCommissionDraft, addCommissionRecord, removeCommissionRecord } from '../store/commissionStore.js';

const num = (v) => (Number.isFinite(+v) ? +v : 0);
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');

export function render(container) {
  const st = getCommissionState();
  const months = availableCommissionMonths();

  container.innerHTML = `
    <div class="card">
      <div class="card-title">${icon('briefcase')} 佣金测算 · AE / SA 双站点提成预测</div>
      <div class="row" style="gap:12px;flex-wrap:wrap">
        <div><label class="form-label">核算月份</label>
          <select class="input" id="c-month">${months.map((m) => `<option value="${m}" ${m === st.draft.month ? 'selected' : ''}>${m}</option>`).join('')}</select>
        </div>
      </div>
      <div class="commission-grid" style="margin-top:12px">
        <div class="sub">AE 站点</div>
        <div><label class="form-label">本月已销量</label><input class="input" id="c-ae-sales" type="number" value="${st.draft.ae.currentSales}" /></div>
        <div><label class="form-label">本月已利润</label><input class="input" id="c-ae-profit" type="number" value="${st.draft.ae.currentProfit}" /></div>
        <div class="sub">SA 站点</div>
        <div><label class="form-label">本月已销量</label><input class="input" id="c-sa-sales" type="number" value="${st.draft.sa.currentSales}" /></div>
        <div><label class="form-label">本月已利润</label><input class="input" id="c-sa-profit" type="number" value="${st.draft.sa.currentProfit}" /></div>
        <div class="sub">参数</div>
        <div><label class="form-label">提成比例</label><input class="input" id="c-rate" type="number" step="0.01" value="${st.draft.params.commissionRate}" /></div>
        <div><label class="form-label">AE 税率</label><input class="input" id="c-aetax" type="number" step="0.01" value="${st.draft.params.aeTaxRate}" /></div>
        <div><label class="form-label">SA 税率</label><input class="input" id="c-satax" type="number" step="0.01" value="${st.draft.params.saTaxRate}" /></div>
      </div>
      <button class="btn btn-primary btn-sm" id="c-calc" style="margin-top:12px">${icon('zap')} 计算提成</button>
    </div>

    <div class="card" id="c-result" style="display:none"></div>

    <div class="card">
      <div class="card-title">${icon('wallet')} 薪酬到手规划</div>
      <div class="commission-grid">
        <div><label class="form-label">底薪</label><input class="input" id="s-base" type="number" value="${st.draft.params.baseSalary}" /></div>
        <div><label class="form-label">社保</label><input class="input" id="s-si" type="number" step="0.01" value="${st.draft.params.socialInsurance}" /></div>
        <div><label class="form-label">期初银行卡</label><input class="input" id="s-bank" type="number" value="${st.draft.openingBank}" /></div>
        <div><label class="form-label">期初微信</label><input class="input" id="s-wx" type="number" value="${st.draft.openingWechat}" /></div>
        <div><label class="form-label">固定还款</label><input class="input" id="s-repay" type="number" value="${st.draft.expenses.fixedRepayment}" /></div>
        <div><label class="form-label">日常开销</label><input class="input" id="s-daily" type="number" value="${st.draft.expenses.dailyExpense}" /></div>
        <div><label class="form-label">房租</label><input class="input" id="s-rent" type="number" value="${st.draft.expenses.rent}" /></div>
        <div><label class="form-label">投资</label><input class="input" id="s-inv" type="number" value="${st.draft.expenses.investment}" /></div>
        <div><label class="form-label">预期提成</label><input class="input" id="s-exp" type="number" value="0" /></div>
        <div><label class="form-label">实际提成(可空)</label><input class="input" id="s-act" type="number" value="${st.draft.actualCommission ?? ''}" placeholder="留空＝未发" /></div>
      </div>
      <button class="btn btn-soft btn-sm" id="s-calc" style="margin-top:10px">${icon('chart')} 规划到手</button>
    </div>

    <div class="card" id="s-result" style="display:none"></div>

    <div class="card">
      <div class="card-title">${icon('list')} 核算历史</div>
      <div id="c-history"></div>
    </div>
  `;

  const $ = (id) => container.querySelector(id);
  function readDraft() {
    return {
      month: $('#c-month').value,
      ae: { currentSales: num($('#c-ae-sales').value), currentProfit: num($('#c-ae-profit').value) },
      sa: { currentSales: num($('#c-sa-sales').value), currentProfit: num($('#c-sa-profit').value) },
      params: {
        commissionRate: num($('#c-rate').value),
        aeTaxRate: num($('#c-aetax').value),
        saTaxRate: num($('#c-satax').value),
        baseSalary: num($('#s-base').value),
        socialInsurance: num($('#s-si').value),
      },
      openingBank: num($('#s-bank').value),
      openingWechat: num($('#s-wx').value),
      expenses: {
        fixedRepayment: num($('#s-repay').value),
        dailyExpense: num($('#s-daily').value),
        rent: num($('#s-rent').value),
        investment: num($('#s-inv').value),
        savings: 0, reserve: 0,
      },
    };
  }

  $('#c-calc').onclick = () => {
    const draft = readDraft();
    saveCommissionDraft(draft);
    try {
      const period = commissionPeriod(draft.month);
      const res = calculateCommission({
        elapsedDays: period.elapsedDays, totalDays: period.totalDays,
        ae: draft.ae, sa: draft.sa,
        commissionRate: draft.params.commissionRate,
        aeTaxRate: draft.params.aeTaxRate, saTaxRate: draft.params.saTaxRate,
      });
      const el = $('#c-result');
      el.style.display = 'block';
      el.innerHTML = `<div class="card-title">${icon('zap')} 提成测算（${period.month}，已过 ${period.elapsedDays}/${period.totalDays} 天）</div>
        <div class="kv-grid">
          <div><span>AE 预测销量</span><b>${fmt(res.ae.projectedSales)}</b></div>
          <div><span>AE 预测利润</span><b>${fmt(res.ae.projectedProfit)}</b></div>
          <div><span>AE 提成</span><b>${fmt(res.ae.commission)}</b></div>
          <div><span>SA 预测销量</span><b>${fmt(res.sa.projectedSales)}</b></div>
          <div><span>SA 预测利润</span><b>${fmt(res.sa.projectedProfit)}</b></div>
          <div><span>SA 提成</span><b>${fmt(res.sa.commission)}</b></div>
          <div><span>合计提成</span><b class="pos">${fmt(res.totalCommission)}</b></div>
        </div>
        <button class="btn btn-primary btn-sm" id="c-save-rec" style="margin-top:10px">${icon('save')} 存为核算记录</button>`;
      $('#c-save-rec').onclick = () => {
        addCommissionRecord({ ...draft, actualCommission: $('#s-act').value === '' ? null : num($('#s-act').value), savedAt: new Date().toISOString() });
        toast('已保存核算记录', 'success');
        renderHistory();
      };
    } catch (e) { toast(e.message, 'error', 4000); }
  };

  $('#s-calc').onclick = () => {
    const draft = readDraft();
    saveCommissionDraft(draft);
    const res = calculateSalaryPlan({
      baseSalary: draft.params.baseSalary,
      socialInsurance: draft.params.socialInsurance,
      expectedCommission: num($('#s-exp').value),
      actualCommission: $('#s-act').value === '' ? null : num($('#s-act').value),
      openingBank: draft.openingBank,
      openingWechat: draft.openingWechat,
      expenses: draft.expenses,
    });
    const el = $('#s-result');
    el.style.display = 'block';
    el.innerHTML = `<div class="card-title">${icon('wallet')} 到手规划</div>
      <div class="kv-grid">
        <div><span>预期到手</span><b class="pos">${fmt(res.expectedTakeHome)}</b></div>
        <div><span>实际到手</span><b>${res.actualTakeHome == null ? '—' : fmt(res.actualTakeHome)}</b></div>
        <div><span>提成差额</span><b>${res.commissionDifference == null ? '—' : fmt(res.commissionDifference)}</b></div>
        <div><span>计划支出</span><b>${fmt(res.plannedExpenses)}</b></div>
        <div><span>可用余额</span><b class="${res.availableBalance >= 0 ? 'pos' : 'neg'}">${fmt(res.availableBalance)}</b></div>
      </div>`;
  };

  function renderHistory() {
    const s = getCommissionState();
    const box = $('#c-history');
    if (!s.records.length) { box.innerHTML = '<p class="muted">暂无记录</p>'; return; }
    box.innerHTML = s.records.map((r, i) => `
      <div class="history-row">
        <div><b>${r.month}</b> · AE ${fmt(r.ae.currentProfit)} / SA ${fmt(r.sa.currentProfit)} · 提成 ${fmt(r.ae.commission + r.sa.commission)}</div>
        <button class="btn btn-soft btn-sm" data-del="${i}">${icon('trash')}</button>
      </div>`).join('');
    box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { removeCommissionRecord(+b.dataset.del); renderHistory(); });
  }
  renderHistory();
}

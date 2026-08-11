/**
 * 侵权 / IP 风险扫描页面 —— 基于 services/risk.js
 */
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { createImageUploader } from '../ui/fields.js';
import { getRiskState, saveRiskDraft, addRiskResult, setActiveRiskResult, removeRiskResult } from '../store/riskStore.js';
import { validateRiskScanInput, createBasicRiskScan, scanWithAI } from '../services/risk.js';
import { hasApiKey } from '../store/settingsStore.js';

const fmtScore = (s) => (s == null ? '—' : `${s}/100`);
const levelLabel = { low: '低风险', medium: '中风险', high: '高风险', unknown: '未知' };

export function render(container) {
  const st = getRiskState();

  container.innerHTML = `
    <div class="card">
      <div class="card-title">${icon('shield')} 侵权 / IP 风险扫描</div>
      <p class="muted" style="margin:0 0 12px">上传产品图并填写信息，本地启发式或 AI 模式识别商标 / 外观专利 / 版权 / 关键词 / 目标国风险。演示模式无需联网即可用。</p>
      <div class="row" style="gap:10px;margin-bottom:12px">
        <span class="seg">
          <button class="seg-btn active" id="m-demo">演示模式</button>
          <button class="seg-btn" id="m-ai">AI 识别</button>
        </span>
        <span id="ai-hint" class="muted"></span>
      </div>
      <div class="commission-grid">
        <div><label class="form-label">产品名称 *</label><input class="input" id="r-name" value="${st.draft.name || ''}" /></div>
        <div><label class="form-label">类目</label><input class="input" id="r-cat" value="${st.draft.category || ''}" /></div>
        <div style="grid-column:1/-1"><label class="form-label">产品描述</label><textarea class="input" id="r-desc" rows="3">${st.draft.description || ''}</textarea></div>
        <div style="grid-column:1/-1"><label class="form-label">商品链接（可选）</label><input class="input" id="r-link" value="${st.draft.link || ''}" /></div>
        <div style="grid-column:1/-1"><label class="form-label">产品图片 *（至少 1 张）</label><div id="r-upload"></div></div>
      </div>
      <button class="btn btn-primary btn-sm" id="r-scan" style="margin-top:12px">${icon('search')} 开始扫描</button>
    </div>

    <div class="card" id="r-result" style="display:none"></div>

    <div class="card">
      <div class="card-title">${icon('history')} 扫描历史</div>
      <div id="r-history"></div>
    </div>
  `;

  const $ = (id) => container.querySelector(id);
  let mode = 'demo';

  const uploader = createImageUploader({
    onChange: () => { /* 实时保存 */ saveDraft(); },
  });
  $('#r-upload').appendChild(uploader.el);
  if (st.draft.images && st.draft.images[0]) uploader.setValue(st.draft.images[0]);

  function saveDraft() {
    saveRiskDraft({
      name: $('#r-name').value,
      category: $('#r-cat').value,
      description: $('#r-desc').value,
      link: $('#r-link').value,
      images: uploader.getValue() ? [uploader.getValue()] : [],
    });
  }
  ['r-name', 'r-cat', 'r-desc', 'r-link'].forEach((id) => $(id).addEventListener('input', saveDraft));

  function refreshMode() {
    $('#m-demo').classList.toggle('active', mode === 'demo');
    $('#m-ai').classList.toggle('active', mode === 'api');
    if (mode === 'api' && !hasApiKey()) {
      $('#ai-hint').textContent = '需在「设置」配置 DeepSeek Key 后启用 AI 模式';
    } else if (mode === 'api') {
      $('#ai-hint').textContent = '将调用 DeepSeek 做真实识别';
    } else {
      $('#ai-hint').textContent = '';
    }
  }
  $('#m-demo').onclick = () => { mode = 'demo'; refreshMode(); };
  $('#m-ai').onclick = () => { mode = 'api'; refreshMode(); };
  refreshMode();

  $('#r-scan').onclick = async () => {
    const draft = {
      name: $('#r-name').value, category: $('#r-cat').value,
      description: $('#r-desc').value, link: $('#r-link').value,
      images: uploader.getValue() ? [uploader.getValue()] : [],
    };
    saveDraft();
    const v = validateRiskScanInput(draft);
    if (!v.valid) { toast(v.message, 'error'); return; }

    const btn = $('#r-scan');
    btn.disabled = true; btn.textContent = '扫描中…';
    try {
      const id = 'risk_' + Date.now();
      const result = mode === 'api' && hasApiKey()
        ? await scanWithAI(draft, id)
        : createBasicRiskScan(draft, id);
      addRiskResult(result);
      renderResult(result);
      renderHistory();
      toast('扫描完成', 'success');
    } catch (e) {
      toast(e.message, 'error', 4000);
    } finally {
      btn.disabled = false; btn.innerHTML = `${icon('search')} 开始扫描`;
    }
  };

  function renderResult(r) {
    const el = $('#r-result');
    el.style.display = 'block';
    const lv = r.riskLevel || 'unknown';
    el.innerHTML = `
      <div class="card-title">${icon('shield')} 扫描结果 · <span class="risk-badge ${lv}">${levelLabel[lv]}</span> · 评分 ${fmtScore(r.riskScore)} · ${r.mode === 'api' ? 'AI 模式' : '演示模式'}</div>
      ${r.identification ? `<p class="muted">识别类型：${r.identification.productType || '—'} ｜ 特征：${(r.identification.features || []).join('、') || '—'} ｜ 品牌标记：${(r.identification.brandMarks || []).join('、') || '—'}</p>` : ''}
      <div class="risk-grid">
        <div><b>商标</b><p>${r.trademarkRisk || '—'}</p></div>
        <div><b>外观专利</b><p>${r.designRisk || '—'}</p></div>
        <div><b>功能专利</b><p>${r.patentRisk || '—'}</p></div>
        <div><b>关键词</b><p>${r.keywordRisk || '—'}</p></div>
        <div style="grid-column:1/-1"><b>目标国</b><p>${r.countryRisk || '—'}</p></div>
      </div>
      <div class="card-title" style="margin-top:12px">${icon('check')} 建议</div>
      <ul class="risk-suggest">${(r.suggestions || []).map((s) => `<li>${s}</li>`).join('')}</ul>
      <p class="muted" style="margin-top:10px">${r.serviceMessage || ''}</p>`;
  }

  function renderHistory() {
    const s = getRiskState();
    const box = $('#r-history');
    if (!s.history.length) { box.innerHTML = '<p class="muted">暂无扫描记录</p>'; return; }
    box.innerHTML = s.history.map((r) => `
      <div class="history-row">
        <div><b>${r.productInfo.name}</b> · <span class="risk-badge ${r.riskLevel}">${levelLabel[r.riskLevel]}</span> · ${r.mode === 'api' ? 'AI' : '演示'} · ${new Date(r.createdAt).toLocaleString('zh-CN')}</div>
        <div class="row" style="gap:6px">
          <button class="btn btn-soft btn-sm" data-view="${r.id}">${icon('eye')}</button>
          <button class="btn btn-soft btn-sm" data-del="${r.id}">${icon('trash')}</button>
        </div>
      </div>`).join('');
    box.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => {
      const r = s.history.find((x) => x.id === b.dataset.view); if (r) { setActiveRiskResult(r.id); renderResult(r); }
    });
    box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { removeRiskResult(b.dataset.del); renderHistory(); });
  }
  renderHistory();
}

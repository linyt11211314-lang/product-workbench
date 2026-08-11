/**
 * 首页：固定指标卡组 + 快捷入口 + 最近项目
 */
import { icon } from '../ui/icons.js';
import { esc, timeAgo } from '../utils.js';
import { countProjects, countGeneratedToday, listProjects } from '../store/projectStore.js';
import { countProducts } from '../store/productStore.js';
import { aiCallsCount } from '../store/statsStore.js';
import { hasApiKey } from '../store/settingsStore.js';

export function render(container, { navigate }) {
  const metrics = [
    {
      label: 'Listing 项目总数', value: countProjects(), icon: 'file', cls: 'primary',
      sub: '已保存的 Listing 项目',
    },
    {
      label: '今日生成', value: countGeneratedToday(), icon: 'sparkles', cls: 'green',
      sub: '今日完成的 AI 生成',
    },
    {
      label: '选品库产品', value: countProducts(), icon: 'box', cls: 'blue',
      sub: '可导入工坊的产品',
    },
    {
      label: 'AI 调用次数', value: aiCallsCount(), icon: 'zap', cls: 'amber',
      sub: '累计 DeepSeek 调用',
    },
  ];

  const iconColors = {
    primary: { bg: 'linear-gradient(135deg,var(--grad-p1),var(--grad-p2))', fg: 'var(--grad-pfg)' },
    green: { bg: 'linear-gradient(135deg,var(--grad-g1),var(--grad-g2))', fg: 'var(--grad-gfg)' },
    blue: { bg: 'linear-gradient(135deg,var(--grad-b1),var(--grad-b2))', fg: 'var(--grad-bfg)' },
    amber: { bg: 'linear-gradient(135deg,var(--grad-a1),var(--grad-a2))', fg: 'var(--grad-afg)' },
  };

  container.innerHTML = `
    <!-- 指标卡组：固定高度，不随页面滚动 -->
    <div class="metrics-row" data-metrics>
      ${metrics.map((m, i) => {
        const c = iconColors[m.cls];
        return `
        <div class="metric-card">
          <div class="metric-icon" style="background:${c.bg};color:${c.fg}">${icon(m.icon)}</div>
          <div class="metric-body">
            <div class="metric-value" data-metric="${i}">${m.value}</div>
            <div class="metric-label">${m.label}</div>
            <div class="metric-trend">${m.sub}</div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="home-quick-grid">
      <div class="card home-quick" data-nav="listing">
        <div class="hq-icon" style="background:linear-gradient(135deg,var(--grad-p1),var(--grad-p2));color:var(--grad-pfg)">${icon('sparkles')}</div>
        <div>
          <div class="hq-title">创建 AI Listing</div>
          <div class="hq-sub">填写产品信息，AI 生成标题、五点、描述与关键词</div>
        </div>
        <span class="hq-arrow">→</span>
      </div>
      <div class="card home-quick" data-nav="library">
        <div class="hq-icon" style="background:linear-gradient(135deg,var(--grad-b1),var(--grad-b2));color:var(--grad-bfg)">${icon('box')}</div>
        <div>
          <div class="hq-title">选品库</div>
          <div class="hq-sub">管理产品素材，一键导入 Listing 工坊</div>
        </div>
        <span class="hq-arrow">→</span>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-pad">
        <div class="section-head" style="margin-bottom:6px">
          <div class="section-title">最近项目</div>
          <span class="section-sub">${hasApiKey() ? 'AI 服务已就绪' : '尚未配置 AI 服务，请前往设置'}</span>
          <span class="flex-1"></span>
          <button class="btn btn-soft btn-sm" data-nav="listing">全部项目</button>
        </div>
        <div data-recent></div>
      </div>
    </div>
  `;

  // 最近项目
  const recentBox = container.querySelector('[data-recent]');
  const projects = listProjects().slice(0, 4);
  if (!projects.length) {
    recentBox.innerHTML = `
      <div class="empty-state" style="padding:30px 20px">
        <div class="empty-icon">${icon('file')}</div>
        <div class="empty-title">还没有 Listing 项目</div>
        <div class="empty-sub">点击「创建 AI Listing」，从填写产品信息开始</div>
        <div class="mt-12"><button class="btn btn-primary" data-nav="listing:new">${icon('plus')} 创建第一个 Listing</button></div>
      </div>`;
  } else {
    recentBox.innerHTML = projects.map((p) => {
      const info = p.productInfo || {};
      const statusTag = p.status === 'saved'
        ? '<span class="tag tag-green">已保存</span>'
        : p.status === 'generated' ? '<span class="tag tag-blue">已生成</span>'
        : '<span class="tag">草稿</span>';
      return `
      <div class="list-row" data-open="${p.id}">
        ${info.image
          ? `<img class="project-thumb" src="${esc(info.image)}" alt="">`
          : `<div class="project-thumb no-img">无图</div>`}
        <div class="flex-1" style="min-width:0">
          <div class="truncate" style="font-size:14px;font-weight:600">${esc(info.name || '未命名产品')}</div>
          <div class="mt-8" style="font-size:12.5px;color:var(--text-sub);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${statusTag}
            <span>${esc(info.site || 'US')} 站</span>
            <span>·</span>
            <span>${timeAgo(p.updatedAt)}</span>
          </div>
        </div>
        <span class="hq-arrow" style="color:var(--text-faint)">→</span>
      </div>`;
    }).join('');
  }

  // 事件
  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });
  container.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', () => navigate(`listing:open:${el.dataset.open}`));
  });
}

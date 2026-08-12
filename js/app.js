/**
 * 拾光柠工作台 · 应用入口
 * 负责：侧边导航渲染、路由分发、AI 服务状态、跨页状态联动
 */
import { icon } from './ui/icons.js';
import { esc } from './utils.js';
import { hasApiKey, getSettings, maskedKey, applyTheme } from './store/settingsStore.js';
import { onProjectsChange } from './store/projectStore.js';
import { onProductsChange } from './store/productStore.js';
import { getLock, verify } from './store/applockStore.js';
import { render as renderHome } from './pages/home.js';
import { render as renderLibrary } from './pages/library.js';
import { render as renderListing } from './pages/listing.js';
import { render as renderSettings } from './pages/settings.js';
import { render as renderPricing } from './pages/pricing.js';
import { render as renderCommission } from './pages/commission.js';
import { render as renderAnalysis } from './pages/analysis.js';
import { render as renderSchedule } from './pages/schedule.js';
import { render as renderApplock } from './pages/applock.js';

const NAV = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'library', label: '选品库', icon: 'box' },
  { id: 'listing', label: 'AI Listing 工坊', icon: 'sparkles' },
  { id: 'pricing', label: '智能定价', icon: 'target' },
  { id: 'analysis', label: '数据分析', icon: 'chart' },
  { id: 'commission', label: '佣金计算', icon: 'briefcase' },
  { id: 'schedule', label: '排期任务', icon: 'calendar' },
  { id: 'applock', label: '应用锁', icon: 'lock' },
  { id: 'settings', label: '设置', icon: 'settings' },
];

const TITLES = {
  home: { title: '首页', sub: '拾光柠 · 产品开发工作台概览' },
  library: { title: '选品库', sub: '产品素材管理 · 一键导入 Listing 工坊' },
  listing: { title: 'AI Listing 工坊', sub: '亚马逊产品开发内容生成中心' },
  pricing: { title: '智能定价', sub: 'AED 售价测算 · 体积重/佣金/广告/退货/VAT' },
  analysis: { title: '数据分析', sub: '领星/产品表现导入 · 店铺-SKU 表现与风险' },
  commission: { title: '佣金计算', sub: 'AE/SA 双站点提成预测与薪酬规划' },
  schedule: { title: '排期任务', sub: '今日任务与上新排期' },
  applock: { title: '应用锁', sub: '轻量防旁观' },
  settings: { title: '设置', sub: 'DeepSeek AI 服务与偏好' },
};

const PAGE_OF = {
  home: 'home', library: 'library', listing: 'listing', settings: 'settings',
  pricing: 'pricing', commission: 'commission', analysis: 'analysis',
  schedule: 'schedule', applock: 'applock',
};

let currentRoute = 'home';

function pageOf(route) {
  return PAGE_OF[route] || (route && route.startsWith('listing') ? 'listing' : 'home');
}

/** 全局路由跳转 */
export function navigate(route) {
  currentRoute = route;
  renderShell();
  renderPage();
}

function renderShell() {
  const page = pageOf(currentRoute);
  const settings = getSettings();

  // 侧边导航（仅显示文字名称，不显示项目数字徽标）
  const navEl = document.getElementById('sidebarNav');
  navEl.innerHTML = NAV.map((n) => {
    const active = page === n.id;
    return `
      <div class="nav-item ${active ? 'active' : ''}" data-nav="${n.id}">
        <span class="nav-icon">${icon(n.icon)}</span>
        <span class="nav-label">${n.label}</span>
      </div>`;
  }).join('');
  navEl.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });

  // AI 状态徽标
  const badge = document.getElementById('aiStatusBadge');
  const on = hasApiKey();
  badge.className = `ai-status ${on ? 'on' : 'off'}`;
  badge.innerHTML = `<span class="ai-status-dot"></span><span class="ai-status-text">${
    on ? `AI 服务已就绪 · ${esc(maskedKey(settings.apiKey))}` : '未配置 API Key，点击配置'
  }</span>`;
  badge.style.cursor = 'pointer';
  badge.onclick = () => navigate('settings');

  // 顶栏
  const meta = TITLES[page] || TITLES.home;
  const topbar = document.getElementById('topbar');
  topbar.innerHTML = `
    <div>
      <div class="topbar-title">${meta.title}</div>
      <div class="topbar-sub">${meta.sub}</div>
    </div>
    <span class="topbar-spacer"></span>
    <div class="topbar-actions">
      ${page === 'listing' ? `<button class="btn btn-primary btn-sm" data-nav="listing:new">${icon('plus')} 创建 Listing</button>` : ''}
      ${page === 'library' ? `<button class="btn btn-soft btn-sm" data-nav="listing:new">${icon('sparkles')} 去创建 Listing</button>` : ''}
    </div>
  `;
  topbar.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });
}

function renderPage() {
  const container = document.getElementById('pageContent');
  try {
    container.innerHTML = '';
    const page = pageOf(currentRoute);
    const ctx = {
      navigate,
      rerender: () => renderPage(),
    };
    if (page === 'home') renderHome(container, ctx);
    else if (page === 'library') renderLibrary(container, ctx);
    else if (page === 'listing') renderListing(container, currentRoute, ctx);
    else if (page === 'pricing') renderPricing(container, ctx);
    else if (page === 'commission') renderCommission(container, ctx);
    else if (page === 'analysis') renderAnalysis(container, ctx);
    else if (page === 'schedule') renderSchedule(container, ctx);
    else if (page === 'applock') renderApplock(container, ctx);
    else if (page === 'settings') renderSettings(container, ctx);
  } catch (err) {
    console.error('[renderPage] 页面渲染失败：', err);
    container.innerHTML = `
      <div class="page-header"><h1>页面加载失败</h1><p>渲染 '${esc(pageOf(currentRoute))}' 时出错</p></div>
      <div class="card error-card" style="background:#fff5f5;border:1px solid #e0a6a6;color:#7a3b3b;padding:16px 18px;border-radius:8px;margin-top:12px;">
        <p style="margin:0 0 8px;font-weight:700;">页面渲染出错</p>
        <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;background:rgba(0,0,0,.04);padding:10px;border-radius:6px;">${esc(err && (err.stack || err.message) ? err.stack || err.message : String(err))}</pre>
        <p style="margin:10px 0 0;font-size:12px;opacity:.9;">请按 F12 → Console，把红色错误发给我以便定位。</p>
      </div>
    `;
  }
}

/** 应用锁守卫：启用且本会话未解锁时，弹出全屏解锁层 */
function guardAppLock() {
  const lock = getLock();
  if (!lock.enabled || window.__appUnlocked) return;
  const overlay = document.createElement('div');
  overlay.className = 'app-lock-overlay';
  overlay.innerHTML = `
    <div class="app-lock-box">
      <div class="logo-mark">🍋</div>
      <div class="card-title">${icon('lock')} 应用已锁定</div>
      <input class="input" id="lockPass" type="password" placeholder="输入密码解锁" />
      <button class="btn btn-primary btn-sm" id="lockUnlock" style="width:100%">${icon('unlock')} 解锁</button>
      <p class="muted" id="lockErr" style="color:#d9694e"></p>
    </div>`;
  document.body.appendChild(overlay);
  const passEl = overlay.querySelector('#lockPass');
  const tryUnlock = () => {
    if (verify(passEl.value)) {
      window.__appUnlocked = true;
      overlay.remove();
    } else {
      overlay.querySelector('#lockErr').textContent = '密码错误';
    }
  };
  overlay.querySelector('#lockUnlock').onclick = tryUnlock;
  passEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  passEl.focus();
}

/** 初始化 */
function init() {
  // 应用已保存的主题（明暗模式 + 主题色）
  applyTheme();
  renderShell();
  renderPage();
  guardAppLock();

  // 数据变化时联动刷新当前页
  const refresh = () => {
    // 保持当前路由不变，重绘（listing 结果页有内部状态，不强行重绘）
    const page = pageOf(currentRoute);
    if (page === 'listing' && currentRoute.includes('open')) return;
    renderShell();
    renderPage();
  };
  onProjectsChange(refresh);
  onProductsChange(refresh);
}

try {
  init();
} catch (err) {
  console.error('[init] 启动失败：', err);
  if (typeof window.showFatal === 'function') {
    window.showFatal((err && (err.stack || err.message)) || String(err));
  } else {
    throw err;
  }
}

/**
 * 侵权扫描存储（localStorage 持久化草稿与历史）
 */
const KEY = 'sgn.risk';

const emptyProductInfo = () => ({ name: '', description: '', category: '', link: '', images: [] });

let state = null;
function load() {
  if (state) return state;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    state = { draft: raw.draft || emptyProductInfo(), history: raw.history || [], activeResultId: raw.activeResultId || null };
  } catch { state = { draft: emptyProductInfo(), history: [], activeResultId: null }; }
  return state;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
export function getRiskState() { return load(); }
export function saveRiskDraft(draft) { load(); state.draft = draft; persist(); return state; }
export function addRiskResult(result) { load(); state.history.unshift(result); state.activeResultId = result.id; persist(); return state; }
export function setActiveRiskResult(id) { load(); state.activeResultId = id; persist(); return state; }
export function removeRiskResult(id) { load(); state.history = state.history.filter((r) => r.id !== id); if (state.activeResultId === id) state.activeResultId = state.history[0]?.id || null; persist(); return state; }

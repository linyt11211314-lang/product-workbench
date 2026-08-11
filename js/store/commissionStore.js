/**
 * 佣金 / 薪酬测算存储（localStorage 持久化草稿与历史记录）
 */
import { createCommissionWorkspace } from '../services/commission.js';

const KEY = 'sgn.commission';

let state = null;
function load() {
  if (state) return state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || createCommissionWorkspace(); }
  catch { state = createCommissionWorkspace(); }
  return state;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}
export function getCommissionState() { return load(); }
export function saveCommissionDraft(draft) { load(); state.draft = draft; persist(); return state; }
export function addCommissionRecord(record) { load(); state.records.unshift(record); persist(); return state; }
export function removeCommissionRecord(index) { load(); state.records.splice(index, 1); persist(); return state; }

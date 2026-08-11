/**
 * Listing 项目存储（localStorage 持久化）
 *
 * 字段：
 * {
 *   productId,            // 关联选品库产品 id（独立创建时为 null）
 *   productInfo,          // { image, name, category, site, sellingPoints, competitorUrl, keywords, brand, bannedWords, spec, color, size, material, competitorText }
 *   title,                // Amazon 标题
 *   bulletPoints,         // 五点描述 [String x5]
 *   description,          // Product Description
 *   searchTerms,          // 后台关键词（去重后的数组）
 *   imageSuggestions,     // { main, bullets:[], aPlus:[] }
 *   competitorAnalysis,   // 竞品分析结果（可选）
 *   status,               // draft | generated | saved
 *   createdAt,
 *   updatedAt
 * }
 */
import { STORAGE_KEYS } from '../config.js';
import { uid } from '../utils.js';

let projects = null;

function load() {
  if (projects) return projects;
  try {
    projects = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS)) || [];
  } catch (_) {
    projects = [];
  }
  return projects;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  } catch (_) { /* 存储超限时忽略，避免崩溃 */ }
}

export function listProjects() {
  return [...load()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id) {
  return load().find((p) => p.id === id) || null;
}

export function createProject(data) {
  const now = Date.now();
  const item = {
    id: uid('lst'),
    productId: data.productId ?? null,
    productInfo: data.productInfo || {},
    title: data.title || '',
    bulletPoints: data.bulletPoints || [],
    description: data.description || '',
    searchTerms: data.searchTerms || [],
    imageSuggestions: data.imageSuggestions || { main: '', bullets: [], aPlus: [] },
    competitorAnalysis: data.competitorAnalysis || '',
    status: data.status || 'draft',
    createdAt: now,
    updatedAt: now,
  };
  load().push(item);
  persist();
  return item;
}

export function updateProject(id, data) {
  const list = load();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...data, id, updatedAt: Date.now() };
  persist();
  return list[idx];
}

export function removeProject(id) {
  load();
  const before = projects.length;
  projects = projects.filter((p) => p.id !== id);
  if (projects.length !== before) persist();
}

export function countProjects() {
  return load().length;
}

export function countGeneratedToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return load().filter((p) => p.createdAt >= start.getTime() && p.status !== 'draft').length;
}

const listeners = new Set();
export function onProjectsChange(fn) { listeners.add(fn); }
export function notifyProjectsChange() { listeners.forEach((fn) => fn()); }

export function createProjectTracked(data) { const r = createProject(data); notifyProjectsChange(); return r; }
export function updateProjectTracked(id, data) { const r = updateProject(id, data); if (r) notifyProjectsChange(); return r; }
export function removeProjectTracked(id) { removeProject(id); notifyProjectsChange(); }

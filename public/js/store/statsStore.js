/**
 * 使用统计（localStorage 持久化）
 * 记录 AI 调用次数、生成项目数等，用于首页指标卡
 */
import { STORAGE_KEYS } from '../config.js';

let stats = null;

function load() {
  if (stats) return stats;
  try {
    stats = JSON.parse(localStorage.getItem(STORAGE_KEYS.STATS)) || {};
  } catch (_) {
    stats = {};
  }
  if (!stats.aiCalls) stats.aiCalls = 0;
  if (!stats.generatedListings) stats.generatedListings = 0;
  return stats;
}

function persist() {
  try { localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats)); } catch (_) { /* 忽略 */ }
}

export function getStats() {
  return load();
}

/** 记录一次 AI 调用 */
export function recordAiCall() {
  load();
  stats.aiCalls = (stats.aiCalls || 0) + 1;
  stats.lastCallAt = Date.now();
  persist();
}

/** 记录一次完整 Listing 生成 */
export function recordGeneration() {
  load();
  stats.generatedListings = (stats.generatedListings || 0) + 1;
  persist();
}

export function aiCallsCount() {
  return load().aiCalls || 0;
}

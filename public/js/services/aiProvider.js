/**
 * AI Provider —— AI 服务抽象层
 *
 * 职责：屏蔽 DeepSeek 细节，统一处理 API Key、错误、重试。
 * 页面不允许直接调用 DeepSeek；统一经由本层 -> 后端代理 -> DeepSeek API。
 */
import { getSettings } from '../store/settingsStore.js';

/** 调用 DeepSeek（走后端代理，避免浏览器 CORS / Key 暴露问题） */
export async function chat(messages, { model, temperature } = {}) {
  const settings = getSettings();
  const key = settings.apiKey?.trim();
  if (!key) {
    throw new Error('未配置 DeepSeek API Key，请前往「设置」完成配置。');
  }
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: key,
      model: model || settings.model || 'deepseek-chat',
      messages,
      temperature: temperature ?? settings.temperature ?? 0.9,
    }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: '服务响应异常' }));
  if (res.status === 404) {
    throw new Error('未连接到 AI 后端代理。当前为静态部署，AI 生成需在本机运行 server.js（npm start），或部署到支持 Node 的环境。');
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  }
  return data.content;
}

/** 测试 API Key 是否真实可用 */
export async function testConnection() {
  const settings = getSettings();
  const key = settings.apiKey?.trim();
  if (!key) throw new Error('未填写 API Key');
  const res = await fetch('/api/ai/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: key, model: settings.model }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: '服务响应异常' }));
  if (!data.ok) throw new Error(data.error || '连接测试失败');
  return data;
}

/** 带一次重试的调用 */
export async function chatWithRetry(messages, opts = {}) {
  try {
    return await chat(messages, opts);
  } catch (e) {
    // 仅对网络类错误重试一次
    if (/(timeout|ECONN|fetch failed|网络|abort)/i.test(e.message)) {
      return await chat(messages, opts);
    }
    throw e;
  }
}

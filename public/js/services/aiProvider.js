/**
 * AI Provider —— AI 服务抽象层
 *
 * 职责：屏蔽 DeepSeek 细节，统一处理 API Key、错误、重试。
 *
 * 调用策略（双模式自适应）：
 *  1) 服务端代理模式（部署在支持 Node 的环境，如 Render）：
 *     页面 -> 后端 /api/ai/generate -> DeepSeek API。
 *     Key 仅发给同源后端，最安全；且不依赖浏览器 CORS。
 *  2) 纯静态模式（部署在仅提供静态托管的平台，如 CloudStudio）：
 *     没有 /api/ai/generate 后端，此时浏览器直接调用 DeepSeek。
 *     经实测 api.deepseek.com 已开启 CORS（Access-Control-Allow-Origin 反射请求源、
 *     allow-methods: POST、allow-headers: authorization,content-type），因此浏览器
 *     可直接携带用户自己的 Key 调用，AI 功能照常工作。
 *     说明：此模式下 Key 为用户自有 Key、单用户个人工作台，直接调用可接受；
 *     若需多用户共享部署，请改用带后端的 Render 模式。
 */
import { getSettings } from '../store/settingsStore.js';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

/** 浏览器直接调用 DeepSeek（纯静态部署模式） */
async function callDeepSeekDirect(apiKey, model, messages, temperature) {
  const res = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages,
      temperature: temperature ?? 0.9,
      max_tokens: 4096,
      stream: false,
    }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const parsed = await res.json();
      detail = parsed.error?.message || '';
    } catch (_) { /* 忽略 */ }
    throw new Error(`DeepSeek API 响应异常（HTTP ${res.status}）：${detail}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek API 未返回有效内容');
  return content;
}

const STATIC_MARKER = '__STATIC_FALLBACK__';

/** 调用 DeepSeek（优先服务端代理，无后端时自动回退到浏览器直连） */
export async function chat(messages, { model, temperature } = {}) {
  const settings = getSettings();
  const key = settings.apiKey?.trim();
  if (!key) {
    throw new Error('未配置 DeepSeek API Key，请前往「设置」完成配置。');
  }
  const payload = {
    apiKey: key,
    model: model || settings.model || 'deepseek-chat',
    messages,
    temperature: temperature ?? settings.temperature ?? 0.9,
  };
  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 404) throw new Error(STATIC_MARKER);
    const data = await res.json().catch(() => ({ ok: false, error: '服务响应异常' }));
    if (res.ok && data.ok) return data.content;
    // 后端返回真实错误（如 Key 无效），不回退，直接抛出
    throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  } catch (e) {
    if (e.message === STATIC_MARKER || /Failed to fetch|NetworkError|网络|fetch failed|abort/i.test(e.message)) {
      // 纯静态部署：浏览器直连 DeepSeek
      return await callDeepSeekDirect(key, payload.model, messages, payload.temperature);
    }
    throw e;
  }
}

/** 测试 API Key 是否真实可用 */
export async function testConnection() {
  const settings = getSettings();
  const key = settings.apiKey?.trim();
  if (!key) throw new Error('未填写 API Key');
  try {
    const res = await fetch('/api/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, model: settings.model }),
    });
    if (res.status === 404) throw new Error(STATIC_MARKER);
    const data = await res.json().catch(() => ({ ok: false, error: '服务响应异常' }));
    if (data.ok) return data;
    throw new Error(data.error || '连接测试失败');
  } catch (e) {
    if (e.message === STATIC_MARKER || /Failed to fetch|NetworkError|网络|fetch failed|abort/i.test(e.message)) {
      const content = await callDeepSeekDirect(
        key,
        settings.model || 'deepseek-chat',
        [
          { role: 'system', content: 'You are a connectivity test bot.' },
          { role: 'user', content: 'Reply with exactly: OK' },
        ],
        0,
      );
      return { ok: true, content: String(content || '').slice(0, 60) };
    }
    throw e;
  }
}

/** 带一次重试的调用 */
export async function chatWithRetry(messages, opts = {}) {
  try {
    return await chat(messages, opts);
  } catch (e) {
    // 仅对网络类错误重试一次
    if (/(timeout|ECONN|fetch failed|网络|abort|Failed to fetch|NetworkError)/i.test(e.message)) {
      return await chat(messages, opts);
    }
    throw e;
  }
}

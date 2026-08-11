/**
 * 应用锁存储（localStorage 持久化密码与启用状态）
 * 注意：本地存储非加密，仅作轻量防误触/防旁观，不替代账号安全。
 */
const KEY = 'sgn.applock';

export function getLock() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return { enabled: !!raw.enabled, passcode: raw.passcode || '' };
  } catch {
    return { enabled: false, passcode: '' };
  }
}
export function saveLock({ enabled, passcode }) {
  try { localStorage.setItem(KEY, JSON.stringify({ enabled: !!enabled, passcode: passcode || '' })); } catch {}
  return { enabled: !!enabled, passcode: passcode || '' };
}
export function verify(passcode) {
  return getLock().passcode === passcode;
}

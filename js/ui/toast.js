/**
 * 轻提示 Toast
 */
export function toast(message, type = 'info', duration = 2600) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const closeBtn = document.createElement('span');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => el.remove();
  el.innerHTML = `<span>${icons[type] || ''}</span><span></span>`;
  el.children[1].textContent = message;
  el.appendChild(closeBtn);
  root.appendChild(el);
  if (duration > 0) setTimeout(() => el.remove(), duration);
}

export const toastSuccess = (m) => toast(m, 'success');
export const toastError = (m) => toast(m, 'error', 3600);
export const toastInfo = (m) => toast(m, 'info');

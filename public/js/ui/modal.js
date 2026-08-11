/**
 * 弹窗 Modal
 */
export function openModal({ title, body, footer, width = 'normal', onClose }) {
  const root = document.getElementById('modalRoot');
  const mask = document.createElement('div');
  mask.className = 'modal-mask';

  const modal = document.createElement('div');
  modal.className = `modal ${width === 'wide' ? 'modal-wide' : width === 'narrow' ? 'modal-narrow' : ''}`;

  const head = document.createElement('div');
  head.className = 'modal-head';
  const titleEl = document.createElement('div');
  titleEl.className = 'modal-title';
  titleEl.textContent = title || '';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '✕';
  closeBtn.setAttribute('aria-label', '关闭');
  head.appendChild(titleEl);
  head.appendChild(closeBtn);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof HTMLElement) bodyEl.appendChild(body);

  modal.appendChild(head);
  modal.appendChild(bodyEl);

  if (footer) {
    const footEl = document.createElement('div');
    footEl.className = 'modal-foot';
    if (typeof footer === 'string') footEl.innerHTML = footer;
    else if (footer instanceof HTMLElement) footEl.appendChild(footer);
    modal.appendChild(footEl);
  }

  mask.appendChild(modal);
  root.appendChild(mask);

  function close() {
    root.removeChild(mask);
    onClose && onClose();
  }

  closeBtn.onclick = close;
  mask.addEventListener('mousedown', (e) => {
    if (e.target === mask) close();
  });
  const escHandler = (e) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);

  return { el: modal, close };
}

/** 确认框 */
export function confirmDialog({ title = '确认操作', message = '', confirmText = '确认', danger = false, onConfirm }) {
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:10px;width:100%;';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = '取消';
  const okBtn = document.createElement('button');
  okBtn.className = `btn ${danger ? 'btn-danger-soft' : 'btn-primary'}`;
  okBtn.textContent = confirmText;
  footer.appendChild(cancelBtn);
  footer.appendChild(okBtn);

  const bodyEl = document.createElement('div');
  bodyEl.style.cssText = 'font-size:14px;color:var(--text-sub);line-height:1.7;padding:4px 0 8px;white-space:pre-wrap;';
  bodyEl.textContent = message;

  const m = openModal({ title, body: bodyEl, footer, width: 'narrow' });
  cancelBtn.onclick = m.close;
  okBtn.onclick = () => { m.close(); onConfirm && onConfirm(); };
  return m;
}

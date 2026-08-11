/**
 * 可复用表单组件
 */
import { icon } from './icons.js';
import { fileToDataURL, extractImageFromEvent } from '../utils.js';

/**
 * 图片上传组件（单击选中 / 双击打开文件夹 / Ctrl+V 粘贴 / 拖拽）
 * 返回 { el, getValue, setValue }
 */
export function createImageUploader({ onChange } = {}) {
  const el = document.createElement('div');
  el.className = 'uploader';
  el.innerHTML = `
    <div class="upload-placeholder">
      ${icon('image')}
      <div class="up-title">单击选中图片区域</div>
      <div class="up-sub">双击打开文件夹上传 · 支持 Ctrl+V 粘贴 · 拖拽图片</div>
    </div>
    <input type="file" accept="image/*" hidden>
  `;
  const input = el.querySelector('input');
  let value = '';
  let selected = false;

  function setValue(dataUrl) {
    value = dataUrl || '';
    el.classList.toggle('has-image', Boolean(value));
    if (value) {
      const img = document.createElement('img');
      img.className = 'preview';
      img.src = value;
      el.appendChild(img);
      const clear = document.createElement('button');
      clear.className = 'upload-clear';
      clear.innerHTML = '✕';
      clear.setAttribute('aria-label', '移除图片');
      clear.onclick = (e) => {
        e.stopPropagation();
        setValue('');
      };
      el.appendChild(clear);
    } else {
      el.querySelectorAll('img.preview, .upload-clear').forEach((n) => n.remove());
    }
    onChange && onChange(value);
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      const dataUrl = await fileToDataURL(file);
      setValue(dataUrl);
    } catch (_) {
      // 读取失败时忽略
    }
  }

  // 单击：仅选中区域（不打开上传面板），并给出视觉反馈
  el.addEventListener('click', (e) => {
    if (e.target.closest('.upload-clear')) return;
    e.preventDefault();
    selected = true;
    el.classList.add('selected');
  });

  // 双击：打开文件夹上传
  el.addEventListener('dblclick', (e) => {
    e.preventDefault();
    input.click();
  });

  // 点击区域外取消选中
  document.addEventListener('click', (e) => {
    if (selected && !el.contains(e.target)) {
      selected = false;
      el.classList.remove('selected');
    }
  });

  input.addEventListener('change', () => handleFile(input.files[0]));

  // 全局粘贴：仅当焦点在文档内且目标是本组件所在表单区域时生效（简化：直接监听 document）
  document.addEventListener('paste', (e) => {
    if (!el.isConnected) return;
    // 如果正在输入文本，不劫持粘贴
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const file = extractImageFromEvent(e);
    if (file) {
      e.preventDefault();
      handleFile(file);
    }
  });

  // 拖拽
  ['dragover', 'dragenter'].forEach((ev) => el.addEventListener(ev, (e) => {
    e.preventDefault();
    el.classList.add('drop-active');
  }));
  ['dragleave', 'drop'].forEach((ev) => el.addEventListener(ev, (e) => {
    e.preventDefault();
    el.classList.remove('drop-active');
  }));
  el.addEventListener('drop', (e) => {
    const file = extractImageFromEvent(e);
    if (file) handleFile(file);
  });

  return {
    el,
    getValue: () => value,
    setValue,
  };
}

/** 标签输入（chip 形式，回车/逗号添加） */
export function createTagInput({ placeholder = '输入后回车添加' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'tag-input-wrap';
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--card);';
  const input = document.createElement('input');
  input.className = 'input';
  input.style.cssText = 'flex:1;min-width:120px;border:none;box-shadow:none;padding:4px 6px;';
  input.placeholder = placeholder;
  wrap.appendChild(input);
  let tags = [];

  function renderTags() {
    wrap.querySelectorAll('.term-chip').forEach((n) => n.remove());
    tags.forEach((t) => {
      const chip = document.createElement('span');
      chip.className = 'term-chip';
      chip.style.cssText = 'cursor:default;';
      chip.textContent = t;
      const x = document.createElement('i');
      x.textContent = ' ✕';
      x.style.cssText = 'cursor:pointer;opacity:.6;font-style:normal;';
      x.onclick = () => {
        tags = tags.filter((v) => v !== t);
        renderTags();
      };
      chip.appendChild(x);
      wrap.insertBefore(chip, input);
    });
  }

  function commit() {
    const v = input.value.trim();
    if (v) {
      v.split(/[,，]/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
        if (!tags.includes(s)) tags.push(s);
      });
      input.value = '';
      renderTags();
    }
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    if (e.key === 'Backspace' && !input.value && tags.length) {
      tags.pop();
      renderTags();
    }
  });
  input.addEventListener('blur', commit);
  input.addEventListener('paste', (e) => {
    // 允许粘贴文字（图片粘贴由 uploader 处理，这里不拦截文本）
    setTimeout(commit, 0);
  });

  return {
    el: wrap,
    getValue: () => [...tags],
    setValue: (arr) => { tags = [...new Set((arr || []).map(String).filter(Boolean))]; renderTags(); },
    reset: () => { tags = []; input.value = ''; renderTags(); },
  };
}

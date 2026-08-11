/**
 * 应用锁设置页面
 */
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { getLock, saveLock } from '../store/applockStore.js';

export function render(container) {
  const lock = getLock();
  container.innerHTML = `
    <div class="card">
      <div class="card-title">${icon('lock')} 应用锁</div>
      <p class="muted" style="margin:0 0 12px">开启后，每次打开工作台需输入密码。仅作轻量防旁观，本地存储非加密。</p>
      <div class="row" style="gap:10px;align-items:center;margin-bottom:12px">
        <label class="check"><input type="checkbox" id="al-enable" ${lock.enabled ? 'checked' : ''} /> 启用应用锁</label>
      </div>
      <div class="commission-grid">
        <div><label class="form-label">设置密码</label><input class="input" id="al-pass" type="password" placeholder="${lock.enabled ? '留空不修改' : '4 位以上'}" /></div>
        <div><label class="form-label">确认密码</label><input class="input" id="al-conf" type="password" placeholder="再次输入" /></div>
      </div>
      <button class="btn btn-primary btn-sm" id="al-save" style="margin-top:12px">${icon('save')} 保存</button>
    </div>
  `;
  const $ = (id) => container.querySelector(id);
  $('#al-save').onclick = () => {
    const enabled = $('#al-enable').checked;
    const pass = $('#al-pass').value;
    const conf = $('#al-conf').value;
    const cur = getLock();
    if (enabled) {
      if (cur.enabled && !pass) {
        saveLock({ enabled: true, passcode: cur.passcode });
        toast('应用锁保持启用', 'success'); return;
      }
      if (pass.length < 4) { toast('密码至少 4 位', 'error'); return; }
      if (pass !== conf) { toast('两次输入不一致', 'error'); return; }
      saveLock({ enabled: true, passcode: pass });
      toast('应用锁已启用', 'success');
    } else {
      saveLock({ enabled: false, passcode: cur.passcode });
      toast('应用锁已关闭', 'success');
    }
  };
}

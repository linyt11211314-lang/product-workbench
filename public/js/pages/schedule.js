/**
 * 排期 / 任务页面 —— 基于 services/schedule.js + store/scheduleStore.js
 */
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { getTasks, addTask, updateTask, removeTask } from '../store/scheduleStore.js';
import { sortTasks, tasksForDate, scheduleStats, TASK_PRIORITIES, TASK_CATEGORIES } from '../services/schedule.js';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function render(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">${icon('calendar')} 排期 / 今日任务</div>
      <div class="commission-grid" style="margin-top:10px">
        <div style="grid-column:1/-1"><label class="form-label">任务标题 *</label><input class="input" id="s-title" placeholder="例如：完成 AE-002 竞品分析" /></div>
        <div><label class="form-label">日期</label><input class="input" id="s-date" type="date" value="${todayStr()}" /></div>
        <div><label class="form-label">时间</label><input class="input" id="s-time" type="time" /></div>
        <div><label class="form-label">优先级</label><select class="input" id="s-prio">${TASK_PRIORITIES.map((p) => `<option>${p}</option>`).join('')}</select></div>
        <div><label class="form-label">类别</label><select class="input" id="s-cat">${TASK_CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select></div>
        <div style="grid-column:1/-1"><label class="form-label">备注</label><input class="input" id="s-notes" placeholder="可选" /></div>
        <div style="grid-column:1/-1" class="row" style="gap:10px">
          <label class="check"><input type="checkbox" id="s-rem" /> 启用提醒</label>
          <button class="btn btn-primary btn-sm" id="s-add">${icon('plus')} 添加任务</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">${icon('chart')} 概览</div>
      <div id="s-stats" class="kv-grid"></div>
    </div>

    <div class="card">
      <div class="card-title">${icon('list')} 任务清单</div>
      <div id="s-list"></div>
    </div>
  `;

  const $ = (id) => container.querySelector(id);

  $('#s-add').onclick = () => {
    const title = $('#s-title').value.trim();
    if (!title) { toast('请填写任务标题', 'error'); return; }
    addTask({
      title,
      date: $('#s-date').value || todayStr(),
      time: $('#s-time').value || '',
      priority: $('#s-prio').value,
      category: $('#s-cat').value,
      notes: $('#s-notes').value,
      reminder: $('#s-rem').checked,
    });
    $('#s-title').value = ''; $('#s-notes').value = '';
    toast('已添加', 'success');
    renderList();
  };

  function renderStats() {
    const stats = scheduleStats(getTasks());
    $('#s-stats').innerHTML = `
      <div><span>总数</span><b>${stats.total}</b></div>
      <div><span>已完成</span><b class="pos">${stats.completed}</b></div>
      <div><span>待办</span><b>${stats.pending}</b></div>
      <div><span>高优先级待办</span><b class="neg">${stats.highPriority}</b></div>
      <div><span>完成率</span><b>${Math.round(stats.completionRate * 100)}%</b></div>`;
  }

  function renderList() {
    const tasks = sortTasks(getTasks());
    const box = $('#s-list');
    if (!tasks.length) { box.innerHTML = '<p class="muted">暂无任务</p>'; renderStats(); return; }
    box.innerHTML = tasks.map((t) => `
      <div class="history-row ${t.completed ? 'done' : ''}">
        <div class="check"><input type="checkbox" data-toggle="${t.id}" ${t.completed ? 'checked' : ''} /> <b>${t.title}</b></div>
        <div class="muted">${t.date} ${t.time || ''} · ${t.priority} · ${t.category}${t.notes ? ' · ' + t.notes : ''}</div>
        <button class="btn btn-soft btn-sm" data-del="${t.id}">${icon('trash')}</button>
      </div>`).join('');
    box.querySelectorAll('[data-toggle]').forEach((c) => c.onchange = () => { updateTask(c.dataset.toggle, { completed: c.checked }); renderList(); });
    box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { removeTask(b.dataset.del); renderList(); });
    renderStats();
  }
  renderList();
}

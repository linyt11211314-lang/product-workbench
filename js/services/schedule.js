/**
 * 排期 / 任务服务 —— 移植自 Codex lib/schedule.ts
 */
export const TASK_PRIORITIES = ['高', '中', '低'];
export const TASK_CATEGORIES = ['选品调研', '供应商', '数据分析', '上新运营', '其他'];

const priorityRank = { 高: 0, 中: 1, 低: 2 };

export function sortTasks(tasks) {
  return [...tasks].sort((left, right) => {
    if (left.completed !== right.completed) return left.completed ? 1 : -1;
    const leftTime = left.time || '99:99';
    const rightTime = right.time || '99:99';
    return leftTime.localeCompare(rightTime) || priorityRank[left.priority] - priorityRank[right.priority] || left.createdAt.localeCompare(right.createdAt);
  });
}

export function tasksForDate(tasks, date) {
  return sortTasks(tasks.filter((task) => task.date === date));
}

export function completeScheduleTask(tasks, taskId) {
  return tasks.map((task) => (task.id === taskId ? { ...task, completed: true } : task));
}

export function scheduleStats(tasks) {
  const completed = tasks.filter((task) => task.completed).length;
  const pending = tasks.length - completed;
  return {
    total: tasks.length,
    completed,
    pending,
    highPriority: tasks.filter((task) => !task.completed && task.priority === '高').length,
    completionRate: tasks.length ? completed / tasks.length : 0,
  };
}

export function isReminderDue(task, now) {
  if (!task.reminder || task.completed || !task.time) return false;
  const due = new Date(`${task.date}T${task.time}:00`);
  return !Number.isNaN(due.getTime()) && due.getTime() <= now.getTime();
}

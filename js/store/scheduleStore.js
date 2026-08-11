/**
 * 排期 / 任务存储（localStorage 持久化）
 */
import { uid } from '../utils.js';

const KEY = 'sgn.schedule';

export function getTasks() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
export function saveTasks(tasks) {
  try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch {}
  return tasks;
}
export function addTask(task) {
  const tasks = getTasks();
  const item = { id: uid('task'), completed: false, createdAt: new Date().toISOString(), ...task };
  tasks.push(item);
  saveTasks(tasks);
  return item;
}
export function updateTask(id, patch) {
  const tasks = getTasks().map((t) => (t.id === id ? { ...t, ...patch } : t));
  saveTasks(tasks);
  return tasks;
}
export function removeTask(id) {
  const tasks = getTasks().filter((t) => t.id !== id);
  saveTasks(tasks);
  return tasks;
}

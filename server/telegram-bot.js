// Telegram bot menu + option handlers. Same data as the dashboard.
const crypto = require('crypto');
const { db, getSetting, setSetting } = require('./db');
const { JWT_SECRET } = require('./auth');
const { executeTool } = require('./ai-tools');

const BTN = {
  menu: '🏠 Menu',
  tasks: '📋 Tasks',
  projects: '🚀 Projects',
  money: '💰 Money',
  ai: '🤖 AI Chat',
  reports: '📊 Reports',
  addTask: '➕ New task',
  todayTasks: '📅 Today',
  doneTask: '✅ Complete task',
  addProject: '➕ New project',
  running: '🏃 Running',
  addExpense: '💸 Add expense',
  addIncome: '💵 Add income',
  morning: '☀️ Morning report',
  night: '🌙 Night report',
  finance: '📈 Finance',
  cancel: '❌ Cancel',
};

function webhookSecret(uid) {
  return crypto.createHmac('sha256', JWT_SECRET).update(`tg:${uid}`).digest('hex').slice(0, 32);
}

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: BTN.tasks }, { text: BTN.projects }],
      [{ text: BTN.money }, { text: BTN.ai }],
      [{ text: BTN.reports }, { text: BTN.menu }],
    ],
    resize_keyboard: true,
  };
}

function tasksKeyboard() {
  return {
    keyboard: [
      [{ text: BTN.todayTasks }, { text: BTN.addTask }],
      [{ text: BTN.doneTask }, { text: BTN.menu }],
    ],
    resize_keyboard: true,
  };
}

function projectsKeyboard() {
  return {
    keyboard: [
      [{ text: BTN.running }, { text: BTN.addProject }],
      [{ text: BTN.menu }],
    ],
    resize_keyboard: true,
  };
}

function moneyKeyboard() {
  return {
    keyboard: [
      [{ text: BTN.addExpense }, { text: BTN.addIncome }],
      [{ text: BTN.finance }, { text: BTN.menu }],
    ],
    resize_keyboard: true,
  };
}

function reportsKeyboard() {
  return {
    keyboard: [
      [{ text: BTN.morning }, { text: BTN.night }],
      [{ text: BTN.finance }, { text: BTN.menu }],
    ],
    resize_keyboard: true,
  };
}

function cancelKeyboard() {
  return {
    keyboard: [[{ text: BTN.cancel }, { text: BTN.menu }]],
    resize_keyboard: true,
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function tgApi(token, method, body) {
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `${method} failed`);
  return data;
}

async function reply(uid, text, replyMarkup) {
  const token = await getSetting(uid, 'telegram_bot_token');
  const chat = await getSetting(uid, 'telegram_chat_id');
  if (!token || !chat) return;
  await tgApi(token, 'sendMessage', {
    chat_id: chat,
    text: String(text).slice(0, 4000),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: replyMarkup || mainKeyboard(),
  });
}

async function setMode(uid, mode, draft = '') {
  await setSetting(uid, 'tg_bot_mode', mode || 'menu');
  await setSetting(uid, 'tg_bot_draft', typeof draft === 'string' ? draft : JSON.stringify(draft || {}));
}

async function getMode(uid) {
  return (await getSetting(uid, 'tg_bot_mode')) || 'menu';
}

async function getDraft(uid) {
  const raw = await getSetting(uid, 'tg_bot_draft');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { text: raw }; }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function listTodayTasks(uid) {
  const rows = await db.prepare("SELECT id, title, time, priority, status FROM tasks WHERE user_id=? AND date=? ORDER BY status ASC, time ASC").all(uid, today());
  if (!rows.length) return '📅 <b>Today</b>\nNo tasks yet. Tap ➕ New task.';
  const lines = ['📅 <b>Today\'s tasks</b>', ''];
  for (const t of rows) {
    lines.push(`${t.status === 'done' ? '✅' : '⬜'} <b>#${t.id}</b> ${escapeHtml(t.title)}${t.time ? ' · ' + t.time : ''}${t.priority === 'high' ? ' 🔴' : ''}`);
  }
  lines.push('', 'Complete: send <code>#12 done</code> or tap ✅ Complete task');
  return lines.join('\n');
}

async function listRunningProjects(uid) {
  const rows = await db.prepare("SELECT id, name, progress, end_date FROM projects WHERE user_id=? AND status='running' ORDER BY end_date ASC").all(uid);
  if (!rows.length) return '🚀 <b>Running projects</b>\nNone yet. Tap ➕ New project.';
  const lines = ['🚀 <b>Running projects</b>', ''];
  for (const p of rows) {
    lines.push(`• <b>#${p.id}</b> ${escapeHtml(p.name)} — ${p.progress}%${p.end_date ? ' · due ' + p.end_date : ''}`);
  }
  return lines.join('\n');
}

async function moneySummary(uid) {
  const month = today().slice(0, 7);
  const like = month + '%';
  const income = (await db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date LIKE ? AND type='income'").get(uid, like)).t;
  const expense = (await db.prepare("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE user_id=? AND date LIKE ? AND type='expense'").get(uid, like)).t;
  return `💰 <b>This month (${month})</b>\nIncome: <b>${Number(income).toFixed(2)}</b>\nExpense: <b>${Number(expense).toFixed(2)}</b>\nBalance: <b>${(income - expense).toFixed(2)}</b>`;
}

async function handleMenu(uid, text) {
  if (text === BTN.menu || text === '/start' || text === '/menu') {
    await setMode(uid, 'menu');
    await reply(uid,
      '🏠 <b>Personal OS</b>\nChoose an option below — same data as your dashboard.',
      mainKeyboard());
    return true;
  }
  if (text === BTN.tasks) {
    await setMode(uid, 'tasks');
    await reply(uid, await listTodayTasks(uid), tasksKeyboard());
    return true;
  }
  if (text === BTN.projects) {
    await setMode(uid, 'projects');
    await reply(uid, await listRunningProjects(uid), projectsKeyboard());
    return true;
  }
  if (text === BTN.money) {
    await setMode(uid, 'money');
    await reply(uid, await moneySummary(uid), moneyKeyboard());
    return true;
  }
  if (text === BTN.ai) {
    await setMode(uid, 'ai');
    await reply(uid,
      '🤖 <b>AI Chat</b>\nType any prompt — same engine as the dashboard (can create/update tasks & projects).\nSend /menu to exit.',
      cancelKeyboard());
    return true;
  }
  if (text === BTN.reports) {
    await setMode(uid, 'reports');
    await reply(uid, '📊 <b>Reports</b>\nPick a report to send now.', reportsKeyboard());
    return true;
  }
  return false;
}

async function handleTasksFlow(uid, text) {
  if (text === BTN.todayTasks) {
    await reply(uid, await listTodayTasks(uid), tasksKeyboard());
    return true;
  }
  if (text === BTN.addTask) {
    await setMode(uid, 'await_task');
    await reply(uid, '➕ Send the task title.\nOptional: <code>Buy milk tomorrow 11:00 high</code>', cancelKeyboard());
    return true;
  }
  if (text === BTN.doneTask) {
    await setMode(uid, 'await_done_task');
    await reply(uid, 'Send the task id to complete, e.g. <code>12</code> or <code>#12 done</code>', cancelKeyboard());
    return true;
  }
  const doneMatch = text.match(/^#?(\d+)\s*(done|complete)\s*$/i);
  if (doneMatch) {
    const id = Number(doneMatch[1]);
    const out = await executeTool(uid, 'os_update', { resource: 'tasks', id, data: { status: 'done' } });
    await reply(uid, out.ok ? `✅ Task #${id} marked done.` : `❌ ${out.result?.error || 'Failed'}`, tasksKeyboard());
    await setMode(uid, 'tasks');
    return true;
  }
  return false;
}

async function handleProjectsFlow(uid, text) {
  if (text === BTN.running) {
    await reply(uid, await listRunningProjects(uid), projectsKeyboard());
    return true;
  }
  if (text === BTN.addProject) {
    await setMode(uid, 'await_project');
    await reply(uid, '➕ Send project name.\nOptional: <code>Website Redesign | Landing page, Auth, Deploy</code>', cancelKeyboard());
    return true;
  }
  return false;
}

async function handleMoneyFlow(uid, text) {
  if (text === BTN.addExpense) {
    await setMode(uid, 'await_expense');
    await reply(uid, '💸 Send: <code>title amount category</code>\nExample: <code>Lunch 450 food</code>', cancelKeyboard());
    return true;
  }
  if (text === BTN.addIncome) {
    await setMode(uid, 'await_income');
    await reply(uid, '💵 Send: <code>title amount</code>\nExample: <code>Salary 50000</code>', cancelKeyboard());
    return true;
  }
  return false;
}

async function handleAwait(uid, mode, text) {
  if (text === BTN.cancel) {
    await setMode(uid, 'menu');
    await reply(uid, 'Cancelled.', mainKeyboard());
    return true;
  }

  if (mode === 'await_task') {
    const parts = text.split(/\s+/);
    let priority = 'medium';
    let time = '';
    let date = today();
    const rest = [];
    for (const p of parts) {
      if (/^(high|medium|low)$/i.test(p)) priority = p.toLowerCase();
      else if (/^\d{1,2}:\d{2}$/.test(p)) time = p;
      else if (/^tomorrow$/i.test(p)) {
        const d = new Date(); d.setDate(d.getDate() + 1); date = d.toISOString().slice(0, 10);
      } else rest.push(p);
    }
    const title = rest.join(' ').trim() || text;
    const out = await executeTool(uid, 'os_create', {
      resource: 'tasks',
      data: { title, date, time, priority, status: 'pending' },
    });
    await setMode(uid, 'tasks');
    await reply(uid, out.ok
      ? `✅ Task created <b>#${out.result.id}</b>: ${escapeHtml(out.result.title)}`
      : `❌ ${out.result?.error || 'Failed'}`, tasksKeyboard());
    return true;
  }

  if (mode === 'await_done_task') {
    const id = Number(String(text).replace(/[^\d]/g, ''));
    const out = await executeTool(uid, 'os_update', { resource: 'tasks', id, data: { status: 'done' } });
    await setMode(uid, 'tasks');
    await reply(uid, out.ok ? `✅ Task #${id} done.` : `❌ ${out.result?.error || 'Failed'}`, tasksKeyboard());
    return true;
  }

  if (mode === 'await_project') {
    const [namePart, itemsPart] = text.split('|').map((s) => s.trim());
    const name = namePart || text;
    const created = await executeTool(uid, 'os_create', {
      resource: 'projects',
      data: { name, status: 'running', start_date: today(), progress: 0 },
    });
    if (!created.ok) {
      await reply(uid, `❌ ${created.result?.error || 'Failed'}`, projectsKeyboard());
      await setMode(uid, 'projects');
      return true;
    }
    const pid = created.result.id;
    if (itemsPart) {
      const items = itemsPart.split(',').map((s) => s.trim()).filter(Boolean);
      let pos = 0;
      for (const content of items) {
        await executeTool(uid, 'os_create', {
          resource: 'project_items',
          data: { project_id: pid, content, done: 0, position: pos++ },
        });
      }
    }
    await setMode(uid, 'projects');
    await reply(uid, `🚀 Project created <b>#${pid}</b>: ${escapeHtml(name)}`, projectsKeyboard());
    return true;
  }

  if (mode === 'await_expense' || mode === 'await_income') {
    const m = text.match(/^(.+?)\s+([\d.]+)\s*(.*)$/);
    if (!m) {
      await reply(uid, 'Format: <code>title amount category</code>', cancelKeyboard());
      return true;
    }
    const title = m[1].trim();
    const amount = Number(m[2]);
    const category = (m[3] || 'general').trim() || 'general';
    const out = await executeTool(uid, 'os_create', {
      resource: 'expenses',
      data: {
        title,
        amount,
        category,
        date: today(),
        type: mode === 'await_income' ? 'income' : 'expense',
      },
    });
    await setMode(uid, 'money');
    await reply(uid, out.ok
      ? `✅ Saved <b>#${out.result.id}</b>: ${escapeHtml(title)} — ${amount}`
      : `❌ ${out.result?.error || 'Failed'}`, moneyKeyboard());
    return true;
  }

  return false;
}

async function handleReports(uid, text) {
  const { morningReport, nightReport, financeReport, userToday } = require('./telegram');
  if (text === BTN.morning) {
    const d = await userToday(uid);
    await reply(uid, await morningReport(uid, d), reportsKeyboard());
    return true;
  }
  if (text === BTN.night) {
    const d = await userToday(uid);
    await reply(uid, await nightReport(uid, d), reportsKeyboard());
    return true;
  }
  if (text === BTN.finance) {
    const d = await userToday(uid);
    await reply(uid, await financeReport(uid, d.slice(0, 7)), moneyKeyboard());
    return true;
  }
  return false;
}

async function handleAi(uid, text) {
  if (text === BTN.cancel || text === '/menu') {
    await setMode(uid, 'menu');
    await reply(uid, 'Back to menu.', mainKeyboard());
    return true;
  }
  await reply(uid, '⏳ Thinking…', cancelKeyboard());
  try {
    const { runUserChat } = require('./ai');
    const result = await runUserChat(uid, text, {
      title: 'Telegram AI',
      skipTelegramForward: true,
    });
    await reply(uid, escapeHtml(result.reply).slice(0, 3900), cancelKeyboard());
  } catch (e) {
    await reply(uid, `❌ ${escapeHtml(e.message || 'AI failed')}`, cancelKeyboard());
  }
  return true;
}

async function handleUpdate(uid, update) {
  const msg = update.message || update.edited_message;
  if (!msg?.chat?.id) return;
  const chatId = String(msg.chat.id);
  const saved = await getSetting(uid, 'telegram_chat_id');
  if (saved && saved !== chatId) return;
  if (!saved) await setSetting(uid, 'telegram_chat_id', chatId);

  const text = String(msg.text || '').trim();
  if (!text) {
    await reply(uid, 'Send text, or tap a menu button.', mainKeyboard());
    return;
  }

  if (await handleMenu(uid, text)) return;

  const mode = await getMode(uid);
  if (mode === 'ai') {
    await handleAi(uid, text);
    return;
  }
  if (mode.startsWith('await_')) {
    if (await handleAwait(uid, mode, text)) return;
  }
  if (mode === 'tasks' && await handleTasksFlow(uid, text)) return;
  if (mode === 'projects' && await handleProjectsFlow(uid, text)) return;
  if (mode === 'money' && await handleMoneyFlow(uid, text)) return;
  if (mode === 'reports' && await handleReports(uid, text)) return;
  if (text === BTN.finance && await handleReports(uid, text)) return;

  // Free text outside AI mode → offer menu or treat as AI shortcut
  if (text.startsWith('/')) {
    await setMode(uid, 'menu');
    await reply(uid, '🏠 Menu', mainKeyboard());
    return;
  }
  await reply(uid,
    'Tap a button below, or open 🤖 AI Chat to use natural language.',
    mainKeyboard());
}

async function registerWebhook(uid, publicBase) {
  const token = await getSetting(uid, 'telegram_bot_token');
  if (!token || !publicBase) return null;
  const secret = webhookSecret(uid);
  const url = `${publicBase.replace(/\/+$/, '')}/api/telegram/webhook/${uid}/${secret}`;
  await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).catch(() => {});
  const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, allowed_updates: ['message', 'callback_query'] }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || 'setWebhook failed');
  await setSetting(uid, 'tg_webhook_url', url);
  return url;
}

module.exports = {
  BTN, mainKeyboard, webhookSecret, handleUpdate, registerWebhook, reply, setMode,
};

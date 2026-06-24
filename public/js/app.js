import { api, post, setToken, token } from './api.js';
import { el, icon, icons, toast } from './ui.js';

import dashboard from './views/dashboard.js';
import tasks from './views/tasks.js';
import projects from './views/projects.js';
import plans from './views/plans.js';
import ideas from './views/ideas.js';
import files from './views/files.js';
import calendar from './views/calendar.js';
import expenses from './views/expenses.js';
import habits from './views/habits.js';
import health from './views/health.js';
import travel from './views/travel.js';
import ai from './views/ai.js';
import settings from './views/settings.js';
import finance from './views/finance.js';
import debts from './views/debts.js';
import invest from './views/invest.js';

const root = document.getElementById('root');
export let currentUser = null;

const NAV = [
  { group: 'Overview', items: [
    { route: 'dashboard', label: 'Dashboard', icon: 'dashboard', view: dashboard },
  ]},
  { group: 'Planner', items: [
    { route: 'tasks', label: 'Daily Tasks', icon: 'tasks', view: tasks },
    { route: 'calendar', label: 'Calendar', icon: 'calendar', view: calendar },
  ]},
  { group: 'Projects', items: [
    { route: 'running', label: 'Running Projects', icon: 'running', view: () => projects('running') },
    { route: 'upcoming', label: 'Upcoming Projects', icon: 'upcoming', view: () => projects('upcoming') },
    { route: 'plans', label: 'Next Plans', icon: 'plan', view: plans },
    { route: 'ideas', label: 'Brainstorming', icon: 'idea', view: ideas },
    { route: 'files', label: 'Project Files', icon: 'folder', view: files },
  ]},
  { group: 'Finance', items: [
    { route: 'finance', label: 'Finance Overview', icon: 'finance', view: finance },
    { route: 'expenses', label: 'Income & Expenses', icon: 'expense', view: expenses },
    { route: 'debts', label: 'Debts & Loans', icon: 'debt', view: debts },
    { route: 'invest', label: 'Investments', icon: 'invest', view: invest },
  ]},
  { group: 'Life', items: [
    { route: 'habits', label: 'Habit Tracker', icon: 'habit', view: habits },
    { route: 'health', label: 'Health Dashboard', icon: 'health', view: health },
    { route: 'travel', label: 'Travel Planner', icon: 'travel', view: travel },
  ]},
  { group: 'Intelligence', items: [
    { route: 'ai', label: 'AI Assistant', icon: 'ai', view: ai },
  ]},
  { group: 'System', items: [
    { route: 'settings', label: 'Settings', icon: 'settings', view: settings },
  ]},
];

const ROUTES = {};
for (const g of NAV) for (const item of g.items) ROUTES[item.route] = item;

// ============ Auth screens ============
function authScreen(mode, hasUsers) {
  root.innerHTML = '';
  const isLogin = mode === 'login';
  const err = el('div', { class: 'auth-error', style: { display: 'none' } });
  const username = el('input', { type: 'text', placeholder: 'Your username', autocomplete: 'username' });
  const name = el('input', { type: 'text', placeholder: 'How should we call you?' });
  const password = el('input', { type: 'password', placeholder: isLogin ? 'Your password' : 'At least 6 characters', autocomplete: isLogin ? 'current-password' : 'new-password' });

  const submit = async () => {
    err.style.display = 'none';
    btn.disabled = true;
    try {
      const body = { username: username.value, password: password.value };
      if (!isLogin) body.name = name.value;
      const data = await post(isLogin ? '/auth/login' : '/auth/register', body);
      setToken(data.token);
      currentUser = data.user;
      boot();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = 'block';
      btn.disabled = false;
    }
  };
  const btn = el('button', { class: 'btn', style: { width: '100%', justifyContent: 'center', padding: '11px' }, onclick: submit },
    isLogin ? 'Sign in' : 'Create account');
  [username, password, name].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));

  root.append(el('div', { class: 'auth-wrap' },
    el('div', { class: 'auth-card' },
      el('div', { class: 'auth-logo' }, el('div', { class: 'mark' }, 'P'), el('h1', {}, 'Personal OS')),
      el('p', { class: 'auth-sub' }, isLogin ? 'Welcome back. Sign in to your dashboard.' :
        (hasUsers ? 'Create a new account.' : 'Set up your account to get started.')),
      err,
      !isLogin && el('div', { class: 'field' }, el('label', {}, 'Display name'), name),
      el('div', { class: 'field' }, el('label', {}, 'Username'), username),
      el('div', { class: 'field' }, el('label', {}, 'Password'), password),
      btn,
      el('div', { class: 'auth-switch' },
        isLogin
          ? el('span', {}, 'No account yet? ', el('a', { onclick: () => authScreen('register', hasUsers) }, 'Create one'))
          : el('span', {}, 'Already registered? ', el('a', { onclick: () => authScreen('login', hasUsers) }, 'Sign in')),
      ),
    ),
  ));
  setTimeout(() => (isLogin ? username : name).focus(), 50);
}

// ============ App shell ============
let mainEl = null;

function shell() {
  root.innerHTML = '';
  const navButtons = {};

  const sidebar = el('aside', { class: 'sidebar' },
    el('div', { class: 'side-logo' }, el('div', { class: 'mark' }, 'P'), el('span', {}, 'Personal OS')),
    NAV.map(g => el('div', { class: 'nav-group' },
      el('div', { class: 'nav-label' }, g.group),
      g.items.map(item => {
        const b = el('button', { class: 'nav-item', onclick: () => navigate(item.route) },
          icon(item.icon), el('span', {}, item.label));
        navButtons[item.route] = b;
        return b;
      }),
    )),
    el('div', { class: 'side-footer' },
      el('div', { class: 'side-user' },
        el('div', { class: 'avatar' }, (currentUser.name || currentUser.username || '?')[0].toUpperCase()),
        el('div', { class: 'who' }, el('b', {}, currentUser.name || currentUser.username), el('span', {}, '@' + currentUser.username)),
        (() => { const b = el('button', { class: 'icon-btn', title: 'Log out', onclick: logout }); b.innerHTML = icons.logout; return b; })(),
      ),
    ),
  );

  mainEl = el('main', { class: 'main' });
  root.append(el('div', { class: 'shell' }, sidebar, mainEl));

  window.addEventListener('hashchange', renderRoute);
  shell.navButtons = navButtons;
}

export function navigate(route) {
  location.hash = '#/' + route;
}

async function renderRoute() {
  const route = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  const item = ROUTES[route] || ROUTES.dashboard;
  for (const [r, b] of Object.entries(shell.navButtons || {})) b.classList.toggle('active', r === (ROUTES[route] ? route : 'dashboard'));
  mainEl.innerHTML = '';
  mainEl.scrollTop = 0;
  try {
    const view = await item.view();
    mainEl.append(view);
  } catch (e) {
    console.error(e);
    mainEl.append(el('div', { class: 'empty' }, el('div', { class: 'big' }, '⚠️'), 'Failed to load: ' + e.message));
  }
}

function logout() {
  setToken('');
  currentUser = null;
  location.hash = '';
  boot();
}

// ============ Boot ============
async function boot() {
  if (!token()) {
    const { hasUsers } = await api('/auth/status');
    return authScreen(hasUsers ? 'login' : 'register', hasUsers);
  }
  try {
    const { user } = await api('/auth/me');
    currentUser = user;
  } catch {
    const { hasUsers } = await api('/auth/status');
    return authScreen(hasUsers ? 'login' : 'register', hasUsers);
  }
  shell();
  renderRoute();
}

boot();

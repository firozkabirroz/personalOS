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
import billing from './views/billing.js';
import support from './views/support.js';

const root = document.getElementById('root');
export let currentUser = null;

// Personal-life modules — meant for customers (and the owner, who also uses
// the app day-to-day). Staff-only roles (manager/support) don't see these.
const PERSONAL_ROLES = ['user', 'owner'];

const NAV = [
  { group: 'Overview', roles: PERSONAL_ROLES, items: [
    { route: 'dashboard', label: 'Dashboard', icon: 'dashboard', view: dashboard },
  ]},
  { group: 'Planner', roles: PERSONAL_ROLES, items: [
    { route: 'tasks', label: 'Daily Tasks', icon: 'tasks', view: tasks },
    { route: 'calendar', label: 'Calendar', icon: 'calendar', view: calendar },
  ]},
  { group: 'Projects', roles: PERSONAL_ROLES, items: [
    { route: 'running', label: 'Running Projects', icon: 'running', view: () => projects('running') },
    { route: 'upcoming', label: 'Upcoming Projects', icon: 'upcoming', view: () => projects('upcoming') },
    { route: 'plans', label: 'Next Plans', icon: 'plan', view: plans },
    { route: 'ideas', label: 'Brainstorming', icon: 'idea', view: ideas },
    { route: 'files', label: 'Project Files', icon: 'folder', view: files },
  ]},
  { group: 'Finance', roles: PERSONAL_ROLES, items: [
    { route: 'finance', label: 'Finance Overview', icon: 'finance', view: finance },
    { route: 'expenses', label: 'Income & Expenses', icon: 'expense', view: expenses },
    { route: 'debts', label: 'Debts & Loans', icon: 'debt', view: debts },
    { route: 'invest', label: 'Investments', icon: 'invest', view: invest },
  ]},
  { group: 'Life', roles: PERSONAL_ROLES, items: [
    { route: 'habits', label: 'Habit Tracker', icon: 'habit', view: habits },
    { route: 'health', label: 'Health Dashboard', icon: 'health', view: health },
    { route: 'travel', label: 'Travel Planner', icon: 'travel', view: travel },
  ]},
  { group: 'Intelligence', roles: PERSONAL_ROLES, items: [
    { route: 'ai', label: 'AI Assistant', icon: 'ai', view: ai },
  ]},
  { group: 'Support', items: [
    { route: 'support', label: 'Support', icon: 'ticket', view: support },
  ]},
  { group: 'System', items: [
    { route: 'billing', label: 'My Subscription', icon: 'card', roles: ['user'], view: billing },
    { route: 'settings', label: 'Settings', icon: 'settings', view: settings },
  ]},
];

const ROUTES = {};
for (const g of NAV) for (const item of g.items) ROUTES[item.route] = item;

function allowed(entry, role) {
  return !entry.roles || entry.roles.includes(role);
}

// Where each role lands after login / on an empty hash
// Staff (owner/manager/support) now do their day-to-day work at the standalone
// /admin panel — this shell only has Support + Settings left for them.
function defaultRoute(role) {
  if (role === 'support' || role === 'manager') return 'support';
  return 'dashboard';
}

// ============ Auth screens ============
function authScreen(mode, hasUsers, prefillError) {
  root.innerHTML = '';
  const isLogin = mode === 'login';
  const err = el('div', { class: 'auth-error', style: { display: prefillError ? 'block' : 'none' } }, prefillError || '');
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

  const googleBtn = el('a', { href: '/api/auth/google/start', class: 'btn ghost', style: { width: '100%', justifyContent: 'center', padding: '11px' } }, '🔵 Continue with Google');

  root.append(el('div', { class: 'auth-wrap' },
    el('div', { class: 'auth-card' },
      el('div', { class: 'auth-logo' }, el('div', { class: 'mark' }, 'P'), el('h1', {}, 'Personal OS')),
      el('p', { class: 'auth-sub' }, isLogin ? 'Welcome back. Sign in to your dashboard.' :
        (hasUsers ? 'Create a new account.' : 'Set up your account to get started.')),
      err,
      googleBtn,
      el('div', { class: 'auth-divider' }, 'or'),
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
  const role = currentUser.role;

  const sidebar = el('aside', { class: 'sidebar' },
    el('div', { class: 'side-logo' }, el('div', { class: 'mark' }, 'P'), el('span', {}, 'Personal OS')),
    NAV.filter(g => allowed(g, role))
      .map(g => ({ ...g, items: g.items.filter(item => allowed(item, role)) }))
      .filter(g => g.items.length)
      .map(g => el('div', { class: 'nav-group' },
        el('div', { class: 'nav-label' }, g.group),
        g.items.map(item => {
          const b = el('button', { class: 'nav-item', onclick: () => navigate(item.route) },
            icon(item.icon), el('span', {}, item.label));
          navButtons[item.route] = b;
          return b;
        }),
      )),
    ['owner', 'manager', 'support'].includes(role) ? el('div', { class: 'nav-group' },
      el('div', { class: 'nav-label' }, 'Staff'),
      el('a', { class: 'nav-item', href: '/admin', target: '_blank', rel: 'noopener' }, icon('shield'), el('span', {}, 'Admin Panel'))) : null,
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
  const fallback = defaultRoute(currentUser.role);
  const route = (location.hash.replace(/^#\//, '') || fallback).split('?')[0];
  const item = ROUTES[route] || ROUTES[fallback];
  const activeRoute = ROUTES[route] ? route : fallback;
  for (const [r, b] of Object.entries(shell.navButtons || {})) b.classList.toggle('active', r === activeRoute);
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

// ============ Lock screen (expired subscription) ============
async function lockScreen() {
  root.innerHTML = '';
  const view = await billing({ lockMode: true });
  const logoutBtn = el('button', { class: 'btn ghost', onclick: logout }, icon('logout'), 'Log out');
  root.append(el('div', { class: 'auth-wrap', style: { alignItems: 'flex-start', overflowY: 'auto', padding: '40px 20px' } },
    el('div', { style: { width: '100%', maxWidth: '720px' } },
      el('div', { class: 'auth-logo', style: { justifyContent: 'center', marginBottom: '20px' } },
        el('div', { class: 'mark' }, 'P'), el('h1', {}, 'Personal OS')),
      view,
      el('div', { style: { textAlign: 'center', marginTop: '20px' } }, logoutBtn))));
}

// ============ Boot ============
async function boot() {
  // Google login redirects back here with ?glogin=<token> or ?gerror=<message>
  const qs = new URLSearchParams(location.search);
  const glogin = qs.get('glogin');
  const gerror = qs.get('gerror');
  if (glogin || gerror) {
    qs.delete('glogin'); qs.delete('gerror');
    const rest = qs.toString();
    history.replaceState({}, '', location.pathname + (rest ? '?' + rest : ''));
    if (glogin) setToken(glogin);
  }

  if (!token()) {
    const { hasUsers } = await api('/auth/status');
    // landing page "Start free trial" links here with ?signup=1 to skip straight to registration
    const forceSignup = new URLSearchParams(location.search).get('signup') === '1';
    return authScreen(forceSignup || !hasUsers ? 'register' : 'login', hasUsers, gerror || null);
  }
  try {
    const { user } = await api('/auth/me');
    currentUser = user;
  } catch {
    const { hasUsers } = await api('/auth/status');
    return authScreen(hasUsers ? 'login' : 'register', hasUsers);
  }
  if (currentUser.expired) return lockScreen();
  shell();
  renderRoute();
}

boot();

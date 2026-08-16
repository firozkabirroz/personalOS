import { api, post, setToken, token } from './api.js';
import { el, icon, icons, toast, skeletonPage } from './ui.js';

const lazy = (load, ...args) => async () => (await load()).default(...args);

const root = document.getElementById('root');
export let currentUser = null;

// Personal-life modules — meant for customers (and the owner, who also uses
// the app day-to-day). Staff-only roles (manager/support) don't see these.
const PERSONAL_ROLES = ['user', 'owner'];

const NAV = [
  { group: 'Overview', roles: PERSONAL_ROLES, items: [
    { route: 'dashboard', label: 'Dashboard', icon: 'dashboard', view: lazy(() => import('./views/dashboard.js')) },
  ]},
  { group: 'Planner', roles: PERSONAL_ROLES, items: [
    { route: 'tasks', label: 'Daily Tasks', icon: 'tasks', view: lazy(() => import('./views/tasks.js')) },
    { route: 'calendar', label: 'Calendar', icon: 'calendar', view: lazy(() => import('./views/calendar.js')) },
  ]},
  { group: 'Projects', roles: PERSONAL_ROLES, items: [
    { route: 'running', label: 'Running Projects', icon: 'running', view: lazy(() => import('./views/projects.js'), 'running') },
    { route: 'upcoming', label: 'Upcoming Projects', icon: 'upcoming', view: lazy(() => import('./views/projects.js'), 'upcoming') },
    { route: 'plans', label: 'Next Plans', icon: 'plan', view: lazy(() => import('./views/plans.js')) },
    { route: 'ideas', label: 'Brainstorming', icon: 'idea', view: lazy(() => import('./views/ideas.js')) },
    { route: 'files', label: 'Project Files', icon: 'folder', view: lazy(() => import('./views/files.js')) },
  ]},
  { group: 'Finance', roles: PERSONAL_ROLES, items: [
    { route: 'finance', label: 'Finance Overview', icon: 'finance', view: lazy(() => import('./views/finance.js')) },
    { route: 'expenses', label: 'Income & Expenses', icon: 'expense', view: lazy(() => import('./views/expenses.js')) },
    { route: 'debts', label: 'Debts & Loans', icon: 'debt', view: lazy(() => import('./views/debts.js')) },
    { route: 'invest', label: 'Investments', icon: 'invest', view: lazy(() => import('./views/invest.js')) },
  ]},
  { group: 'Life', roles: PERSONAL_ROLES, items: [
    { route: 'habits', label: 'Habit Tracker', icon: 'habit', view: lazy(() => import('./views/habits.js')) },
    { route: 'health', label: 'Health Dashboard', icon: 'health', view: lazy(() => import('./views/health.js')) },
    { route: 'travel', label: 'Travel Planner', icon: 'travel', view: lazy(() => import('./views/travel.js')) },
  ]},
  { group: 'Intelligence', roles: PERSONAL_ROLES, items: [
    { route: 'ai', label: 'AI Assistant', icon: 'ai', view: lazy(() => import('./views/ai.js')) },
  ]},
  { group: 'Support', items: [
    { route: 'support', label: 'Support', icon: 'ticket', view: lazy(() => import('./views/support.js')) },
  ]},
  { group: 'System', items: [
    { route: 'settings', label: 'Settings', icon: 'settings', view: lazy(() => import('./views/settings.js')) },
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
        (hasUsers ? 'Create a free account — no subscription needed.' : 'Set up your account to get started.')),
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
      el('div', { class: 'auth-switch' }, el('a', { href: '/' }, '← Back to home')),
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

let routeToken = 0;
async function renderRoute() {
  const fallback = defaultRoute(currentUser.role);
  const route = (location.hash.replace(/^#\//, '') || fallback).split('?')[0];
  const item = ROUTES[route] || ROUTES[fallback];
  const activeRoute = ROUTES[route] ? route : fallback;
  for (const [r, b] of Object.entries(shell.navButtons || {})) b.classList.toggle('active', r === activeRoute);
  const myToken = ++routeToken;
  mainEl.innerHTML = '';
  mainEl.scrollTop = 0;
  mainEl.append(skeletonPage());
  try {
    const view = await item.view();
    if (myToken !== routeToken) return; // user navigated away while loading
    view.classList.add('view-enter');
    mainEl.innerHTML = '';
    mainEl.append(view);
  } catch (e) {
    if (myToken !== routeToken) return;
    console.error(e);
    mainEl.innerHTML = '';
    mainEl.append(el('div', { class: 'empty' }, el('div', { class: 'big' }, '⚠️'), 'Failed to load: ' + e.message));
  }
}

function logout() {
  setToken('');
  currentUser = null;
  location.hash = '';
  location.href = '/';
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
  shell();
  renderRoute();
}

boot();

import { get, post, setToken, token } from '/js/api.js';
import { el, icon, icons, toast, skeletonPage } from '/js/ui.js';

import overview from './views/overview.js';
import users from './views/users.js';
import aiModels from './views/ai.js';
import integrations from './views/integrations.js';
import activity from './views/activity.js';
import support from './views/support.js';
import team from './views/team.js';

const root = document.getElementById('root');
export let currentUser = null;

const NAV = [
  { group: 'Overview', roles: ['owner', 'manager'], items: [
    { route: 'overview', label: 'Overview', icon: 'dashboard', view: overview },
  ]},
  { group: 'Users', roles: ['owner', 'manager'], items: [
    { route: 'users', label: 'Users', icon: 'team', view: users },
  ]},
  { group: 'Platform', roles: ['owner', 'manager'], items: [
    { route: 'ai', label: 'AI Models', icon: 'ai', view: aiModels },
    { route: 'integrations', label: 'Integrations', icon: 'link', view: integrations },
    { route: 'activity', label: 'Activity', icon: 'running', view: activity },
  ]},
  { group: 'Support', items: [
    { route: 'support', label: 'Support', icon: 'ticket', view: support },
  ]},
  { group: 'Team', roles: ['owner'], items: [
    { route: 'team', label: 'Team', icon: 'shield', view: team },
  ]},
];

const ROUTES = {};
for (const g of NAV) for (const item of g.items) ROUTES[item.route] = { ...item, roles: g.roles };

function allowed(entry, role) {
  return !entry.roles || entry.roles.includes(role);
}

function defaultRoute(role) {
  return role === 'support' ? 'support' : 'overview';
}

// ============ Login ============
function loginScreen(errorMsg) {
  root.innerHTML = '';
  const err = el('div', { class: 'auth-error', style: { display: errorMsg ? 'block' : 'none' } }, errorMsg || '');
  const username = el('input', { type: 'text', placeholder: 'Staff username', autocomplete: 'username' });
  const password = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' });

  const submit = async () => {
    err.style.display = 'none';
    btn.disabled = true;
    try {
      const data = await post('/auth/login', { username: username.value, password: password.value });
      setToken(data.token);
      boot();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = 'block';
      btn.disabled = false;
    }
  };
  const btn = el('button', { class: 'btn', style: { width: '100%', justifyContent: 'center', padding: '11px' }, onclick: submit }, 'Sign in');
  [username, password].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));

  root.append(el('div', { class: 'auth-wrap' },
    el('div', { class: 'auth-card' },
      el('div', { class: 'auth-logo' }, el('div', { class: 'mark' }, 'A'), el('h1', {}, 'Admin Panel')),
      el('p', { class: 'auth-sub' }, 'Staff sign-in — owner, manager or support.'),
      err,
      el('div', { class: 'field' }, el('label', {}, 'Username'), username),
      el('div', { class: 'field' }, el('label', {}, 'Password'), password),
      btn,
    ),
  ));
  setTimeout(() => username.focus(), 50);
}

function accessDenied() {
  root.innerHTML = '';
  root.append(el('div', { class: 'access-denied' },
    el('div', {},
      el('div', { class: 'big' }, '🚫'),
      el('h2', {}, 'No admin access'),
      el('p', { class: 'muted', style: { margin: '8px 0 20px' } }, `This account (${currentUser?.username || ''}) doesn't have staff access to the admin panel.`),
      el('button', { class: 'btn ghost', onclick: logout }, 'Log out'))));
}

// ============ Shell ============
let mainEl = null;
let sidebarEl = null;
let backdropEl = null;

function openDrawer() { sidebarEl.classList.add('open'); backdropEl.classList.add('open'); }
function closeDrawer() { sidebarEl.classList.remove('open'); backdropEl.classList.remove('open'); }

function shell() {
  root.innerHTML = '';
  const navButtons = {};
  const role = currentUser.role;

  sidebarEl = el('aside', { class: 'sidebar' },
    el('div', { class: 'side-logo' }, el('div', { class: 'mark' }, 'A'), el('span', {}, 'Admin Panel')),
    NAV.filter(g => allowed(g, role))
      .map(g => el('div', { class: 'nav-group' },
        el('div', { class: 'nav-label' }, g.group),
        g.items.map(item => {
          const b = el('button', { class: 'nav-item', onclick: () => { navigate(item.route); closeDrawer(); } },
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

  backdropEl = el('div', { class: 'admin-drawer-backdrop', onclick: closeDrawer });

  const hamburger = el('button', { class: 'hamburger-btn', onclick: openDrawer });
  hamburger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  const topbar = el('div', { class: 'admin-topbar' }, hamburger, el('div', { class: 'title' }, 'Admin Panel'));

  mainEl = el('main', { class: 'main' });
  root.append(el('div', { class: 'admin-shell' }, topbar, backdropEl, sidebarEl, mainEl));

  window.addEventListener('hashchange', renderRoute);
  shell.navButtons = navButtons;
}

export function navigate(route) {
  location.hash = '#/' + route;
}

let routeToken = 0;
async function renderRoute() {
  closeDrawer();
  const role = currentUser.role;
  const fallback = defaultRoute(role);
  const requested = (location.hash.replace(/^#\//, '') || fallback).split('?')[0];
  const candidate = ROUTES[requested] && allowed(ROUTES[requested], role) ? requested : fallback;
  const item = ROUTES[candidate] && allowed(ROUTES[candidate], role) ? ROUTES[candidate] : ROUTES['support'];
  for (const [r, b] of Object.entries(shell.navButtons || {})) b.classList.toggle('active', r === (ROUTES[candidate] ? candidate : 'support'));
  const myToken = ++routeToken;
  mainEl.innerHTML = '';
  mainEl.scrollTop = 0;
  mainEl.append(skeletonPage());
  try {
    const view = await item.view();
    if (myToken !== routeToken) return;
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
  boot();
}

// ============ Boot ============
async function boot() {
  if (!token()) return loginScreen();
  try {
    const { user } = await get('/auth/me');
    currentUser = user;
  } catch {
    setToken('');
    return loginScreen();
  }
  if (!['owner', 'manager', 'support'].includes(currentUser.role)) return accessDenied();
  shell();
  renderRoute();
}

boot();

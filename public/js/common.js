// ── VIPER BOT MD — Shared JS ─────────────────────────────────────────────────
window.viperUser = null;

// ── API helper ────────────────────────────────────────────────────────────────
async function api(url, opts={}) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type='success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
}

// ── Auth check ────────────────────────────────────────────────────────────────
// FIX: Only redirect on explicit 401/403. Network errors / slow DB on Render
// must NOT redirect — that caused the blink/refresh loop.
async function requireLogin(adminRequired=false) {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });

    // Explicit auth failure → go to login
    if (r.status === 401 || r.status === 403) {
      window.location.href = '/login.html';
      return null;
    }

    // Server error or network hiccup → fail silently, don't redirect
    if (!r.ok) return null;

    const d = await r.json().catch(() => null);
    if (!d || !d.user) return null;

    window.viperUser = d.user;

    if (adminRequired && !d.user.is_admin) {
      window.location.href = '/dashboard.html';
      return null;
    }

    renderNav(d.user);
    return d.user;

  } catch {
    // Pure network error (Render cold start, DB slow) — don't redirect
    return null;
  }
}

// ── Render sidebar nav ────────────────────────────────────────────────────────
function renderNav(user) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  const current = window.location.pathname;
  const links = [
    { href: '/dashboard.html', icon: '⊞', label: 'Dashboard' },
    { href: '/sessions.html',  icon: '📱', label: 'My Sessions' },
    { href: '/wallet.html',    icon: '🪙', label: 'Wallet' },
    { href: '/settings.html',  icon: '⚙️', label: 'Settings' },
    ...(user.is_admin ? [{ href: '/admin.html', icon: '👑', label: 'Admin Panel' }] : []),
  ];
  nav.innerHTML = links.map(l => `
    <a href="${l.href}" class="nav-link ${current.includes(l.href.replace('.html',''))||current===l.href?'active':''}">
      <span class="nav-icon">${l.icon}</span>
      <span class="nav-label">${l.label}</span>
    </a>
  `).join('');

  const ui = document.getElementById('nav-user');
  if (ui) ui.innerHTML = `
    <div class="nav-user-name">@${user.username}</div>
    <div class="nav-user-coins">🪙 ${user.coins} coins</div>
  `;
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-NG', { dateStyle:'medium', timeStyle:'short' });
}
function fCoins(n) { return Number(n).toLocaleString(); }
function fNgn(kobo) { return '₦' + (kobo/100).toLocaleString('en-NG', { minimumFractionDigits:0 }); }

function statusBadge(status, isRunning) {
  const map = {
    connected:  ['🟢','badge-green'],
    connecting: ['🟡','badge-yellow'],
    pairing:    ['🟡','badge-yellow'],
    stopped:    ['🔴','badge-red'],
    logged_out: ['⛔','badge-red'],
    pending:    ['⏳','badge-gray'],
  };
  const [icon, cls] = map[status] || ['❓','badge-gray'];
  const label = isRunning ? (status==='connected'?'Connected':'Running') : (status||'Unknown');
  return `<span class="badge ${cls}">${icon} ${label.charAt(0).toUpperCase()+label.slice(1)}</span>`;
}

// ── Sidebar toggle (mobile) ───────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

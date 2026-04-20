// ── VIPER MD BOT — Shared JS ──────────────────────────────────────────────────
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
  document.querySelectorAll('.v-toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'v-toast v-toast-' + type;
  el.innerHTML = `<span>${msg}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
}

// ── Custom confirm modal ───────────────────────────────────────────────────────
function vConfirm(msg, title='Are you sure?') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'v-confirm-overlay';
    overlay.innerHTML = `
      <div class="v-confirm">
        <div class="v-confirm-title">${title}</div>
        <div class="v-confirm-msg">${msg}</div>
        <div class="v-confirm-btns">
          <button class="vbtn vbtn-outline" id="vc-no">Cancel</button>
          <button class="vbtn vbtn-red" id="vc-yes">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    const close = (val) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      resolve(val);
    };
    overlay.querySelector('#vc-yes').onclick = () => close(true);
    overlay.querySelector('#vc-no').onclick  = () => close(false);
    overlay.onclick = e => { if (e.target === overlay) close(false); };
  });
}

// ── Auth check ────────────────────────────────────────────────────────────────
// Only stay on page if we get a confirmed 200 + valid user.
// Any other result (401, 403, 500, network error) → redirect to login.
async function requireLogin(adminRequired=false) {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (r.status !== 200) {
      window.location.href = '/login.html';
      return null;
    }
    const d = await r.json().catch(() => null);
    if (!d || !d.user) {
      window.location.href = '/login.html';
      return null;
    }
    window.viperUser = d.user;
    if (adminRequired && !d.user.is_admin) {
      window.location.href = '/dashboard.html';
      return null;
    }
    renderNav(d.user);
    return d.user;
  } catch {
    window.location.href = '/login.html';
    return null;
  }
}

// ── Render sidebar nav ────────────────────────────────────────────────────────
function renderNav(user) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  const current = window.location.pathname;
  const links = [
    { href:'/dashboard.html', label:'Dashboard',   icon:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>' },
    { href:'/sessions.html',  label:'My Sessions', icon:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="2" width="10" height="16" rx="2"/><path d="M8 6h4M8 10h4M8 14h2"/></svg>' },
    { href:'/wallet.html',    label:'Wallet',      icon:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 7h16v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7z"/><path d="M2 7l2-4h12l2 4"/><circle cx="13.5" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>' },
    { href:'/settings.html',  label:'Settings',    icon:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>' },
    ...(user.is_admin ? [{ href:'/admin.html', label:'Admin Panel', icon:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 2l2.5 5 5.5.8-4 3.9.9 5.5L10 14.5l-4.9 2.7.9-5.5-4-3.9 5.5-.8z"/></svg>' }] : []),
  ];

  // Cache for dropdown reuse on mobile
  window._viperNavLinks = links;
  nav.innerHTML = links.map(l => {
    const active = current === l.href || current.includes(l.href.replace('.html',''));
    return `<a href="${l.href}" class="nav-link${active?' active':''}">
      <span class="nav-icon">${l.icon}</span>
      <span class="nav-label">${l.label}</span>
    </a>`;
  }).join('');

  const ui = document.getElementById('nav-user');
  if (ui) {
    const initial = (user.username||'?')[0].toUpperCase();
    ui.innerHTML = `
      <div class="nav-user-avatar">${initial}</div>
      <div class="nav-user-info">
        <div class="nav-user-name">@${user.username}</div>
        <div class="nav-user-coins">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="5"/><path d="M6 3v6M4 5h3a1 1 0 010 2H4"/></svg>
          ${Number(user.coins).toLocaleString()} coins
        </div>
      </div>`;
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
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
    connected:  ['badge-green','Connected'],
    connecting: ['badge-yellow','Connecting'],
    pairing:    ['badge-yellow','Pairing'],
    stopped:    ['badge-red','Stopped'],
    logged_out: ['badge-red','Logged Out'],
    pending:    ['badge-gray','Pending'],
  };
  const [cls, label] = map[status] || ['badge-gray','Unknown'];
  const dotColor = cls==='badge-green'?'#16a34a':cls==='badge-yellow'?'#f59e0b':cls==='badge-red'?'#ef4444':'#94a3b8';
  return `<span class="badge ${cls}"><svg viewBox="0 0 8 8" width="8" height="8"><circle cx="4" cy="4" r="3" fill="${dotColor}"/></svg>${label}</span>`;
}

// ── Sidebar toggle → dropdown nav (mobile) ───────────────────────────────────
// On desktop the persistent sidebar is visible. On mobile (≤768px) the sidebar
// is hidden and the hamburger opens a compact dropdown panel below the topbar.

function _buildDropdown(user, links, currentPath) {
  // Remove any existing dropdown + backdrop
  document.getElementById('viper-nav-dropdown')?.remove();
  document.getElementById('viper-nav-backdrop')?.remove();

  const initial = (user?.username || '?')[0].toUpperCase();
  const coins   = Number(user?.coins || 0).toLocaleString();

  const linksHtml = links.map(l => {
    const active = currentPath === l.href || currentPath.includes(l.href.replace('.html',''));
    return `<a href="${l.href}" class="nav-link${active?' active':''}" onclick="_closeDropdown()">
      <span class="nav-icon">${l.icon}</span>
      <span class="nav-label">${l.label}</span>
    </a>`;
  }).join('');

  const backdrop = document.createElement('div');
  backdrop.id = 'viper-nav-backdrop';
  backdrop.className = 'nav-dropdown-backdrop';
  backdrop.onclick = _closeDropdown;

  const panel = document.createElement('div');
  panel.id = 'viper-nav-dropdown';
  panel.className = 'nav-dropdown';
  panel.innerHTML = `
    <div class="nav-dropdown-links">${linksHtml}</div>
    <div class="nav-dropdown-divider"></div>
    <div class="nav-dropdown-user">
      <div class="nav-user-avatar">${initial}</div>
      <div class="nav-user-info">
        <div class="nav-user-name">@${user?.username || ''}</div>
        <div class="nav-user-coins">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" style="width:10px;height:10px"><circle cx="6" cy="6" r="5"/><path d="M6 3v6M4 5h3a1 1 0 010 2H4"/></svg>
          ${coins} coins
        </div>
      </div>
    </div>
    <div class="nav-dropdown-footer">
      <button class="nav-logout" onclick="logout()">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M13 5l4 5-4 5M17 10H8"/><path d="M8 3H4a1 1 0 00-1 1v12a1 1 0 001 1h4"/></svg>
        Sign Out
      </button>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  // Animate open
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    panel.classList.add('open');
  });
}

function _closeDropdown() {
  const panel    = document.getElementById('viper-nav-dropdown');
  const backdrop = document.getElementById('viper-nav-backdrop');
  if (panel) {
    panel.style.animation = 'none';
    panel.style.opacity   = '0';
    panel.style.transform = 'translateY(-6px)';
    panel.style.transition = 'opacity .15s, transform .15s';
  }
  if (backdrop) {
    backdrop.style.opacity   = '0';
    backdrop.style.transition = 'opacity .15s';
  }
  setTimeout(() => { panel?.remove(); backdrop?.remove(); }, 160);
}

// Public toggle — called by hamburger onclick="toggleSidebar()"
function toggleSidebar() {
  if (window.innerWidth > 768) {
    // Desktop: nothing to do (sidebar is always visible)
    return;
  }
  const existing = document.getElementById('viper-nav-dropdown');
  if (existing) {
    _closeDropdown();
    return;
  }
  // Build dropdown from nav data stored during buildNav()
  const links = window._viperNavLinks || [];
  _buildDropdown(window.viperUser, links, window.location.pathname);
}

// Close on resize back to desktop
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) _closeDropdown();
});

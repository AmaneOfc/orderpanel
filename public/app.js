/* ═══════════════════════════════════════════════
   AMANE PANEL — Shared App Module (app.js)
   Supabase client, auth helpers, toast, utils
═══════════════════════════════════════════════ */

// ── SUPABASE CONFIG ─────────────────────────────
// Replace these with your actual Supabase project URL and anon key
const SUPABASE_URL  = window.SUPABASE_URL  || 'https://uwnoljqkcdhmveyspnwr.supabase.co';
const SUPABASE_ANON = window.SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3bm9sanFrY2RobXZleXNwbndyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDI5MDIsImV4cCI6MjA5MjcxODkwMn0.ZCapjZGM46VBSxFQ2p0O4cpipz-4W6HP2fIOe1x2Qkw';

// Initialize Supabase client (loaded via CDN in HTML)
let supabase;
function initSupabase() {
  if (window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    window._supabase = supabase;
  } else {
    console.warn('[Amane] Supabase SDK not loaded yet');
  }
  return supabase;
}

// ── CURRENT SESSION ─────────────────────────────
let _session = null;
let _profile  = null;

async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  _session = data?.session || null;
  return _session;
}

async function getProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  _profile = data;
  return data;
}

async function requireAuth(redirectTo = '/index.html') {
  await initSupabase();
  const session = await getSession();
  if (!session) {
    window.location.href = redirectTo + '?auth=required';
    return null;
  }
  const profile = await getProfile(session.user.id);
  return { session, profile };
}

async function requireAdmin(redirectTo = '/index.html') {
  const auth = await requireAuth();
  if (!auth) return null;
  if (!auth.profile?.is_admin) {
    toast('Access denied — admin only', 'error');
    setTimeout(() => (window.location.href = redirectTo), 1500);
    return null;
  }
  return auth;
}

// ── SIGN OUT ────────────────────────────────────
async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  localStorage.removeItem('amane_user');
  window.location.href = '/index.html';
}

// ── GOOGLE SIGN IN ───────────────────────────────
async function signInWithGoogle() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/dashboard.html' }
  });
  if (error) toast(error.message, 'error');
}

// ── TOAST ────────────────────────────────────────
function toast(msg, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || '•'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── COPY TO CLIPBOARD ────────────────────────────
async function copyToClipboard(text, label = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, 'success', 2000);
  } catch {
    toast('Failed to copy', 'error', 2000);
  }
}

// ── FORMAT HELPERS ────────────────────────────────
const formatRp  = n => 'Rp ' + Number(n).toLocaleString('id-ID');
const formatMB  = mb => mb === 0 ? 'Unlimited' : mb >= 1024 ? (mb / 1024) + ' GB' : mb + ' MB';
const formatCPU = c  => c === 0 ? 'Unlimited' : c + '%';
const formatDate = d  => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const timeAgo = ts => {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
};

// ── STATUS BADGE ─────────────────────────────────
function statusBadge(status) {
  const map = {
    active:   'badge-active',
    pending:  'badge-pending',
    success:  'badge-success',
    suspended:'badge-suspended',
    expired:  'badge-expired',
    canceled: 'badge-canceled',
    deleted:  'badge-canceled',
  };
  const cls = map[status] || 'badge-info';
  return `<span class="badge badge-dot ${cls}">${status}</span>`;
}

// ── NAVBAR INJECTION ──────────────────────────────
async function renderNavbar(activePage = '') {
  const session = await getSession();
  const user = session?.user;
  const profile = user ? await getProfile(user.id) : null;

  const nav = document.getElementById('navbar');
  if (!nav) return;

  const avatarSrc = profile?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(profile?.full_name || 'U') + '&background=0c0c14&color=00e5ff&size=64';

  nav.innerHTML = `
    <a class="navbar-brand" href="/index.html">
      <div class="brand-icon">⚡</div>
      <span>Amane<span class="text-accent">Panel</span></span>
    </a>
    <nav class="navbar-nav">
      <a class="nav-link ${activePage==='store'?'active':''}" href="/index.html"><span>🛍</span><span>Store</span></a>
      ${user ? `
        <a class="nav-link ${activePage==='dashboard'?'active':''}" href="/dashboard.html"><span>📊</span><span>Dashboard</span></a>
        <a class="nav-link ${activePage==='garansi'?'active':''}" href="/garansi.html"><span>🛡</span><span>Garansi</span></a>
      ` : ''}
      ${profile?.is_admin ? `<a class="nav-link ${activePage==='admin'?'active':''}" href="/admin.html"><span>⚙️</span><span>Admin</span></a>` : ''}
    </nav>
    ${user
      ? `<div class="nav-avatar" onclick="window.location='/profile.html'" title="${profile?.full_name || user.email}">
           <img src="${avatarSrc}" alt="avatar" onerror="this.src='https://ui-avatars.com/api/?background=0c0c14&color=00e5ff'">
         </div>`
      : `<a class="btn btn-primary btn-sm" href="/index.html#auth">Sign In</a>`
    }
  `;
}

// ── SIDEBAR INJECTION ─────────────────────────────
function renderSidebar(activeItem = '') {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  const items = [
    { href: '/dashboard.html', icon: '📊', label: 'Overview', key: 'overview' },
    { href: '/dashboard.html#panels', icon: '🖥', label: 'My Panels', key: 'panels' },
    { href: '/dashboard.html#history', icon: '🕐', label: 'History', key: 'history' },
    { href: '/garansi.html', icon: '🛡', label: 'Garansi', key: 'garansi' },
    { href: '/profile.html', icon: '👤', label: 'Profile', key: 'profile' },
    { href: '/index.html', icon: '🛍', label: 'Store', key: 'store' },
    { href: '#', icon: '🚪', label: 'Sign Out', key: 'signout', onclick: 'signOut()' },
  ];
  sb.innerHTML = `
    <div class="sidebar-section">
      <div class="sidebar-label">Navigation</div>
      ${items.map(i => `
        <a class="sidebar-link ${activeItem===i.key?'active':''}"
           href="${i.href}"
           ${i.onclick ? `onclick="${i.onclick}; return false;"` : ''}>
          <span>${i.icon}</span>
          <span>${i.label}</span>
        </a>
      `).join('')}
    </div>
  `;
}

// ── TAB SWITCHING ─────────────────────────────────
function initTabs(containerSel = '.tabs') {
  document.querySelectorAll(containerSel + ' .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      const container = btn.closest('.tabs').parentElement;
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = container.querySelector('#' + target);
      if (pane) pane.classList.add('active');
    });
  });
}

// ── QR PAYMENT POLLER ─────────────────────────────
let _pollInterval = null;
function startPaymentPolling(transactionId, amount, onSuccess, onCancel) {
  clearInterval(_pollInterval);
  let attempts = 0;
  const maxAttempts = 60; // 10 minutes at 10s intervals
  _pollInterval = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(_pollInterval);
      if (onCancel) onCancel('timeout');
      return;
    }
    try {
      const res = await fetch('/api/transaction/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId })
      });
      const data = await res.json();
      if (data.status === 'success') {
        clearInterval(_pollInterval);
        if (onSuccess) onSuccess(data);
      } else if (data.status === 'canceled') {
        clearInterval(_pollInterval);
        if (onCancel) onCancel('canceled');
      }
    } catch {}
  }, 10000);
}
function stopPaymentPolling() { clearInterval(_pollInterval); }

// ── PANEL EXPIRY DISPLAY ──────────────────────────
function expiryStatus(expiredDate) {
  const now = new Date();
  const exp = new Date(expiredDate);
  const days = Math.ceil((exp - now) / 86400000);
  if (days < 0)  return { label: 'Expired', badge: 'badge-expired', days };
  if (days <= 3) return { label: days + 'd left', badge: 'badge-pending', days };
  return { label: days + 'd left', badge: 'badge-active', days };
}

// ── ON DOM READY ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  // Auto-close mobile sidebar on link click
  document.querySelectorAll('.sidebar-link').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.remove('open');
    });
  });
});

// Expose globals
window.signOut          = signOut;
window.signInWithGoogle = signInWithGoogle;
window.toast            = toast;
window.copyToClipboard  = copyToClipboard;
window.formatRp         = formatRp;
window.formatMB         = formatMB;
window.formatCPU        = formatCPU;
window.formatDate       = formatDate;
window.statusBadge      = statusBadge;
window.renderNavbar     = renderNavbar;
window.renderSidebar    = renderSidebar;
window.initTabs         = initTabs;
window.startPaymentPolling = startPaymentPolling;
window.stopPaymentPolling  = stopPaymentPolling;
window.expiryStatus     = expiryStatus;
window.requireAuth      = requireAuth;
window.requireAdmin     = requireAdmin;
window.getSession       = getSession;
window.getProfile       = getProfile;
window.timeAgo          = timeAgo;

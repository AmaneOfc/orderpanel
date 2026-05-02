// ═══════════════════════════════════════════════
//   AMANE PANEL — Vercel Serverless API Router
//   /api/index.js  (catch-all handler)
// ═══════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const crypto = require('crypto');

// ── ENV ──────────────────────────────────────────
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  PTERO_DOMAIN,
  PTERO_API_KEY,
  PTERO_EGG_ID       = '15',
  PTERO_LOCATION_ID   = '1',
  PTERO_NEST_ID       = '1',
  PANEL_DURATION_DAYS = '30',
  TRIPAY_API_KEY,
  TRIPAY_PRIVATE_KEY,
  TRIPAY_MERCHANT_CODE,
  TRIPAY_SANDBOX      = 'false',
  ADMIN_PIN           = '12345',
  BOT_TOKEN,
  OWNER_ID,
} = process.env;

// ── SUPABASE ─────────────────────────────────────
function supa() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ── PTERO HELPERS ─────────────────────────────────
function pteroApi(path, method = 'GET', body = null, domain = null) {
  const base = (domain || PTERO_DOMAIN).replace(/\/$/, '');
  const cfg  = {
    method,
    url: `${base}/api/application/${path}`,
    headers: {
      'Authorization': `Bearer ${PTERO_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  };
  if (body) cfg.data = body;
  return axios(cfg);
}

async function createPteroUser(username, email, firstName, password) {
  const res = await pteroApi('users', 'POST', {
    username, email, first_name: firstName, last_name: 'Panel',
    password, root_admin: false,
  });
  return res.data.attributes;
}

async function createPteroServer(userId, username, ram, disk, cpu, eggId = PTERO_EGG_ID) {
  const eggRes = await pteroApi(`nests/${PTERO_NEST_ID}/eggs/${eggId}?include=variables`);
  const egg    = eggRes.data.attributes;
  const envVars = {};
  (egg.relationships?.variables?.data || []).forEach(v => {
    envVars[v.attributes.env_variable] = v.attributes.default_value || '';
  });

  const res = await pteroApi('servers', 'POST', {
    name:         username + '-server',
    user:         userId,
    egg:          parseInt(eggId),
    docker_image: egg.docker_image,
    startup:      egg.startup,
    environment:  envVars,
    limits: {
      memory: parseInt(ram) || 512,
      swap:   0,
      disk:   parseInt(disk) || 1024,
      io:     500,
      cpu:    parseInt(cpu) || 100,
    },
    feature_limits: { databases: 1, allocations: 1, backups: 1 },
    allocation:     { default: await getDefaultAllocation() },
  });
  return res.data.attributes;
}

async function getDefaultAllocation() {
  const res = await pteroApi(`locations/${PTERO_LOCATION_ID}/allocations`);
  const alloc = (res.data?.data || []).find(a => !a.attributes.assigned);
  return alloc?.attributes?.id || 1;
}

async function suspendPteroServer(serverId) {
  await pteroApi(`servers/${serverId}/suspend`, 'POST');
}
async function unsuspendPteroServer(serverId) {
  await pteroApi(`servers/${serverId}/unsuspend`, 'POST');
}
async function deletePteroServer(serverId) {
  await pteroApi(`servers/${serverId}/force`, 'DELETE');
}
async function deletePteroUser(userId) {
  await pteroApi(`users/${userId}`, 'DELETE');
}
async function resetPteroPassword(userId, newPassword) {
  await pteroApi(`users/${userId}`, 'PATCH', { password: newPassword });
}

// ── TRIPAY HELPERS ────────────────────────────────
function generateTripaySignature(merchantCode, merchantRef, amount) {
  return crypto
    .createHmac('sha256', TRIPAY_PRIVATE_KEY)
    .update(merchantCode + merchantRef + amount)
    .digest('hex');
}

async function createTripayTransaction({ merchantRef, amount, customerName, customerEmail, customerPhone, item }) {
  const sandbox  = TRIPAY_SANDBOX === 'true';
  const baseUrl  = sandbox
    ? 'https://tripay.co.id/api-sandbox'
    : 'https://tripay.co.id/api';
  const signature = generateTripaySignature(TRIPAY_MERCHANT_CODE, merchantRef, amount);

  const res = await axios.post(`${baseUrl}/transaction/create`, {
    method:         'QRIS',
    merchant_ref:   merchantRef,
    amount:         Math.ceil(amount),
    customer_name:  customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    order_items: [{
      name:     item,
      price:    Math.ceil(amount),
      quantity: 1,
    }],
    signature,
    expired_time: Math.floor(Date.now() / 1000) + 600, // 10 min
  }, {
    headers: {
      'Authorization': `Bearer ${TRIPAY_API_KEY}`,
      'Content-Type':  'application/json',
    },
  });
  return res.data.data;
}

async function checkTripayTransaction(reference) {
  const sandbox = TRIPAY_SANDBOX === 'true';
  const baseUrl = sandbox
    ? 'https://tripay.co.id/api-sandbox'
    : 'https://tripay.co.id/api';
  const res = await axios.get(`${baseUrl}/transaction/detail`, {
    params: { reference },
    headers: { 'Authorization': `Bearer ${TRIPAY_API_KEY}` },
  });
  return res.data.data;
}

// ── MISC HELPERS ──────────────────────────────────
function generatePassword(len = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function addDays(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + parseInt(days));
  return d.toISOString().split('T')[0];
}

function generateTransactionId(prefix = 'ORD') {
  return `${prefix}${Date.now()}`;
}

async function notifyTelegram(msg) {
  if (!BOT_TOKEN || !OWNER_ID) return;
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: OWNER_ID, text: msg, parse_mode: 'HTML',
  }).catch(() => {});
}

function verifyAdmin(req) {
  return (
    req.headers['x-admin-pin'] === '1' || // frontend stores '1' after verify
    req.headers['x-admin-pin'] === ADMIN_PIN
  );
}

// ── CORS HEADERS ─────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pin');
}

// ══════════════════════════════════════════════════
//   MAIN HANDLER — routes by req.url
// ══════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url  = req.url.split('?')[0];
  const body = req.body || {};

  try {
    // ── PRODUCTS ───────────────────────────────────
    if (url === '/api/products' && req.method === 'GET') {
      const { data } = await supa().from('products').select('*').order('price');
      return res.json(data || []);
    }

    // ── CHECK USERNAME ──────────────────────────────
    if (url === '/api/check-username' && req.method === 'POST') {
      const { username } = body;
      if (!username) return res.json({ available: false });
      const { data } = await supa().from('panels')
        .select('id').eq('username', username).maybeSingle();
      return res.json({ available: !data });
    }

    // ── MY PANELS ──────────────────────────────────
    if (url.startsWith('/api/my-panels/') && req.method === 'GET') {
      const phone = decodeURIComponent(url.split('/api/my-panels/')[1]);
      const { data } = await supa().from('panels')
        .select('*').eq('phone', phone)
        .neq('status', 'deleted').order('created_at', { ascending: false });
      return res.json(data || []);
    }

    // ── HISTORY ────────────────────────────────────
    if (url.startsWith('/api/history/') && req.method === 'GET') {
      const phone = decodeURIComponent(url.split('/api/history/')[1]);
      const { data } = await supa().from('transactions')
        .select('*').eq('phone', phone)
        .order('time', { ascending: false });
      return res.json(data || []);
    }

    // ── PROMO CHECK ────────────────────────────────
    if (url === '/api/promo/check' && req.method === 'POST') {
      const { code, category, productId } = body;
      const { data } = await supa().from('promos')
        .select('*').eq('code', code.toUpperCase()).maybeSingle();
      if (!data) return res.json({ success: false, message: 'Invalid promo code' });
      if (data.expired_at && new Date(data.expired_at) < new Date())
        return res.json({ success: false, message: 'Promo code expired' });
      if (data.limit > 0 && (data.used || 0) >= data.limit)
        return res.json({ success: false, message: 'Promo code limit reached' });
      if (data.valid_category !== 'all' && data.valid_category !== category)
        return res.json({ success: false, message: 'Promo not valid for this category' });
      return res.json({ success: true, data });
    }

    // ── REVIEWS ────────────────────────────────────
    if (url === '/api/reviews/all' && req.method === 'GET') {
      const { data } = await supa().from('reviews')
        .select('*').order('time', { ascending: false }).limit(12);
      return res.json(data || []);
    }

    // ── TRANSACTION CREATE ─────────────────────────
    if (url === '/api/transaction/create' && req.method === 'POST') {
      const { username, phone, productId, category, promoCode } = body;
      if (!username || !phone || !productId)
        return res.status(400).json({ success: false, message: 'Missing fields' });

      // Fetch product
      const { data: product } = await supa().from('products')
        .select('*').eq('id', productId).single();
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

      // Apply promo
      let amount = product.price;
      let promoUsed = null;
      if (promoCode) {
        const { data: promo } = await supa().from('promos')
          .select('*').eq('code', promoCode.toUpperCase()).maybeSingle();
        if (promo && (promo.limit === 0 || promo.used < promo.limit)) {
          amount = Math.ceil(amount * (1 - promo.discount / 100));
          promoUsed = promo;
        }
      }

      const txId = generateTransactionId('ORD');

      // Fetch user profile for email
      const { data: profile } = await supa().from('profiles')
        .select('*').eq('phone', phone).maybeSingle();
      const email       = profile?.email || `${username}@amane.local`;
      const customerName= profile?.full_name || username;

      // Create Tripay transaction
      let qrString = '', tripayRef = '';
      try {
        const tx = await createTripayTransaction({
          merchantRef:   txId,
          amount,
          customerName,
          customerEmail: email,
          customerPhone: phone,
          item:          product.name,
        });
        qrString  = tx.qr_string || tx.pay_code || '';
        tripayRef = tx.reference || '';
      } catch (e) {
        return res.status(500).json({ success: false, message: 'Payment gateway error: ' + e.message });
      }

      // Save transaction to DB
      await supa().from('transactions').insert({
        transaction_id: txId,
        tripay_ref:     tripayRef,
        phone,
        username,
        product_id:     productId,
        category:       category || 'panel',
        item:           product.name,
        amount,
        qr_string:      qrString,
        status:         'pending',
        promo_code:     promoCode || null,
        time:           new Date().toISOString(),
      });

      return res.json({ success: true, transaction_id: txId, qr_string: qrString, amount });
    }

    // ── TRANSACTION DETAIL ─────────────────────────
    if (url.startsWith('/api/transaction/detail/') && req.method === 'GET') {
      const txId = url.split('/api/transaction/detail/')[1];
      const { data } = await supa().from('transactions')
        .select('*').eq('transaction_id', txId).maybeSingle();
      if (!data) return res.status(404).json({ error: 'Not found' });
      return res.json(data);
    }

    // ── TRANSACTION CHECK ──────────────────────────
    if (url === '/api/transaction/check' && req.method === 'POST') {
      const { transaction_id } = body;
      const { data: tx } = await supa().from('transactions')
        .select('*').eq('transaction_id', transaction_id).maybeSingle();
      if (!tx) return res.json({ status: 'error', message: 'Not found' });
      if (tx.status === 'success') {
        const { data: panel } = await supa().from('panels')
          .select('*').eq('transaction_id', transaction_id).maybeSingle();
        return res.json({ status: 'success', panel_data: panel || null });
      }
      if (tx.status === 'canceled') return res.json({ status: 'canceled' });

      // Check with Tripay
      try {
        const tripay = await checkTripayTransaction(tx.tripay_ref);
        if (tripay.status === 'PAID') {
          await fulfillPanelOrder(tx);
          const { data: panel } = await supa().from('panels')
            .select('*').eq('transaction_id', transaction_id).maybeSingle();
          return res.json({ status: 'success', panel_data: panel || null });
        } else if (tripay.status === 'EXPIRED' || tripay.status === 'FAILED') {
          await supa().from('transactions').update({ status: 'canceled' }).eq('transaction_id', transaction_id);
          return res.json({ status: 'canceled' });
        }
      } catch {}

      return res.json({ status: 'pending' });
    }

    // ── TRANSACTION CANCEL ─────────────────────────
    if (url === '/api/transaction/cancel' && req.method === 'POST') {
      const { transaction_id } = body;
      await supa().from('transactions')
        .update({ status: 'canceled' }).eq('transaction_id', transaction_id).eq('status', 'pending');
      return res.json({ success: true });
    }

    // ── PANEL RENEW ────────────────────────────────
    if (url === '/api/panel/renew' && req.method === 'POST') {
      const { username, phone, productId } = body;
      if (!username || !phone || !productId)
        return res.status(400).json({ success: false, message: 'Missing fields' });

      const { data: product } = await supa().from('products')
        .select('*').eq('id', productId).single();
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

      const txId = generateTransactionId('RNW');
      const { data: profile } = await supa().from('profiles')
        .select('*').eq('phone', phone).maybeSingle();
      const email       = profile?.email || `${username}@amane.local`;
      const customerName= profile?.full_name || username;

      let qrString = '', tripayRef = '';
      try {
        const tx = await createTripayTransaction({
          merchantRef:   txId,
          amount:        product.price,
          customerName,
          customerEmail: email,
          customerPhone: phone,
          item:          'Renewal: ' + product.name,
        });
        qrString  = tx.qr_string || '';
        tripayRef = tx.reference  || '';
      } catch (e) {
        return res.status(500).json({ success: false, message: 'Payment gateway error: ' + e.message });
      }

      await supa().from('transactions').insert({
        transaction_id: txId,
        tripay_ref:     tripayRef,
        phone,
        username,
        product_id:     productId,
        category:       'renewal',
        item:           'Renewal: ' + product.name,
        amount:         product.price,
        qr_string:      qrString,
        status:         'pending',
        time:           new Date().toISOString(),
      });

      return res.json({ success: true, transaction_id: txId, qr_string: qrString, amount: product.price });
    }

    // ── WARRANTY CLAIM ─────────────────────────────
    if (url === '/api/garansi/claim' && req.method === 'POST') {
      const { order_id, phone, reason } = body;
      if (!order_id || !phone) return res.status(400).json({ success: false, message: 'Missing fields' });

      // Find original transaction
      const { data: tx } = await supa().from('transactions')
        .select('*').eq('transaction_id', order_id).maybeSingle();
      if (!tx) return res.json({ success: false, message: 'Order ID not found' });
      if (tx.phone !== phone && tx.username !== phone)
        return res.json({ success: false, message: 'Phone does not match this order' });
      if (tx.status !== 'success')
        return res.json({ success: false, message: 'Order is not completed' });

      // Find panel
      const { data: panel } = await supa().from('panels')
        .select('*').eq('username', tx.username).maybeSingle();
      if (!panel) return res.json({ success: false, message: 'Panel not found' });
      if (panel.status === 'deleted' || panel.status === 'expired')
        return res.json({ success: false, message: 'Panel expired — warranty no longer valid' });

      // Reset password
      const newPw = generatePassword();
      try {
        if (panel.ptero_user_id) await resetPteroPassword(panel.ptero_user_id, newPw);
        if (panel.status === 'suspended' && panel.server_id) await unsuspendPteroServer(panel.server_id);
      } catch (e) {
        return res.json({ success: false, message: 'Pterodactyl error: ' + e.message });
      }

      // Extend expiry
      const newExpiry = addDays(PANEL_DURATION_DAYS);
      await supa().from('panels').update({
        password:     newPw,
        status:       'active',
        expired_date: newExpiry,
      }).eq('username', panel.username);

      // Log warranty claim
      const claimId = generateTransactionId('GAR');
      await supa().from('transactions').insert({
        transaction_id: claimId,
        phone,
        username:   tx.username,
        category:   'garansi',
        item:       'Warranty Claim for ' + order_id,
        amount:     0,
        status:     'success',
        reason,
        time:       new Date().toISOString(),
      });

      await notifyTelegram(
        `🛡 <b>Warranty Claim</b>\nUser: @${tx.username}\nPhone: ${phone}\nReason: ${reason}\nNew expiry: ${newExpiry}`
      );

      return res.json({
        success: true,
        message: 'Warranty processed! Password reset and expiry extended to ' + newExpiry,
        new_password: newPw,
        panel_data: {
          username:     panel.username,
          password:     newPw,
          login_url:    panel.login_url,
          expired_date: newExpiry,
        },
      });
    }

    // ── USER UPDATE ────────────────────────────────
    if (url === '/api/user/update' && req.method === 'POST') {
      const { username, newName, newProfilePic } = body;
      const updates = {};
      if (newName)       updates.full_name   = newName;
      if (newProfilePic) updates.avatar_url  = newProfilePic;
      if (!Object.keys(updates).length) return res.json({ success: true });
      await supa().from('profiles').update(updates).eq('username', username);
      return res.json({ success: true });
    }

    // ── ADMIN VERIFY ───────────────────────────────
    if (url === '/api/admin/verify' && req.method === 'POST') {
      return res.json({ success: body.pin === ADMIN_PIN });
    }

    // ── ADMIN: PANELS ──────────────────────────────
    if (url === '/api/admin/panels' && req.method === 'GET') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { data } = await supa().from('panels').select('*').order('created_at', { ascending: false });
      return res.json(data || []);
    }

    // ── ADMIN: USERS ───────────────────────────────
    if (url === '/api/admin/users' && req.method === 'GET') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { data } = await supa().from('profiles').select('*').order('created_at', { ascending: false });
      return res.json(data || []);
    }

    // ── ADMIN: ORDERS ──────────────────────────────
    if (url === '/api/admin/orders' && req.method === 'GET') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { data } = await supa().from('transactions').select('*').order('time', { ascending: false });
      return res.json(data || []);
    }

    // ── ADMIN: PROMOS ──────────────────────────────
    if (url === '/api/admin/promos' && req.method === 'GET') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { data } = await supa().from('promos').select('*');
      return res.json(data || []);
    }

    if (url === '/api/admin/promo/add' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      await supa().from('promos').insert({ ...body, used: 0 });
      return res.json({ success: true });
    }

    if (url === '/api/admin/promo/delete' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      await supa().from('promos').delete().eq('code', body.code);
      return res.json({ success: true });
    }

    // ── ADMIN: PRODUCT ADD/UPDATE/DELETE ───────────
    if (url === '/api/admin/product/add' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { data } = await supa().from('products').insert(body).select().single();
      return res.json({ success: true, data });
    }

    if (url === '/api/admin/product/update' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { id, ...rest } = body;
      await supa().from('products').update(rest).eq('id', id);
      return res.json({ success: true });
    }

    if (url === '/api/admin/product/delete' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      await supa().from('products').delete().eq('id', body.id);
      return res.json({ success: true });
    }

    // ── ADMIN: PANEL ACTIONS ───────────────────────
    if (url === '/api/admin/panel/suspend' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { data: panel } = await supa().from('panels').select('*').eq('username', body.username).single();
      if (panel?.server_id) await suspendPteroServer(panel.server_id);
      await supa().from('panels').update({ status: 'suspended' }).eq('username', body.username);
      return res.json({ success: true });
    }

    if (url === '/api/admin/panel/unsuspend' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { data: panel } = await supa().from('panels').select('*').eq('username', body.username).single();
      if (panel?.server_id) await unsuspendPteroServer(panel.server_id);
      await supa().from('panels').update({ status: 'active' }).eq('username', body.username);
      return res.json({ success: true });
    }

    if (url === '/api/admin/panel/delete' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { data: panel } = await supa().from('panels').select('*').eq('username', body.username).single();
      if (panel?.server_id) await deletePteroServer(panel.server_id).catch(() => {});
      if (panel?.ptero_user_id) await deletePteroUser(panel.ptero_user_id).catch(() => {});
      await supa().from('panels').update({ status: 'deleted' }).eq('username', body.username);
      return res.json({ success: true });
    }

    // ── ADMIN: SITE INFO ───────────────────────────
    if (url === '/api/admin/site-info' && req.method === 'GET') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { data } = await supa().from('settings').select('*').eq('key', 'site').maybeSingle();
      return res.json(data?.value || {});
    }

    if (url === '/api/admin/site-info' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      await supa().from('settings').upsert({ key: 'site', value: body });
      return res.json({ success: true });
    }

    // ── ADMIN: ENV DEFAULTS ────────────────────────
    if (url === '/api/admin/env-defaults' && req.method === 'GET') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      return res.json({
        ptero_domain:   PTERO_DOMAIN,
        ptero_egg_id:   PTERO_EGG_ID,
        panel_duration: PANEL_DURATION_DAYS,
      });
    }

    // ── ADMIN: USER DELETE ─────────────────────────
    if (url === '/api/admin/user/delete' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      await supa().from('profiles').delete().eq('phone', body.phone);
      return res.json({ success: true });
    }

    // ── ADMIN: BACKUP ──────────────────────────────
    if (url === '/api/admin/backup' && req.method === 'POST') {
      if (!verifyAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
      await notifyTelegram('📦 <b>Backup requested</b>\nTime: ' + new Date().toLocaleString('id-ID'));
      return res.json({ success: true });
    }

    // ── TRIPAY WEBHOOK ─────────────────────────────
    if (url === '/api/webhook/tripay' && req.method === 'POST') {
      const callbackSignature = req.headers['x-callback-signature'];
      const payloadStr = JSON.stringify(body);
      const expectedSig = crypto
        .createHmac('sha256', TRIPAY_PRIVATE_KEY)
        .update(payloadStr)
        .digest('hex');
      if (callbackSignature !== expectedSig)
        return res.status(403).json({ error: 'Invalid signature' });

      if (body.status === 'PAID') {
        const { data: tx } = await supa().from('transactions')
          .select('*').eq('transaction_id', body.merchant_ref).maybeSingle();
        if (tx && tx.status === 'pending') {
          await fulfillPanelOrder(tx);
        }
      }
      return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Not found' });

  } catch (err) {
    console.error('[API Error]', url, err.message);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════
//   FULFILL PANEL ORDER — creates Ptero user+server
// ══════════════════════════════════════════════════
async function fulfillPanelOrder(tx) {
  const { data: product } = await supa().from('products')
    .select('*').eq('id', tx.product_id).single();
  if (!product) throw new Error('Product not found');

  const password = generatePassword();
  const email    = `${tx.username}@amane.panel`;
  const domain   = product.ptero_domain || PTERO_DOMAIN;
  const eggId    = product.egg_id       || PTERO_EGG_ID;
  const ram      = product.ram  || 512;
  const disk     = product.disk || 1024;
  const cpu      = product.cpu  || 100;

  if (product.mode === 1) {
    // AUTO: Create real Pterodactyl user + server
    const pteroUser   = await createPteroUser(tx.username, email, tx.username, password);
    const pteroServer = await createPteroServer(pteroUser.id, tx.username, ram, disk, cpu, eggId);

    const expiry = addDays(PANEL_DURATION_DAYS);
    const loginUrl = domain.replace(/\/$/, '');

    await supa().from('panels').upsert({
      username:      tx.username,
      password,
      email,
      phone:         tx.phone,
      ptero_user_id: pteroUser.id,
      server_id:     pteroServer.id,
      login_url:     loginUrl,
      transaction_id: tx.transaction_id,
      product_id:    tx.product_id,
      ram, disk, cpu,
      mode:          'auto',
      status:        'active',
      expired_date:  expiry,
      created_at:    new Date().toISOString(),
    });

    await supa().from('transactions').update({
      status:   'success',
      panel_data: { username: tx.username, password, login_url: loginUrl, expired_date: expiry },
    }).eq('transaction_id', tx.transaction_id);

    // Increment promo usage
    if (tx.promo_code) {
      await supa().rpc('increment_promo_usage', { promo_code: tx.promo_code }).catch(() => {});
    }

    await notifyTelegram(
      `✅ <b>Panel Created</b>\n@${tx.username}\nRAM: ${ram}MB | CPU: ${cpu}%\nExpires: ${expiry}\nTx: ${tx.transaction_id}`
    );

  } else {
    // MANUAL: Just record pending — admin will handle
    await supa().from('panels').upsert({
      username:      tx.username,
      phone:         tx.phone,
      transaction_id: tx.transaction_id,
      product_id:    tx.product_id,
      ram, disk, cpu,
      mode:          'manual',
      status:        'pending',
      expired_date:  addDays(PANEL_DURATION_DAYS),
      created_at:    new Date().toISOString(),
    });
    await supa().from('transactions').update({ status: 'success' }).eq('transaction_id', tx.transaction_id);
    await notifyTelegram(
      `🕐 <b>Manual Panel Order</b>\n@${tx.username}\nPhone: ${tx.phone}\nRAM: ${ram}MB\nTx: ${tx.transaction_id}\nPlease provision manually.`
    );
  }
}

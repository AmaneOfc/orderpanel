const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const axios = require('axios');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// ==================== HELPER FUNCTIONS ====================

function generateOrderId() {
  return 'ORD' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
}

async function pakasirCreatePayment(amount, orderId) {
  // Jika tidak ada konfigurasi Pakasir, gunakan mode testing
  if (!process.env.PAKASIR_SLUG || !process.env.PAKASIR_API_KEY) {
    console.log('Using test mode - no Pakasir config');
    return {
      payment: {
        payment_number: `TEST_${orderId}`,
        total_payment: amount
      }
    };
  }
  
  try {
    const response = await axios.post(
      'https://app.pakasir.com/api/transactioncreate/qris',
      {
        project: process.env.PAKASIR_SLUG,
        order_id: orderId,
        amount: amount,
        api_key: process.env.PAKASIR_API_KEY
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    return response.data;
  } catch (error) {
    console.error('Payment creation error:', error.message);
    // Fallback ke test mode
    return {
      payment: {
        payment_number: `TEST_${orderId}`,
        total_payment: amount
      }
    };
  }
}

async function pakasirCheckPayment(orderId, amount) {
  if (!process.env.PAKASIR_SLUG || !process.env.PAKASIR_API_KEY) {
    // Test mode - auto success after 5 seconds (for demo)
    return { transaction: { status: 'pending' } };
  }
  
  try {
    const response = await axios.get(
      `https://app.pakasir.com/api/transactiondetail?project=${process.env.PAKASIR_SLUG}&amount=${amount}&order_id=${orderId}&api_key=${process.env.PAKASIR_API_KEY}`,
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    return { transaction: { status: 'pending' } };
  }
}

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== AUTHENTICATION APIs ====================

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, full_name } = req.body;
  
  try {
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();
    
    if (existingUser) {
      return res.json({ success: false, message: 'Username already exists' });
    }
    
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (existingEmail) {
      return res.json({ success: false, message: 'Email already registered' });
    }
    
    const { data: user, error } = await supabase
      .from('users')
      .insert([{
        username: username,
        email: email,
        password: password,
        full_name: full_name || username,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed: ' + error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error || !user) {
      return res.json({ success: false, message: 'User not found' });
    }
    
    if (user.password !== password) {
      return res.json({ success: false, message: 'Invalid password' });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ==================== PRODUCT APIs ====================

app.get('/api/products', async (req, res) => {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    res.json(products || []);
  } catch (error) {
    console.error('Get products error:', error);
    // Return sample products if table is empty
    res.json([
      { id: 1, name: 'Basic Panel', price: 50000, ram: 1024, disk: 5120, cpu: 100, duration_days: 30, category: 'panel', is_active: true },
      { id: 2, name: 'Standard Panel', price: 100000, ram: 2048, disk: 10240, cpu: 200, duration_days: 30, category: 'panel', is_active: true },
      { id: 3, name: 'Premium Panel', price: 200000, ram: 4096, disk: 20480, cpu: 400, duration_days: 30, category: 'panel', is_active: true }
    ]);
  }
});

// ==================== ORDER APIs ====================

app.post('/api/order/create', async (req, res) => {
  const { user_id, product_id, username, email } = req.body;
  
  try {
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .single();
    
    if (productError || !product) {
      return res.status(400).json({ success: false, message: 'Product not found' });
    }
    
    const orderId = generateOrderId();
    const serverPassword = username + Math.floor(1000 + Math.random() * 9000);
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + (product.duration_days || 30));
    
    const payment = await pakasirCreatePayment(product.price, orderId);
    
    let qrBase64 = '';
    try {
      const qrBuffer = await QRCode.toBuffer(payment.payment.payment_number);
      qrBase64 = qrBuffer.toString('base64');
    } catch (qrError) {
      console.error('QR generation error:', qrError);
    }
    
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        order_id: orderId,
        user_id: user_id || null,
        product_id: product_id,
        username: username,
        email: email,
        server_password: serverPassword,
        amount: product.price,
        requested_amount: product.price,
        status: 'pending',
        qr_string: payment.payment.payment_number,
        qr_base64: qrBase64,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (orderError) throw orderError;
    
    res.json({
      success: true,
      order: order,
      qr_string: payment.payment.payment_number,
      qr_base64: qrBase64,
      amount: payment.payment.total_payment
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ success: false, message: 'Order creation failed: ' + error.message });
  }
});

app.post('/api/order/check', async (req, res) => {
  const { order_id } = req.body;
  
  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', order_id)
      .single();
    
    if (orderError || !order) {
      return res.json({ status: 'error', message: 'Order not found' });
    }
    
    if (order.status === 'success') {
      return res.json({ 
        status: 'success', 
        order: order,
        panel_url: process.env.PTERO_DOMAIN || 'https://panel.example.com',
        username: order.username,
        password: order.server_password
      });
    }
    
    // Untuk demo/testing, setelah 10 detik langsung success
    const isTestMode = !process.env.PAKASIR_SLUG;
    if (isTestMode && Date.now() - new Date(order.created_at).getTime() > 10000) {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);
      
      await supabase
        .from('orders')
        .update({
          status: 'success',
          expired_at: expirationDate.toISOString(),
          completed_at: new Date().toISOString()
        })
        .eq('order_id', order_id);
      
      return res.json({
        status: 'success',
        panel_url: process.env.PTERO_DOMAIN || 'https://panel.example.com',
        username: order.username,
        password: order.server_password
      });
    }
    
    res.json({ status: 'pending' });
  } catch (error) {
    console.error('Order check error:', error);
    res.json({ status: 'error', message: error.message });
  }
});

app.get('/api/user/orders/:userId', async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(orders || []);
  } catch (error) {
    console.error('Get user orders error:', error);
    res.json([]);
  }
});

app.get('/api/user/panels/:userId', async (req, res) => {
  try {
    const { data: panels, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', req.params.userId)
      .eq('status', 'success')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(panels || []);
  } catch (error) {
    console.error('Get user panels error:', error);
    res.json([]);
  }
});

// ==================== EXPORT ====================
module.exports = app;

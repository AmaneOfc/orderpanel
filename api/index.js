const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const axios = require('axios');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// ==================== HELPER FUNCTIONS ====================

function generateOrderId() {
  return 'ORD' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
}

async function createPterodactylUser(email, username, password) {
  try {
    const response = await axios.post(
      `${process.env.PTERO_DOMAIN}/api/application/users`,
      {
        email: email,
        username: username,
        first_name: username,
        last_name: 'User',
        language: 'en',
        password: password
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.PTERO_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    return response.data.attributes.id;
  } catch (error) {
    // Check if user exists
    if (error.response?.status === 422) {
      const search = await axios.get(
        `${process.env.PTERO_DOMAIN}/api/application/users?filter[email]=${encodeURIComponent(email)}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.PTERO_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      if (search.data?.data?.[0]) {
        return search.data.data[0].attributes.id;
      }
    }
    throw error;
  }
}

async function createPterodactylServer(userId, serverName, ram, disk, cpu) {
  try {
    const response = await axios.post(
      `${process.env.PTERO_DOMAIN}/api/application/servers`,
      {
        name: serverName,
        user: userId,
        description: 'Automatic created server - Panel Shop',
        egg: parseInt(process.env.PTERO_EGG_ID),
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
        startup: '/usr/local/bin/npm start',
        environment: {
          GIT_ADDRESS: '',
          USERNAME: '',
          ACCESS_TOKEN: '',
          CMD_RUN: 'npm start',
          AUTO_UPDATE: '1'
        },
        limits: {
          memory: parseInt(ram),
          swap: 0,
          disk: parseInt(disk),
          io: 500,
          cpu: parseInt(cpu)
        },
        feature_limits: {
          databases: 1,
          allocations: 1,
          backups: 1
        },
        deploy: {
          locations: [parseInt(process.env.PTERO_LOCATION_ID)],
          dedicated_ip: false,
          port_range: []
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.PTERO_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    return response.data.attributes;
  } catch (error) {
    console.error('Server creation error:', error.response?.data || error.message);
    throw error;
  }
}

async function pakasirCreatePayment(amount, orderId) {
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
        headers: { 'Content-Type': 'application/json' }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Payment creation error:', error.response?.data || error.message);
    throw error;
  }
}

async function pakasirCheckPayment(orderId, amount) {
  try {
    const response = await axios.get(
      `https://app.pakasir.com/api/transactiondetail?project=${process.env.PAKASIR_SLUG}&amount=${amount}&order_id=${orderId}&api_key=${process.env.PAKASIR_API_KEY}`
    );
    return response.data;
  } catch (error) {
    console.error('Payment check error:', error.response?.data || error.message);
    return { transaction: { status: 'pending' } };
  }
}

// ==================== AUTHENTICATION APIs ====================

// Google Login
app.post('/api/auth/google', async (req, res) => {
  const { email, name, picture, googleId } = req.body;
  
  try {
    // Check if user exists
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    if (!user) {
      // Create new user
      const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{
          email: email,
          username: username,
          full_name: name,
          avatar_url: picture,
          google_id: googleId,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (insertError) throw insertError;
      user = newUser;
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, full_name } = req.body;
  
  try {
    // Check if username exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();
    
    if (existingUser) {
      return res.json({ success: false, message: 'Username already exists' });
    }
    
    // Check if email exists
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (existingEmail) {
      return res.json({ success: false, message: 'Email already registered' });
    }
    
    // Create user (in production, hash password with bcrypt)
    const { data: user, error } = await supabase
      .from('users')
      .insert([{
        username: username,
        email: email,
        password: password, // In production: hash this!
        full_name: full_name,
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
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Login
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
    
    // In production: compare hashed password
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
        avatar_url: user.avatar_url
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
    res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json([]);
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json(null);
  }
});

// ==================== ORDER APIs ====================

app.post('/api/order/create', async (req, res) => {
  const { user_id, product_id, username, email, payment_method } = req.body;
  
  try {
    // Get product details
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
    expirationDate.setDate(expirationDate.getDate() + product.duration_days);
    
    // Create payment
    const payment = await pakasirCreatePayment(product.price, orderId);
    
    if (!payment || !payment.payment) {
      return res.status(500).json({ success: false, message: 'Payment creation failed' });
    }
    
    // Generate QR Code
    const qrBuffer = await QRCode.toBuffer(payment.payment.payment_number);
    const qrBase64 = qrBuffer.toString('base64');
    
    // Save order
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
        payment_method: payment_method,
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
    res.status(500).json({ success: false, message: 'Order creation failed' });
  }
});

app.post('/api/order/check', async (req, res) => {
  const { order_id } = req.body;
  
  try {
    // Get order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, products(*)')
      .eq('order_id', order_id)
      .single();
    
    if (orderError || !order) {
      return res.json({ status: 'error', message: 'Order not found' });
    }
    
    if (order.status === 'success') {
      return res.json({ status: 'success', order: order });
    }
    
    // Check payment
    const payment = await pakasirCheckPayment(order_id, order.requested_amount);
    
    if (payment.transaction?.status === 'completed') {
      // Update order status
      await supabase
        .from('orders')
        .update({
          status: 'processing',
          paid_at: new Date().toISOString()
        })
        .eq('order_id', order_id);
      
      // Create Pterodactyl resources
      const pterodactylEmail = `${order.username}@panelshop.id`;
      const pteroUser = await createPterodactylUser(
        pterodactylEmail,
        order.username,
        order.server_password
      );
      
      const serverData = await createPterodactylServer(
        pteroUser,
        `${order.username}-server`,
        order.products.ram,
        order.products.disk,
        order.products.cpu
      );
      
      // Complete order
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + order.products.duration_days);
      
      const { data: updatedOrder } = await supabase
        .from('orders')
        .update({
          status: 'success',
          pterodactyl_user_id: pteroUser,
          server_id: serverData.id,
          server_identifier: serverData.identifier,
          server_password: order.server_password,
          expired_at: expirationDate.toISOString(),
          completed_at: new Date().toISOString()
        })
        .eq('order_id', order_id)
        .select()
        .single();
      
      res.json({
        status: 'success',
        order: updatedOrder,
        panel_url: process.env.PTERO_DOMAIN,
        username: order.username,
        password: order.server_password
      });
    } else if (payment.transaction?.status === 'expired') {
      await supabase
        .from('orders')
        .update({ status: 'expired' })
        .eq('order_id', order_id);
      res.json({ status: 'expired' });
    } else {
      res.json({ status: 'pending' });
    }
  } catch (error) {
    console.error('Order check error:', error);
    res.json({ status: 'error', message: error.message });
  }
});

app.get('/api/user/orders/:userId', async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, products(*)')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(orders);
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json([]);
  }
});

app.get('/api/order/:orderId', async (req, res) => {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, products(*)')
      .eq('order_id', req.params.orderId)
      .single();
    
    if (error) throw error;
    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json(null);
  }
});

// ==================== USER PANEL APIs ====================

app.get('/api/user/panels/:userId', async (req, res) => {
  try {
    const { data: panels, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', req.params.userId)
      .eq('status', 'success')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(panels);
  } catch (error) {
    console.error('Get user panels error:', error);
    res.status(500).json([]);
  }
});

app.post('/api/panel/renew', async (req, res) => {
  const { order_id, user_id } = req.body;
  
  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, products(*)')
      .eq('order_id', order_id)
      .single();
    
    if (orderError || !order) {
      return res.status(400).json({ success: false, message: 'Order not found' });
    }
    
    const newOrderId = generateOrderId();
    const payment = await pakasirCreatePayment(order.products.price, newOrderId);
    
    if (!payment || !payment.payment) {
      return res.status(500).json({ success: false, message: 'Payment creation failed' });
    }
    
    const qrBuffer = await QRCode.toBuffer(payment.payment.payment_number);
    const qrBase64 = qrBuffer.toString('base64');
    
    const { data: renewalOrder, error: renewalError } = await supabase
      .from('orders')
      .insert([{
        order_id: newOrderId,
        user_id: user_id,
        product_id: order.product_id,
        username: order.username,
        email: order.email,
        server_password: order.server_password,
        amount: order.products.price,
        requested_amount: order.products.price,
        status: 'pending',
        qr_string: payment.payment.payment_number,
        qr_base64: qrBase64,
        is_renewal: true,
        original_order_id: order_id,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (renewalError) throw renewalError;
    
    res.json({
      success: true,
      order: renewalOrder,
      qr_string: payment.payment.payment_number,
      qr_base64: qrBase64
    });
  } catch (error) {
    console.error('Renewal error:', error);
    res.status(500).json({ success: false, message: 'Renewal failed' });
  }
});

// ==================== SERVER ====================

module.exports = app;
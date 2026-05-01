let currentUser = null;
let currentOrderCheckInterval = null;

// Load user data
async function loadUser() {
    const userStr = localStorage.getItem('panelShopUser');
    if (!userStr) {
        window.location.href = '/';
        return;
    }
    currentUser = JSON.parse(userStr);
    
    document.getElementById('userName').textContent = currentUser.full_name || currentUser.username;
    document.getElementById('userEmail').textContent = currentUser.email;
    if (currentUser.avatar_url) {
        document.getElementById('userAvatar').src = currentUser.avatar_url;
    }
}

// Load products
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        const products = await response.json();
        
        const productsGrid = document.getElementById('productsGrid');
        if (!productsGrid) return;
        
        productsGrid.innerHTML = products.map(product => `
            <div class="product-card">
                <h3>${product.name}</h3>
                <div class="product-specs">
                    <p><i class="fas fa-microchip"></i> CPU: ${product.cpu}%</p>
                    <p><i class="fas fa-memory"></i> RAM: ${product.ram} MB</p>
                    <p><i class="fas fa-hdd"></i> Disk: ${product.disk} MB</p>
                    <p><i class="far fa-calendar-alt"></i> Duration: ${product.duration_days} days</p>
                </div>
                <div class="product-price">Rp ${product.price.toLocaleString()}<span>/month</span></div>
                <button class="order-btn" onclick="orderProduct(${product.id})">Order Now</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load products error:', error);
    }
}

// Order product
async function orderProduct(productId) {
    if (!currentUser) {
        alert('Please login first');
        return;
    }
    
    try {
        const response = await fetch('/api/order/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                product_id: productId,
                username: currentUser.username,
                email: currentUser.email,
                payment_method: 'qris'
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showPaymentModal(data);
        } else {
            alert('Order failed: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Order error:', error);
        alert('Order failed. Please try again.');
    }
}

// Show payment modal
function showPaymentModal(orderData) {
    const modal = document.getElementById('paymentModal');
    const content = document.getElementById('paymentContent');
    
    content.innerHTML = `
        <div class="payment-info">
            <p><strong>Order ID:</strong> ${orderData.order.order_id}</p>
            <p><strong>Amount:</strong> Rp ${orderData.amount.toLocaleString()}</p>
            <div class="qr-container">
                <img src="data:image/png;base64,${orderData.qr_base64}" alt="QR Code">
            </div>
            <p class="payment-note">Scan QR Code with any QRIS-enabled payment app</p>
            <div class="payment-status" id="paymentStatus">
                <i class="fas fa-spinner fa-spin"></i> Waiting for payment...
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
    
    // Start checking payment status
    startPaymentCheck(orderData.order.order_id);
    
    // Close modal handler
    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = () => {
        modal.style.display = 'none';
        if (currentOrderCheckInterval) {
            clearInterval(currentOrderCheckInterval);
        }
    };
}

// Check payment status
function startPaymentCheck(orderId) {
    if (currentOrderCheckInterval) {
        clearInterval(currentOrderCheckInterval);
    }
    
    currentOrderCheckInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/order/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                clearInterval(currentOrderCheckInterval);
                document.getElementById('paymentStatus').innerHTML = `
                    <i class="fas fa-check-circle"></i> Payment Success!
                    <div class="panel-login-info">
                        <h4>Your Panel is Ready!</h4>
                        <p><strong>URL:</strong> <a href="${data.panel_url}" target="_blank">${data.panel_url}</a></p>
                        <p><strong>Username:</strong> ${data.username}</p>
                        <p><strong>Password:</strong> ${data.password}</p>
                        <button onclick="closeAndRefresh()" class="btn-primary">Close & Refresh</button>
                    </div>
                `;
            } else if (data.status === 'expired') {
                clearInterval(currentOrderCheckInterval);
                document.getElementById('paymentStatus').innerHTML = `
                    <i class="fas fa-times-circle"></i> Payment expired. Please reorder.
                `;
            }
        } catch (error) {
            console.error('Payment check error:', error);
        }
    }, 3000);
}

// Load user's panels
async function loadMyPanels() {
    try {
        const response = await fetch(`/api/user/panels/${currentUser.id}`);
        const panels = await response.json();
        
        const panelsList = document.getElementById('myPanelsList');
        if (!panelsList) return;
        
        if (panels.length === 0) {
            panelsList.innerHTML = '<p class="empty-state">No panels yet. Order your first panel!</p>';
            return;
        }
        
        panelsList.innerHTML = panels.map(panel => {
            const isExpired = new Date(panel.expired_at) < new Date();
            return `
                <div class="panel-card">
                    <div class="panel-header">
                        <h3>${panel.products?.name || 'Panel'}</h3>
                        <span class="panel-status ${isExpired ? 'status-expired' : 'status-active'}">
                            ${isExpired ? 'Expired' : 'Active'}
                        </span>
                    </div>
                    <div class="panel-details">
                        <p><i class="fas fa-user"></i> Username: ${panel.username}</p>
                        <p><i class="fas fa-key"></i> Password: ${panel.server_password}</p>
                        <p><i class="fas fa-calendar"></i> Expires: ${new Date(panel.expired_at).toLocaleDateString()}</p>
                    </div>
                    <div class="panel-actions">
                        <button class="btn-secondary btn-small" onclick="copyLoginInfo('${panel.username}', '${panel.server_password}', '${process.env.PTERO_DOMAIN}')">
                            <i class="fas fa-copy"></i> Copy Login
                        </button>
                        ${isExpired ? `
                            <button class="btn-primary btn-small" onclick="renewPanel('${panel.order_id}')">
                                <i class="fas fa-sync-alt"></i> Renew
                            </button>
                        ` : `
                            <button class="btn-secondary btn-small" onclick="window.open('${process.env.PTERO_DOMAIN}', '_blank')">
                                <i class="fas fa-external-link-alt"></i> Login to Panel
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Load panels error:', error);
    }
}

// Load order history
async function loadOrderHistory() {
    try {
        const response = await fetch(`/api/user/orders/${currentUser.id}`);
        const orders = await response.json();
        
        const historyList = document.getElementById('historyList');
        if (!historyList) return;
        
        if (orders.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No orders yet.</p>';
            return;
        }
        
        historyList.innerHTML = orders.map(order => {
            const statusClass = {
                'pending': 'status-pending',
                'processing': 'status-processing',
                'success': 'status-success',
                'expired': 'status-expired'
            }[order.status] || 'status-pending';
            
            const statusText = {
                'pending': 'Pending Payment',
                'processing': 'Processing',
                'success': 'Completed',
                'expired': 'Expired'
            }[order.status] || order.status;
            
            return `
                <div class="history-card">
                    <div class="panel-header">
                        <div>
                            <h3>${order.products?.name || 'Panel'}</h3>
                            <p class="order-id">ID: ${order.order_id}</p>
                        </div>
                        <span class="panel-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="panel-details">
                        <p><i class="fas fa-money-bill"></i> Amount: Rp ${order.amount.toLocaleString()}</p>
                        <p><i class="fas fa-calendar"></i> Date: ${new Date(order.created_at).toLocaleString()}</p>
                        ${order.status === 'success' ? `
                            <p><i class="fas fa-check-circle" style="color: var(--success)"></i> Completed: ${new Date(order.completed_at).toLocaleString()}</p>
                        ` : ''}
                    </div>
                    ${order.status === 'pending' ? `
                        <button class="btn-primary btn-small" onclick="continuePayment('${order.order_id}')">
                            Continue Payment
                        </button>
                    ` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Load history error:', error);
    }
}

// Renew panel
async function renewPanel(orderId) {
    try {
        const response = await fetch('/api/panel/renew', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_id: orderId,
                user_id: currentUser.id
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showPaymentModal(data);
        } else {
            alert('Renewal failed: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Renew error:', error);
        alert('Renewal failed');
    }
}

// Continue payment
async function continuePayment(orderId) {
    try {
        const response = await fetch('/api/order/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
        });
        
        const data = await response.json();
        if (data.status === 'pending') {
            // Get order details to show QR again
            const orderResponse = await fetch(`/api/order/${orderId}`);
            const order = await orderResponse.json();
            if (order && order.qr_base64) {
                showPaymentModal({ order, amount: order.amount });
            }
        } else if (data.status === 'success') {
            alert('This order is already completed!');
            loadMyPanels();
            loadOrderHistory();
        }
    } catch (error) {
        console.error('Continue payment error:', error);
    }
}

// Copy login info
function copyLoginInfo(username, password, url) {
    const text = `URL: ${url}\nUsername: ${username}\nPassword: ${password}`;
    navigator.clipboard.writeText(text).then(() => {
        alert('Login info copied to clipboard!');
    });
}

// Close modal and refresh
function closeAndRefresh() {
    const modal = document.getElementById('paymentModal');
    modal.style.display = 'none';
    loadMyPanels();
    loadOrderHistory();
}

// Tab switching
function initTabs() {
    const tabs = document.querySelectorAll('.menu-btn');
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            // Update active tab button
            tabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Show active tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabId}Tab`).classList.add('active');
            
            // Load data based on tab
            if (tabId === 'my-panels') {
                loadMyPanels();
            } else if (tabId === 'history') {
                loadOrderHistory();
            }
        });
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    await loadProducts();
    loadMyPanels();
    loadOrderHistory();
    initTabs();
});
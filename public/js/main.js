// Check auth status
const currentUser = localStorage.getItem('panelShopUser');

if (currentUser) {
    const user = JSON.parse(currentUser);
    const authLink = document.getElementById('authLink');
    if (authLink) {
        authLink.textContent = 'Dashboard';
        authLink.href = '/dashboard.html';
    }
}

// Google Login
function initGoogleLogin() {
    if (typeof google === 'undefined') return;
    
    google.accounts.id.initialize({
        client_id: 'YOUR_GOOGLE_CLIENT_ID',
        callback: handleGoogleLogin
    });
    
    const googleBtn = document.getElementById('googleLoginBtn');
    if (googleBtn) {
        google.accounts.id.renderButton(googleBtn, {
            theme: 'dark',
            size: 'large'
        });
    }
}

async function handleGoogleLogin(response) {
    try {
        const result = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: response.email,
                name: response.name,
                picture: response.picture,
                googleId: response.sub
            })
        });
        
        const data = await result.json();
        if (data.success) {
            localStorage.setItem('panelShopUser', JSON.stringify(data.user));
            window.location.href = '/dashboard.html';
        }
    } catch (error) {
        console.error('Google login error:', error);
        alert('Login failed. Please try again.');
    }
}

// Register
async function register() {
    const username = document.getElementById('regUsername')?.value;
    const email = document.getElementById('regEmail')?.value;
    const password = document.getElementById('regPassword')?.value;
    const fullName = document.getElementById('regFullName')?.value;
    
    if (!username || !email || !password) {
        alert('Please fill all fields');
        return;
    }
    
    try {
        const result = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, full_name: fullName })
        });
        
        const data = await result.json();
        if (data.success) {
            localStorage.setItem('panelShopUser', JSON.stringify(data.user));
            window.location.href = '/dashboard.html';
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Register error:', error);
        alert('Registration failed');
    }
}

// Login
async function login() {
    const username = document.getElementById('loginUsername')?.value;
    const password = document.getElementById('loginPassword')?.value;
    
    if (!username || !password) {
        alert('Please enter username and password');
        return;
    }
    
    try {
        const result = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await result.json();
        if (data.success) {
            localStorage.setItem('panelShopUser', JSON.stringify(data.user));
            window.location.href = '/dashboard.html';
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed');
    }
}

// Logout
function logout() {
    localStorage.removeItem('panelShopUser');
    window.location.href = '/';
}

// Check auth on protected pages
function checkAuth() {
    const user = localStorage.getItem('panelShopUser');
    if (!user && !window.location.pathname.includes('index.html') && 
        !window.location.pathname.includes('/') && 
        window.location.pathname !== '/') {
        window.location.href = '/';
    }
    return user ? JSON.parse(user) : null;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});
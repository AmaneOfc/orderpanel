let currentUser = null;

async function loadProfile() {
    const userStr = localStorage.getItem('panelShopUser');
    if (!userStr) {
        window.location.href = '/';
        return;
    }
    currentUser = JSON.parse(userStr);
    
    document.getElementById('profileName').textContent = currentUser.full_name || currentUser.username;
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profileUsername').textContent = currentUser.username;
    document.getElementById('profileJoined').textContent = currentUser.created_at ? new Date(currentUser.created_at).toLocaleDateString() : 'N/A';
    
    if (currentUser.avatar_url) {
        document.getElementById('profileAvatar').src = currentUser.avatar_url;
    }
    
    // Load stats
    await loadUserStats();
}

async function loadUserStats() {
    try {
        const [ordersRes, panelsRes] = await Promise.all([
            fetch(`/api/user/orders/${currentUser.id}`),
            fetch(`/api/user/panels/${currentUser.id}`)
        ]);
        
        const orders = await ordersRes.json();
        const panels = await panelsRes.json();
        
        document.getElementById('totalOrders').textContent = orders.length;
        document.getElementById('activePanels').textContent = panels.filter(p => new Date(p.expired_at) > new Date()).length;
    } catch (error) {
        console.error('Load stats error:', error);
    }
}

// Change avatar
document.getElementById('changeAvatarBtn')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            // Here you would upload to Supabase storage
            alert('Avatar upload feature coming soon!');
        }
    };
    input.click();
});

// Change password modal
const modal = document.getElementById('passwordModal');
const changeBtn = document.getElementById('changePasswordBtn');
const closeBtn = modal?.querySelector('.close');

changeBtn?.addEventListener('click', () => {
    modal.style.display = 'block';
});

closeBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
});

// Change password form
document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = e.target.querySelectorAll('input');
    const currentPass = inputs[0].value;
    const newPass = inputs[1].value;
    const confirmPass = inputs[2].value;
    
    if (newPass !== confirmPass) {
        alert('New passwords do not match');
        return;
    }
    
    // Here you would call API to change password
    alert('Password change feature coming soon!');
    modal.style.display = 'none';
});

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('panelShopUser');
    window.location.href = '/';
});

// Initialize
document.addEventListener('DOMContentLoaded', loadProfile);
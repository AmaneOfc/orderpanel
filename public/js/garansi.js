let currentUser = null;
let userPanels = [];

async function loadUserPanels() {
    const userStr = localStorage.getItem('panelShopUser');
    if (!userStr) {
        window.location.href = '/';
        return;
    }
    currentUser = JSON.parse(userStr);
    
    try {
        const response = await fetch(`/api/user/panels/${currentUser.id}`);
        userPanels = await response.json();
        
        const select = document.getElementById('panelSelect');
        select.innerHTML = '<option value="">Choose your panel...</option>' + 
            userPanels.filter(p => new Date(p.expired_at) > new Date())
                .map(panel => `
                    <option value="${panel.order_id}">
                        ${panel.products?.name || 'Panel'} - ${panel.username} (Exp: ${new Date(panel.expired_at).toLocaleDateString()})
                    </option>
                `).join('');
    } catch (error) {
        console.error('Load panels error:', error);
    }
}

async function claimGaransi() {
    const panelId = document.getElementById('panelSelect').value;
    const issueType = document.getElementById('issueType').value;
    const description = document.getElementById('issueDesc').value;
    
    if (!panelId) {
        alert('Please select a panel');
        return;
    }
    
    if (!description) {
        alert('Please describe your issue');
        return;
    }
    
    // Here you would call API to claim warranty
    // For demo, show success message
    alert(`Warranty claim submitted for panel ${panelId}\nWe will process your request within 24 hours.`);
    
    // Clear form
    document.getElementById('issueDesc').value = '';
}

document.getElementById('claimGaransiBtn')?.addEventListener('click', claimGaransi);
document.addEventListener('DOMContentLoaded', loadUserPanels);

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('panelShopUser');
    window.location.href = '/';
});
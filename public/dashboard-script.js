// Dashboard page script
function initializeDashboard() {
    console.log('Dashboard initialized');
    
    // Handle navigation to chatbot
    const navToChatbotBtn = document.getElementById('nav-to-chatbot');
    if (navToChatbotBtn) {
        navToChatbotBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
    
    // Clear any stored page requests since we're now on dashboard
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.remove(['requestedPage']);
    }
}

// Initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboard);
} else {
    initializeDashboard();
}

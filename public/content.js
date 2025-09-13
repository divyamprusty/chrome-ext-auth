// Content script for ChatBot Extension - sync Supabase auth from the web app
(function () {
    const PROJECT_REF = 'pghywddpncjauftwmssb'; // your Supabase project ref
    const AUTH_KEY = `sb-${PROJECT_REF}-auth-token`;
    
    // Check if extension context is still valid
    function isExtensionValid() {
      try {
        return chrome.runtime && chrome.runtime.id;
      } catch (e) {
        return false;
      }
    }
  
    function getSessionFromLocalStorage() {
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Supabase stores { currentSession, expiresAt, ... } or { access_token, user } shapes depending on version
        const token = parsed?.access_token || parsed?.currentSession?.access_token;
        const refresh_token = parsed?.refresh_token || parsed?.currentSession?.refresh_token || null;
        const user = parsed?.user || parsed?.currentSession?.user || null;
        if (token) return { token, refresh_token, user };
      } catch (e) {
        // ignore parse errors
      }
      return null;
    }
  
    function sendAuthToBackground(session) {
      if (!isExtensionValid()) {
        console.log('Extension context invalidated, skipping auth sync');
        return;
      }
      
      if (session?.token) {
        chrome.runtime.sendMessage({ 
          type: 'STORE_AUTH', 
          token: session.token, 
          refreshToken: session.refresh_token || null, 
          user: session.user || null 
        }).catch((error) => {
          if (error.message.includes('Extension context invalidated')) {
            console.log('Extension context invalidated during auth sync');
          }
        });
      }
    }
  
    function clearAuthInBackground() {
      if (!isExtensionValid()) {
        console.log('Extension context invalidated, skipping auth clear');
        return;
      }
      
      chrome.runtime.sendMessage({ type: 'CLEAR_AUTH' }).catch((error) => {
        if (error.message.includes('Extension context invalidated')) {
          console.log('Extension context invalidated during auth clear');
        }
      });
    }
  
    // Listen for messages from web app to open/close side panel
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      if (event.data?.type === 'OPEN_SIDE_PANEL' && event.data?.source === 'web-app') {
        console.log('Content script received side panel open request', event.data);
        
        chrome.runtime.sendMessage({
          type: 'OPEN_SIDE_PANEL',
          page: event.data.page || 'chatbot'
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Failed to send side panel message:', chrome.runtime.lastError);
          } else {
            console.log('Side panel open message sent successfully');
          }
        });
      }
      
      if (event.data?.type === 'CLOSE_SIDE_PANEL' && event.data?.source === 'web-app') {
        console.log('Content script received CLOSE_SIDE_PANEL message from web app');
        chrome.runtime.sendMessage({ type: 'CLOSE_SIDE_PANEL_FROM_WEB' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Failed to send side panel close message:', chrome.runtime.lastError);
          } else {
            console.log('Side panel close message sent successfully');
          }
        });
      }
    });

    // Listen for side panel state changes from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SIDE_PANEL_STATE_CHANGED') {
        // Notify web app about side panel state change
        window.postMessage({
          type: 'SIDE_PANEL_STATE',
          source: 'extension',
          isOpen: message.isOpen
        }, '*');
        
        sendResponse({ success: true });
      }
      return true;
    });
  
    // Initial sync after page load (give app a moment to initialize)
    window.addEventListener('load', () => {
      setTimeout(() => {
        if (isExtensionValid()) {
          const session = getSessionFromLocalStorage();
          if (session) sendAuthToBackground(session);
        }
      }, 800);
    });
  
    // Observe changes to localStorage by monkey-patching
    const _setItem = localStorage.setItem;
    localStorage.setItem = function (key, value) {
      const result = _setItem.apply(this, arguments);
      if (key === AUTH_KEY && isExtensionValid()) {
        try {
          const parsed = JSON.parse(value);
          const token = parsed?.access_token || parsed?.currentSession?.access_token;
          const refresh_token = parsed?.refresh_token || parsed?.currentSession?.refresh_token || null;
          const user = parsed?.user || parsed?.currentSession?.user || null;
          if (token) {
            sendAuthToBackground({ token, refresh_token, user });
          } else {
            clearAuthInBackground();
          }
        } catch {
          clearAuthInBackground();
        }
      }
      return result;
    };
  
    const _removeItem = localStorage.removeItem;
    localStorage.removeItem = function (key) {
      const result = _removeItem.apply(this, arguments);
      if (key === AUTH_KEY && isExtensionValid()) {
        clearAuthInBackground();
      }
      return result;
    };
  
    // Fallback polling in case the app writes via IndexedDB or other path
    let lastToken = null;
    const pollInterval = setInterval(() => {
      if (!isExtensionValid()) {
        console.log('Extension context invalidated, stopping polling');
        clearInterval(pollInterval);
        return;
      }
      
      const s = getSessionFromLocalStorage();
      const currentToken = s?.token || null;
      if (currentToken !== lastToken) {
        lastToken = currentToken;
        if (currentToken) sendAuthToBackground(s);
        else clearAuthInBackground();
      }
    }, 2000);
  
    console.log('ChatBot Extension content script active for auth sync');
  })();
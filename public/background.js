// Background script for ChatBot Extension

// Ensure side panel opens on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Store/retrieve auth from chrome.storage.local
const getAuth = () => new Promise((resolve) => {
  chrome.storage.local.get(["authToken", "refreshToken", "user"], (result) => resolve(result));
});

const setAuth = (token, user, refreshToken) => new Promise((resolve) => {
  chrome.storage.local.set({ authToken: token, refreshToken: refreshToken || null, user }, () => resolve());
});

const clearAuth = () => new Promise((resolve) => {
  chrome.storage.local.remove(["authToken", "refreshToken", "user"], () => resolve());
});

// Broadcast auth state changes to all tabs and side panel
async function broadcastAuthChange(authenticated) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "AUTH_STATE_CHANGED", authenticated }).catch(() => {});
      }
    }
    // Also notify extension pages (side panel)
    chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", authenticated }).catch(() => {});
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("ChatBot Extension installed");
});

// Handle messages from content script / UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request?.type === "GET_AUTH_STATUS") {
      const { authToken, refreshToken, user } = (await getAuth()) || {};
      sendResponse({ success: true, authenticated: !!authToken, token: authToken, refreshToken, user });
      return;
    }

    if (request?.type === "STORE_AUTH") {
      await setAuth(request.token, request.user ?? null, request.refreshToken ?? null);
      await broadcastAuthChange(true);
      sendResponse({ success: true });
      return;
    }

    if (request?.type === "CLEAR_AUTH") {
      await clearAuth();
      await broadcastAuthChange(false);
      sendResponse({ success: true });
      return;
    }

    if (request?.type === "OPEN_SIDE_PANEL") {
      console.log('Background script opening side panel with page:', request.page);
      
      try {
        // Store the requested page globally for the tab
        await chrome.storage.local.set({ 
          [`requestedPage_${sender.tab.id}`]: request.page || 'chatbot',
          requestedPage: request.page || 'chatbot' // fallback for general use
        });
        
        // Set the side panel path based on the requested page
        const panelPath = request.page === 'dashboard' ? 'dashboard.html' : 'index.html';
        
        // Update the side panel path for this tab BEFORE opening
        await chrome.sidePanel.setOptions({
          tabId: sender.tab.id,
          path: panelPath,
          enabled: true
        });
        
        // Open immediately without delay to preserve user gesture
        await chrome.sidePanel.open({ windowId: sender.tab.windowId });
        console.log('Side panel opened successfully with path:', panelPath);
        
        // Notify all tabs about state change
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'SIDE_PANEL_STATE_CHANGED',
          isOpen: true
        }).catch(() => {});
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('Failed to set up side panel:', error);
        sendResponse({ success: false, error: error.message });
      }
      return;
    }

    if (request?.type === "CLOSE_SIDE_PANEL") {
      console.log('Background script closing side panel');
      
      try {
        // Chrome doesn't have a direct close API, but we can track state
        console.log('Side panel close requested');
        
        // Notify all tabs about state change
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'SIDE_PANEL_STATE_CHANGED',
          isOpen: false
        }).catch(() => {});
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('Failed to close side panel:', error);
        sendResponse({ success: false, error: error.message });
      }
      return;
    }

    if (request?.type === "CLOSE_SIDE_PANEL_FROM_WEB") {
      console.log('Background script received close request from web app');
      
      try {
        // Since Chrome doesn't have a direct API to close side panels,
        // we'll use a different approach - send message to all extension contexts
        chrome.runtime.sendMessage({ type: 'CLOSE_SIDE_PANEL_INTERNAL' }).catch((error) => {
          console.log('Message send error (expected):', error);
        });
        
        // Simpler approach - just broadcast the message and let the side panel handle it
        console.log('Broadcasting close message to all extension contexts');
        
        // Notify all tabs about state change
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'SIDE_PANEL_STATE_CHANGED',
          isOpen: false
        }).catch(() => {});
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('Failed to close side panel from web:', error);
        sendResponse({ success: false, error: error.message });
      }
      return;
    }

    sendResponse({ success: false, error: "unknown_request" });
  })();
  return true; // keep the message channel open for async
});

// Also react to storage changes directly
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("authToken" in changes)) {
    const authenticated = !!changes.authToken?.newValue;
    broadcastAuthChange(authenticated);
  }
});

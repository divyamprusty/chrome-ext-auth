import { SessionMessage } from './types';

// Do NOT import Supabase client here

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const message = msg as SessionMessage;
  if (message.type === 'SYNC_TOKEN') {
    console.log("Background received token: ", message.token);
    chrome.storage.local.set({ supabase_token: message.token }, () => {
      chrome.tabs.query({ url: 'http://localhost:5173/*' }, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) chrome.tabs.sendMessage(tab.id, message);
        }
        sendResponse({ status: 'ok' });
      });
    });
    return true;
  }
});
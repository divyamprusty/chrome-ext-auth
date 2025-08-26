import { SessionMessage } from './types';

// On inject, replay stored token to the page so the web app can restore session
chrome.storage.local.get('supabase_token', ({ supabase_token }) => {
  if (supabase_token) {
    const msg: SessionMessage = { type: 'SYNC_TOKEN', source: 'extension', token: supabase_token };
    window.postMessage(msg, window.origin);
  }
});

// Page → background
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data as SessionMessage;
  if (msg?.type === 'SYNC_TOKEN') {
    chrome.runtime.sendMessage(msg);
  }
});

// Background → page
chrome.runtime.onMessage.addListener((msg: unknown) => {
  const message = msg as SessionMessage;
  if (message.type === 'SYNC_TOKEN') {
    window.postMessage(message, window.origin);
  }
});
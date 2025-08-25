import { SessionMessage } from './types';

// Only handle messaging, do NOT use supabase client here

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data as SessionMessage;
  if (msg?.type === 'SYNC_TOKEN') {
    console.log("Content script forwarding:", msg);
    chrome.runtime.sendMessage(msg);
  }
});

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const message = msg as SessionMessage;
  if (message.type === 'SYNC_TOKEN') {
    window.postMessage(message, window.origin);
  }
});

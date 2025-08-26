import { SessionMessage } from './types';

// One-way: page → background only
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data as SessionMessage;
  if (msg?.type === 'SYNC_TOKEN') {
    console.log("[content] page -> background SYNC_TOKEN, source:", msg.source, "hasToken:", !!msg.token);
    chrome.runtime.sendMessage(msg);
  }
});
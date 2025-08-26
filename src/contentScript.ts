import { SessionMessage } from './types';

// window.addEventListener('message', (event) => {
//   if (event.source !== window) return;
//   const msg = event.data as SessionMessage;
//   if (msg?.type === 'SYNC_TOKEN') {
//     console.log('Content script forwarding:', msg);
//     chrome.runtime.sendMessage(msg);
//   }
// });

// chrome.runtime.onMessage.addListener((msg: unknown) => {
//   const message = msg as SessionMessage;
//   if (message.type === 'SYNC_TOKEN') {
//     console.log('Content script to page:', message);
//     window.postMessage(message, window.origin);
//   }
// });

chrome.storage.local.get('supabase_token', ({ supabase_token }) => {
  if (supabase_token) {
    const msg: SessionMessage = { type: 'SYNC_TOKEN', source: 'extension', token: supabase_token };
    window.postMessage(msg, window.origin);
  }
});

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data as SessionMessage;
  if (msg?.type === 'SYNC_TOKEN') {
    chrome.runtime.sendMessage(msg);
  }
});

// background → page
chrome.runtime.onMessage.addListener((msg: unknown) => {
  const message = msg as SessionMessage;
  if (message.type === 'SYNC_TOKEN') {
    window.postMessage(message, window.origin);
  }
});
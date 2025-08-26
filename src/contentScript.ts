import { SessionMessage } from './types';

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data as SessionMessage;
  if (msg?.type === 'SYNC_TOKEN') {
    console.log('Content script forwarding:', msg);
    chrome.runtime.sendMessage(msg);
  }
});

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const message = msg as SessionMessage;
  if (message.type === 'SYNC_TOKEN') {
    console.log('Content script to page:', message);
    window.postMessage(message, window.origin);
  }
});
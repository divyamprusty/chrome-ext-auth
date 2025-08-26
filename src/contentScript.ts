import { SessionMessage } from './types';

function isRuntimeAvailable(): boolean {
  try {
    // chrome may exist but runtime can be invalidated
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  } catch {
    return false;
  }
}

// Only handle messaging, do NOT use supabase client here
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data as SessionMessage;
  if (msg?.type === 'SYNC_TOKEN') {
    console.log("Content script forwarding:", msg);
    if (!isRuntimeAvailable()) return;
    try {
      chrome.runtime.sendMessage(msg);
    } catch (_e) {
      // Ignore if extension context was invalidated; a page refresh will reinject us.
    }
  }
});

if (isRuntimeAvailable()) {
  chrome.runtime.onMessage.addListener((msg: unknown) => {
    const message = msg as SessionMessage;
    if (message.type === 'SYNC_TOKEN') {
      // Safe; window.postMessage doesn't require extension context
      window.postMessage(message, window.origin);
    }
  });
}
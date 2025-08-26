import { SessionMessage } from './types';

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const message = msg as SessionMessage;
  if (message.type !== 'SYNC_TOKEN') return;

  console.log("[bg] received SYNC_TOKEN from:", message.source, "hasToken:", !!message.token);

  chrome.storage.local.set({ supabase_token: message.token }, () => {
    console.log("[bg] stored supabase_token, relaying to runtime contexts (popup)");
    try {
      chrome.runtime.sendMessage(message, () => { void chrome.runtime.lastError; });
    } catch (e) {
      console.warn("[bg] runtime.sendMessage error (ignored):", e);
    }
    sendResponse({ status: 'ok' });
  });

  return true;
});
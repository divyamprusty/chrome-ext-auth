import { SessionMessage } from './types';

const WEB_APP_URL_PATTERNS = ['http://localhost/*', 'http://127.0.0.1/*'];

function sendRuntimeMessageSafe(message: SessionMessage): void {
	try {
		chrome.runtime.sendMessage(message, () => { void chrome.runtime.lastError; });
	} catch {}
}

function sendMessageToTabSafe(tabId: number, message: SessionMessage): Promise<void> {
	return new Promise((resolve) => {
		try {
			chrome.tabs.sendMessage(tabId, message, () => { void chrome.runtime.lastError; resolve(); });
		} catch { resolve(); }
	});
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
	const message = msg as SessionMessage;
	if (message.type !== 'SYNC_TOKEN') return;

	console.log('[bg] received', message);

	chrome.storage.local.set({ supabase_token: message.token }, async () => {
		// Notify extension contexts (popup) if any are open
		sendRuntimeMessageSafe(message);

		// Notify all matching web app tabs
		const queries = WEB_APP_URL_PATTERNS.map(
			(url) =>
				new Promise<void>((res) =>
					chrome.tabs.query({ url }, async (tabs) => {
						console.log('[bg] query', url, tabs.map(t => t.url));
						for (const tab of tabs) {
							if (tab.id) await sendMessageToTabSafe(tab.id, message);
						}
						res();
					})
				)
		);

		await Promise.all(queries);
		sendResponse({ status: 'ok' });
	});

	return true;
});
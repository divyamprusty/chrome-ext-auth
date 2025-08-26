import { SessionMessage } from './types';

const WEB_APP_URL_PATTERNS = ['http://localhost:5173/*', 'http://127.0.0.1:5173/*'];

function sendRuntimeMessageSafe(message: SessionMessage): void {
	try {
		chrome.runtime.sendMessage(message, () => {
			void chrome.runtime.lastError;
		});
	} catch {
		// ignore - no receiver (e.g., popup not open)
	}
}

function sendMessageToTabSafe(tabId: number, message: SessionMessage): Promise<void> {
	return new Promise((resolve) => {
		try {
			chrome.tabs.sendMessage(tabId, message, () => {
				void chrome.runtime.lastError;
				resolve();
			});
		} catch {
			resolve();
		}
	});
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
	const message = msg as SessionMessage;
	if (message.type !== 'SYNC_TOKEN') return;

	chrome.storage.local.set({ supabase_token: message.token }, async () => {
		// notify extension contexts (popup, options) if any are open
		sendRuntimeMessageSafe(message);

		// notify all matching web app tabs; ignore tabs without content scripts
		const queries = WEB_APP_URL_PATTERNS.map(
			(url) =>
				new Promise<void>((res) =>
					chrome.tabs.query({ url }, async (tabs) => {
						for (const tab of tabs) {
							if (tab.id) {
								await sendMessageToTabSafe(tab.id, message);
							}
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
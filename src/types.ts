export interface SessionMessage {
  type: 'SYNC_TOKEN';
  source: 'web' | 'popup' | 'extension';
  token: { access_token: string; refresh_token: string } | null;
}
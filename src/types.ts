export interface SessionMessage {
  type: 'SYNC_TOKEN';
  token: { access_token: string; refresh_token: string } | null;
}
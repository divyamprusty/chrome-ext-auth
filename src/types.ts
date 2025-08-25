export interface SessionMessage {
  type: 'SYNC_TOKEN';
  token: string | null;
}
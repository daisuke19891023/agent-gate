export type DaemonRequest =
  | { type: 'status' }
  | { type: 'stop' }
  | { type: 'ping' };

export interface DaemonResponse {
  ok: boolean;
  status: 'running' | 'stopped' | 'not_found';
  pid?: number;
  startedAt?: string;
  message?: string;
}

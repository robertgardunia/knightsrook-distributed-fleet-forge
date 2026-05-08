export interface XApiStatement {
  id:        string;
  actor:     { objectType: 'Agent'; name: string; mbox: string };
  authority: { objectType: 'Agent'; name: string; mbox: string };
  verb:      { id: string; display: { 'en-US': string } };
  object:    { objectType: 'Activity'; id: string; definition: { name: { 'en-US': string } } };
  timestamp: string;
  context:   { platform: string; extensions: Record<string, unknown> };
}

// NOTE: AuthMethod / AuthPathConfig are temporary guests — they belong in a
// future @knightsrook/auth package once real auth logic exists to justify it.
export type AuthMethod = 'qr' | 'moodle';
// future: 'card' | 'pin' | 'sso'

export type NodeRole = 'homebase' | 'station-controller' | 'game-kiosk' | 'info-kiosk';

export interface AuthPathConfig {
  methods:        AuthMethod[];
  allowAnonymous: boolean;
}

export interface LrsConfig {
  endpoint: string;
  key:      string;
  secret:   string;
}

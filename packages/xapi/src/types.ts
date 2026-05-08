export interface XApiStatement {
  id:        string;
  actor:     { objectType: 'Agent'; name: string; mbox: string };
  authority: { objectType: 'Agent'; name: string; mbox: string };
  verb:      { id: string; display: { 'en-US': string } };
  object:    { objectType: 'Activity'; id: string; definition: { name: { 'en-US': string } } };
  timestamp: string;
  context:   { platform: string; extensions: Record<string, unknown> };
}

export type AuthMethod = 'qr' | 'moodle';
// future: 'card' | 'pin' | 'sso'

export type NodeRole = 'homebase' | 'station-controller' | 'game-kiosk' | 'info-kiosk';

export interface AuthPathConfig {
  /** Which sign-in methods are available at this node type. Empty = no auth UI. */
  methods: AuthMethod[];
  /**
   * Whether the node functions without any sign-in.
   * false = a session must be established before activity is recorded.
   */
  allowAnonymous: boolean;
}

export interface LrsConfig {
  endpoint: string;
  key:      string;
  secret:   string;
}

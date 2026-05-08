/**
 * Auth path configuration — controls which sign-in methods are offered
 * at each node type.
 *
 * Used by EmulatePanel to decide which login options to present.
 * Future: kiosk agents will read an equivalent config to enforce
 * at the machine level (reject sessions that didn't go through an
 * allowed method).
 */

export type AuthMethod =
  | 'qr'      // scan a QR code (temp ID or pre-printed card)
  | 'moodle'; // username + password validated against Moodle
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

export const AUTH_PATHS: Record<NodeRole, AuthPathConfig> = {
  'homebase': {
    methods: [],
    allowAnonymous: true,
  },
  'station-controller': {
    methods: [],
    allowAnonymous: true,
  },
  'game-kiosk': {
    methods: ['qr', 'moodle'],
    allowAnonymous: false,
  },
  'info-kiosk': {
    methods: ['qr'],
    allowAnonymous: true,
  },
};

export function getAuthConfig(role: NodeRole): AuthPathConfig {
  return AUTH_PATHS[role] ?? { methods: [], allowAnonymous: true };
}

import type { AuthMethod, AuthPathConfig, NodeRole } from './types.js';

export const AUTH_PATHS: Record<NodeRole, AuthPathConfig> = {
  'homebase': {
    methods:        [],
    allowAnonymous: true,
  },
  'station-controller': {
    methods:        [],
    allowAnonymous: true,
  },
  'game-kiosk': {
    methods:        ['qr', 'moodle'] as AuthMethod[],
    allowAnonymous: false,
  },
  'info-kiosk': {
    methods:        ['qr'] as AuthMethod[],
    allowAnonymous: true,
  },
};

export function getAuthConfig(role: NodeRole): AuthPathConfig {
  return AUTH_PATHS[role] ?? { methods: [], allowAnonymous: true };
}

// NOTE: auth config is temporarily housed here for convenience but does not
// belong in the xAPI package. When Moodle (or any real auth) is implemented,
// extract this file — along with AuthMethod / AuthPathConfig from types.ts —
// into a dedicated @knightsrook/auth workspace package.
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
    methods:        ['qr'] as AuthMethod[],
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

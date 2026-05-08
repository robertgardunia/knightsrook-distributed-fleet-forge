import type { XApiStatement } from './types.js';

export const FLEET_ORIGIN  = 'https://fleet.teamsteamnation.org';
export const ACTIVITY_BASE = 'https://teamsteamnation.org/activities';

export const VERBS: Record<string, { id: string; display: string }> = {
  initialized: { id: 'http://adlnet.gov/expapi/verbs/initialized', display: 'Initialized' },
  launched:    { id: 'http://adlnet.gov/expapi/verbs/launched',    display: 'Launched'    },
  progressed:  { id: 'http://adlnet.gov/expapi/verbs/progressed',  display: 'Progressed'  },
  completed:   { id: 'http://adlnet.gov/expapi/verbs/completed',   display: 'Completed'   },
  exited:      { id: 'http://adlnet.gov/expapi/verbs/exited',      display: 'Exited'      },
  experienced: { id: 'http://adlnet.gov/expapi/verbs/experienced', display: 'Experienced' },
  interacted:  { id: 'http://adlnet.gov/expapi/verbs/interacted',  display: 'Interacted'  },
};

export function toMbox(id: string): string {
  if (id.includes('@')) return id.startsWith('mailto:') ? id : `mailto:${id}`;
  return `mailto:${id.toLowerCase().replace(/[^a-z0-9._+-]/g, '-')}@teamsteamnation.org`;
}

export interface BuildStatementParams {
  actorName: string;
  actorId:   string;
  verbKey:   string;
  objectId:  string;
  label:     string;
  nodeId:    string;
  platform?: string;
  ext?:      Record<string, unknown>;
}

export function buildStatement(p: BuildStatementParams): XApiStatement {
  const verb     = VERBS[p.verbKey] ?? { id: `${FLEET_ORIGIN}/verbs/${p.verbKey}`, display: p.verbKey };
  const mbox     = toMbox(p.actorId);
  const platform = p.platform ?? 'KnightsRook Fleet';
  return {
    id:        crypto.randomUUID(),
    actor:     { objectType: 'Agent', name: p.actorName, mbox },
    authority: { objectType: 'Agent', name: platform, mbox },
    verb:      { id: verb.id, display: { 'en-US': verb.display } },
    object:    { objectType: 'Activity', id: p.objectId, definition: { name: { 'en-US': p.label } } },
    timestamp: new Date().toISOString(),
    context: {
      platform,
      extensions: {
        [`${FLEET_ORIGIN}/ext/nodeId`]:  p.nodeId,
        [`${FLEET_ORIGIN}/ext/station`]: p.nodeId.split('-')[0],
        ...(p.ext ?? {}),
      },
    },
  };
}

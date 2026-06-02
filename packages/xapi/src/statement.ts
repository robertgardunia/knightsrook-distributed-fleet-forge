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

// System authority mbox — used as the asserting agent in every statement.
// Never the actor's own mbox; LRS overwrites authority on ingest anyway.
export const PLATFORM_MBOX = 'mailto:fleet@teamsteamnation.org';

export function toMbox(id: string): string {
  if (id.includes('@')) return id.startsWith('mailto:') ? id : `mailto:${id}`;
  return `mailto:${id.toLowerCase().replace(/[^a-z0-9._+-]/g, '-')}@teamsteamnation.org`;
}

/** Returns true if `s` is a valid TSN seed (16-char lowercase hex). */
export function isTsnSeed(s: string): boolean {
  return /^[0-9a-f]{16}$/.test(s);
}

export interface BuildStatementParams {
  actorName:    string;
  actorId:      string;
  verbKey:      string;
  activitySlug: string;  // e.g. 'hexgl', 'info-kiosk/slideshow'
  eventCode:    string;  // e.g. 'summer26'
  eventName:    string;  // e.g. 'dallas-camp'
  platform?:    string;
}

export function buildStatement(p: BuildStatementParams): XApiStatement {
  const verb     = VERBS[p.verbKey] ?? { id: `${FLEET_ORIGIN}/verbs/${p.verbKey}`, display: p.verbKey };
  const mbox     = toMbox(p.actorId);
  const platform = p.platform ?? 'KnightsRook Fleet';
  return {
    id:        crypto.randomUUID(),
    actor:     { objectType: 'Agent', name: p.actorName.toLowerCase(), mbox },
    authority: { objectType: 'Agent', name: platform, mbox: PLATFORM_MBOX },
    verb:      { id: verb.id, display: { 'en-US': verb.display } },
    object:    {
      objectType: 'Activity',
      id:         `${ACTIVITY_BASE}/${p.eventCode}/${p.activitySlug}`,
      definition: { name: { 'en-US': `${p.eventCode}-${p.eventName}` } },
    },
    timestamp: new Date().toISOString(),
  };
}

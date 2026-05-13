export interface MoodleConfig {
  endpoint: string;  // e.g. https://moodle.example.com
  token:    string;  // Moodle web service token
}

// Requests n pre-generated pending account codes from Moodle.
// Actual wsfunction requires a custom Moodle plugin — endpoint TBD.
export async function requestCodes(
  config:   MoodleConfig,
  kioskId:  string,
  count:    number,
): Promise<string[]> {
  const url = `${config.endpoint}/webservice/rest/server.php`;
  const body = new URLSearchParams({
    wstoken:            config.token,
    wsfunction:         'local_knightsrook_request_codes',
    moodlewsrestformat: 'json',
    kioskid:            kioskId,
    count:              String(count),
  });
  const res  = await fetch(url, { method: 'POST', body });
  const data = await res.json() as { codes: string[] };
  return data.codes;
}

export interface OfflineSyncEntry {
  code:        string;
  kioskId:     string;
  generatedAt: number;
}

// Sends offline-generated codes to Moodle so it can create pending accounts.
export async function syncOfflineCodes(
  config:  MoodleConfig,
  entries: OfflineSyncEntry[],
): Promise<void> {
  const url = `${config.endpoint}/webservice/rest/server.php`;
  const body = new URLSearchParams({
    wstoken:            config.token,
    wsfunction:         'local_knightsrook_sync_offline_codes',
    moodlewsrestformat: 'json',
    codes:              JSON.stringify(entries),
  });
  await fetch(url, { method: 'POST', body });
}

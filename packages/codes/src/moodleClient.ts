export interface MoodleConfig {
  endpoint: string;  // e.g. https://moodle.example.com
  token:    string;  // Moodle web service token
}

// Pending account — code is the temp LRS identity (mbox key).
// email/name drive card delivery and will be used by the LRS updater
// to re-assign xAPI records to the real Moodle user once registration completes.
export interface PendingAccount {
  code:  string;
  email: string | null;
  name:  string | null;
}

// Requests n pending accounts from Moodle.
// Actual wsfunction requires a custom Moodle plugin — endpoint TBD.
export async function requestAccounts(
  config:  MoodleConfig,
  kioskId: string,
  count:   number,
): Promise<PendingAccount[]> {
  const url = `${config.endpoint}/webservice/rest/server.php`;
  const body = new URLSearchParams({
    wstoken:            config.token,
    wsfunction:         'local_knightsrook_request_accounts',
    moodlewsrestformat: 'json',
    kioskid:            kioskId,
    count:              String(count),
  });
  const res  = await fetch(url, { method: 'POST', body });
  const data = await res.json() as { accounts: PendingAccount[] };
  return data.accounts;
}

export interface OfflineSyncEntry {
  code:        string;
  kioskId:     string;
  generatedAt: number;
  email:       string | null;
  name:        string | null;
}

// Sends offline-generated accounts to Moodle for pending account creation.
// Moodle will email the code to the user if email is present.
export async function syncOfflineAccounts(
  config:  MoodleConfig,
  entries: OfflineSyncEntry[],
): Promise<void> {
  const url = `${config.endpoint}/webservice/rest/server.php`;
  const body = new URLSearchParams({
    wstoken:            config.token,
    wsfunction:         'local_knightsrook_sync_offline_accounts',
    moodlewsrestformat: 'json',
    accounts:           JSON.stringify(entries),
  });
  await fetch(url, { method: 'POST', body });
}

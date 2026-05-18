type AppRecord = {
  id: string;
  name: string;
  slug: string;
  app_type: string;
  visibility: string;
  status: string;
  production_url: string | null;
  updated_at: string;
};

type DeploymentRecord = {
  id: string;
  environment: string;
  deployment_url: string | null;
  status: string;
  started_at: string;
  apps?: { name: string } | null;
};

type SystemSnapshot = {
  gateway_status: string | null;
  gateway_version: string | null;
  cli_version: string | null;
  model: string | null;
  sessions_active: number | null;
  collected_at: string;
};

type CronJob = {
  name: string;
  schedule: string;
  timezone: string;
  next_run_text: string | null;
  last_run_text: string | null;
  status: string | null;
  model: string | null;
};

type WatchedFile = {
  id: string;
  label: string;
  path: string;
  is_active: boolean;
  file_snapshots?: Array<{
    byte_size: number;
    modified_at: string | null;
    collected_at: string;
  }>;
};

type Alert = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  status: string;
  created_at: string;
};

async function supabase<T>(path: string): Promise<T[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return [];

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.error(`Supabase read failed for ${path}: ${response.status}`);
    return [];
  }

  return response.json();
}

function fmt(value: string | null | undefined) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Denver',
  }).format(new Date(value));
}

function statusClass(status?: string | null) {
  if (status === 'ok' || status === 'active' || status === 'ready') return 'ok';
  if (status === 'critical' || status === 'failed') return 'critical';
  return 'warning';
}

export default async function Dashboard() {
  const [snapshots, cronJobs, files, apps, deployments, alerts] = await Promise.all([
    supabase<SystemSnapshot>('system_snapshots?select=*&order=collected_at.desc&limit=1'),
    supabase<CronJob>('cron_jobs?select=*&order=name.asc'),
    supabase<WatchedFile>('watched_files?select=*,file_snapshots(byte_size,modified_at,collected_at)&is_active=eq.true&order=label.asc&file_snapshots.order=collected_at.desc&file_snapshots.limit=1'),
    supabase<AppRecord>('apps?select=*&order=updated_at.desc'),
    supabase<DeploymentRecord>('deployments?select=*,apps(name)&order=started_at.desc&limit=8'),
    supabase<Alert>('alerts?select=*&status=eq.open&order=created_at.desc&limit=8'),
  ]);

  const snapshot = snapshots[0];

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">Mission Control</div>
          <div className="subtle">OpenClaw App Factory v0.1</div>
        </div>
        <div className="subtle">Last snapshot: {fmt(snapshot?.collected_at)}</div>
      </header>

      <div className="content grid">
        <section className="grid cols-4">
          <div className="panel metric">
            <span className="subtle">Gateway</span>
            <span className={`badge ${statusClass(snapshot?.gateway_status)}`}>{snapshot?.gateway_status || 'unknown'}</span>
          </div>
          <div className="panel metric">
            <span className="subtle">Model</span>
            <span className="metric-value">{snapshot?.model || 'n/a'}</span>
          </div>
          <div className="panel metric">
            <span className="subtle">Sessions</span>
            <span className="metric-value">{snapshot?.sessions_active ?? 'n/a'}</span>
          </div>
          <div className="panel metric">
            <span className="subtle">Apps</span>
            <span className="metric-value">{apps.length}</span>
          </div>
        </section>

        <section className="grid cols-2">
          <div className="panel">
            <h2>Cron Jobs</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Schedule</th>
                  <th>Last</th>
                  <th>Next</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cronJobs.map((job) => (
                  <tr key={job.name}>
                    <td>{job.name}</td>
                    <td>{job.schedule} @ {job.timezone}</td>
                    <td>{fmt(job.last_run_text)}</td>
                    <td>{fmt(job.next_run_text)}</td>
                    <td><span className={`badge ${statusClass(job.status)}`}>{job.status || 'unknown'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h2>Watched Files</h2>
            <div className="file-list">
              {files.map((file) => {
                const latest = file.file_snapshots?.[0];
                return (
                  <div className="file-row" key={file.id}>
                    <div>
                      <strong>{file.label}</strong>
                      <div className="subtle">{file.path}</div>
                    </div>
                    <div className="subtle">{latest ? `${latest.byte_size} bytes · ${fmt(latest.modified_at)}` : 'no snapshot'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid cols-2">
          <div className="panel">
            <h2>Apps</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Visibility</th>
                  <th>Status</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id}>
                    <td>{app.name}</td>
                    <td>{app.app_type}</td>
                    <td>{app.visibility}</td>
                    <td><span className={`badge ${statusClass(app.status)}`}>{app.status}</span></td>
                    <td>{app.production_url ? <a href={app.production_url}>{app.production_url}</a> : 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h2>Deployments</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>App</th>
                  <th>Env</th>
                  <th>Status</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((deployment) => (
                  <tr key={deployment.id}>
                    <td>{deployment.apps?.name || 'n/a'}</td>
                    <td>{deployment.environment}</td>
                    <td><span className={`badge ${statusClass(deployment.status)}`}>{deployment.status}</span></td>
                    <td>{fmt(deployment.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Open Alerts</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Title</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td><span className={`badge ${statusClass(alert.severity)}`}>{alert.severity}</span></td>
                  <td>{alert.title}</td>
                  <td>{alert.status}</td>
                  <td>{fmt(alert.created_at)}</td>
                </tr>
              ))}
              {!alerts.length && (
                <tr>
                  <td colSpan={4} className="subtle">No open alerts.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}


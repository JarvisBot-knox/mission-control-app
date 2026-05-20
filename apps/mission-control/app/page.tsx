import Link from 'next/link';
import { formatDateTime, formatNumber, statusTone } from '../lib/format.ts';
import { readMissionControlDashboard, type DashboardViewModel } from '../lib/mission-control-data.ts';
import { JarvisParticleCore } from './components/JarvisParticleCore.tsx';

export const dynamic = 'force-dynamic';

const particleIndexes = Array.from({ length: 72 }, (_, index) => index);

function primarySignal(dashboard: DashboardViewModel) {
  if (dashboard.metrics.pendingApprovals > 0) return 'Approval gate open';
  if (dashboard.metrics.activeBuilds > 0) return 'Build sequence active';
  if (dashboard.metrics.openAlerts > 0) return 'Exception detected';
  return 'All systems nominal';
}

function latestBuild(dashboard: DashboardViewModel) {
  return dashboard.buildJobs[0] || null;
}

function latestCommand(dashboard: DashboardViewModel) {
  return dashboard.commandRequests[0] || null;
}

function compactStatus(value: string | null | undefined) {
  return value || 'unknown';
}

export default async function Dashboard() {
  const dashboard = await readMissionControlDashboard();
  const build = latestBuild(dashboard);
  const command = latestCommand(dashboard);
  const nextCron = dashboard.cronJobs[0];

  return (
    <main className="stark-shell">
      <div className="depth-grid" aria-hidden="true" />
      <div className="particle-mesh" aria-hidden="true">
        {particleIndexes.map((index) => <span key={index} />)}
      </div>

      <header className="cockpit-header">
        <div>
          <span className="micro-label">OpenClaw App Factory</span>
          <h1>JARVIS Mission Control</h1>
        </div>
        <div className="header-readouts" aria-label="System status">
          <div><span>Gateway</span><strong>{dashboard.health.gatewayStatus}</strong></div>
          <div><span>Model</span><strong>{dashboard.health.model}</strong></div>
          <div><span>Telemetry</span><strong>{formatDateTime(dashboard.health.lastSnapshotAt)}</strong></div>
        </div>
      </header>

      <nav className="section-nav" aria-label="Mission Control sections">
        <Link href="/approvals">Approvals</Link>
        <Link href="/learnings">Learnings</Link>
        {build && <Link href={`/jobs/${build.id}`}>Latest Job</Link>}
      </nav>

      <section className="command-path" aria-label="Telegram to OpenClaw build path">
        <div className="path-copy">
          <span className="micro-label">Build Command Loop</span>
          <h2>Telegram request to Supabase and Vercel execution</h2>
        </div>
        <div className="path-steps">
          <div><span>01</span><strong>Telegram</strong><small>request channel</small></div>
          <div><span>02</span><strong>OpenClaw</strong><small>command worker</small></div>
          <div><span>03</span><strong>Supabase</strong><small>state and approvals</small></div>
          <div><span>04</span><strong>Vercel</strong><small>preview and production</small></div>
        </div>
        <div className="path-status">
          <span className={`status-pill ${dashboard.metrics.pendingCommands ? 'warning' : 'ok'}`}>{dashboard.metrics.pendingCommands} queued</span>
          <strong>{command?.command_type || 'No command pending'}</strong>
          <small>{command ? `${command.status} / ${formatDateTime(command.requested_at)}` : 'Queue is clear.'}</small>
        </div>
      </section>

      <section className="cockpit-stage" aria-labelledby="mission-core">
        <aside className="side-rail left-rail" aria-label="Mission queue">
          <div className="rail-head">
            <span className="micro-label">Priority Queue</span>
            <strong>{primarySignal(dashboard)}</strong>
          </div>

          <article className="rail-module urgent-module">
            <span className="module-index">01</span>
            <div>
              <h2>Approval Gates</h2>
              <strong>{dashboard.metrics.pendingApprovals}</strong>
              <p>{dashboard.pendingApprovals[0]?.summary || dashboard.pendingApprovals[0]?.requested_action || 'No human gate waiting.'}</p>
            </div>
          </article>

          <article className="rail-module">
            <span className="module-index">02</span>
            <div>
              <h2>Build Sequence</h2>
              <strong>{dashboard.metrics.activeBuilds}</strong>
              <p>{build ? `${build.title} / ${build.status}` : 'No active build sequence.'}</p>
            </div>
          </article>

          <article className="rail-module">
            <span className="module-index">03</span>
            <div>
              <h2>Exception Stack</h2>
              <strong>{dashboard.metrics.openAlerts}</strong>
              <p>{dashboard.alerts[0]?.title || dashboard.readErrors[0]?.section || 'No open alerts.'}</p>
            </div>
          </article>
        </aside>

        <section className="command-core" aria-labelledby="mission-core">
          <div className="orbital-map" aria-hidden="true">
            <span className="orbit orbit-a" />
            <span className="orbit orbit-b" />
            <span className="orbit orbit-c" />
            <span className="orbit-node node-build">Build</span>
            <span className="orbit-node node-usage">Usage</span>
            <span className="orbit-node node-cron">Cron</span>
            <span className="orbit-node node-learn">Learn</span>
          </div>

          <div className="reactor-core-wrap" aria-hidden="true">
            <JarvisParticleCore />
            <div className="hologram-vignette" />
          </div>

          <div className="core-copy">
            <span className={`status-pill ${statusTone(dashboard.health.gatewayStatus)}`}>{primarySignal(dashboard)}</span>
            <h2 id="mission-core">Command core online</h2>
            <p>Execution remains Telegram-first. This surface is the operating picture: approvals, proof, health, usage, repairs, and learning state.</p>
          </div>

          <div className="heartbeat-line" aria-label="System heartbeat">
            <span />
            <i />
            <i />
            <i />
            <i />
            <i />
            <strong>heartbeat stable</strong>
          </div>
        </section>

        <aside className="side-rail right-rail" aria-label="System telemetry">
          <div className="rail-head">
            <span className="micro-label">OpenClaw Core</span>
            <strong>{compactStatus(dashboard.health.gatewayVersion)}</strong>
          </div>

          <div className="telemetry-stack">
            <div><span>Sessions</span><strong>{dashboard.health.sessionsActive ?? 'n/a'}</strong></div>
            <div><span>Apps</span><strong>{dashboard.metrics.appCount}</strong></div>
            <div><span>Commands</span><strong>{dashboard.metrics.pendingCommands}</strong></div>
            <div><span>Usage Rows</span><strong>{dashboard.metrics.usageRows}</strong></div>
            <div><span>Next Cron</span><strong>{nextCron?.name || 'n/a'}</strong></div>
          </div>

          <article className="usage-readout">
            <span className="micro-label">Token Burn</span>
            <strong>{formatNumber(dashboard.metrics.totalTokens)}</strong>
            <div>
              <span>Input {formatNumber(dashboard.metrics.inputTokens)}</span>
              <span>Output {formatNumber(dashboard.metrics.outputTokens)}</span>
              <span>Cache {formatNumber(dashboard.metrics.cacheReadTokens)}</span>
            </div>
          </article>
        </aside>
      </section>

      <section className="mission-strip" aria-label="Detailed mission state">
        <article className="strip-panel wide">
          <div className="strip-head">
            <span className="micro-label">App Factory</span>
            <h2>Active Builds</h2>
          </div>
          <div className="data-list">
            {dashboard.buildJobs.map((job) => (
              <Link className="data-row" href={`/jobs/${job.id}`} key={job.id}>
                <div><strong>{job.title}</strong><span>{job.slug} / {job.proposed_stack || job.app_type || 'stack pending'}</span></div>
                <span className={`status-pill ${statusTone(job.status)}`}>{job.status}</span>
              </Link>
            ))}
            {!dashboard.buildJobs.length && <div className="empty-line">No build jobs yet.</div>}
          </div>
        </article>

        <article className="strip-panel">
          <div className="strip-head">
            <span className="micro-label">Portfolio</span>
            <h2>Assets</h2>
          </div>
          <div className="data-list compact">
            {dashboard.apps.map((app) => (
              <Link className="data-row" href={`/apps/${app.id}`} key={app.id}>
                <div><strong>{app.name}</strong><span>{app.app_type} / {app.visibility}</span></div>
                <span className={`status-pill ${statusTone(app.status)}`}>{app.status}</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="strip-panel">
          <div className="strip-head">
            <span className="micro-label">Automation</span>
            <h2>Cron</h2>
          </div>
          <div className="data-list compact">
            {dashboard.cronJobs.slice(0, 4).map((job) => (
              <div className="data-row pulse-row" key={job.name}>
                <div><strong>{job.name}</strong><span>{formatDateTime(job.next_run_text)}</span></div>
                <span className={`status-dot ${statusTone(job.status)}`} />
              </div>
            ))}
          </div>
        </article>

        <article className="strip-panel wide">
          <div className="strip-head">
            <span className="micro-label">Self Improvement</span>
            <h2>Repair / Learning</h2>
          </div>
          <div className="dual-feed">
            <div>
              <h3>Repair</h3>
              {dashboard.repairAttempts.slice(0, 3).map((attempt) => (
                <div className="feed-line" key={attempt.id}>{attempt.stage} #{attempt.attempt_number} / {attempt.status}</div>
              ))}
              {!dashboard.repairAttempts.length && <div className="feed-line">No surgical fixes recorded.</div>}
            </div>
            <div>
              <h3>Learning</h3>
              {dashboard.learningProposals.slice(0, 3).map((proposal) => (
                <div className="feed-line" key={proposal.id}>{proposal.title} / {proposal.status}</div>
              ))}
              {!dashboard.learningProposals.length && <div className="feed-line">No proposals pending.</div>}
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

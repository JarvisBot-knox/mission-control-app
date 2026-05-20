import Link from 'next/link';
import { formatDateTime, formatNumber, statusTone } from '../lib/format.ts';
import { readMissionControlDashboard, type DashboardViewModel } from '../lib/mission-control-data.ts';
import { JarvisParticleCore } from './components/JarvisParticleCore.tsx';

export const dynamic = 'force-dynamic';

const WORKFLOW_STAGES = [
  { key: 'requested', label: 'Requested', desc: 'User asks for the site from chat.' },
  { key: 'building', label: 'Building', desc: 'OpenClaw is assembling the build.' },
  { key: 'preview_ready', label: 'Preview', desc: 'Build complete. Preview URL available.' },
  { key: 'deploying', label: 'Deploying', desc: 'Deploy approved and running.' },
  { key: 'live', label: 'Live', desc: 'Site is in production.' },
] as const;

type WorkflowStageKey = typeof WORKFLOW_STAGES[number]['key'];

const STAGE_ORDER: WorkflowStageKey[] = ['requested', 'building', 'preview_ready', 'deploying', 'live'];

const JOB_STATUS_TO_STAGE: Record<string, WorkflowStageKey> = {
  requested: 'requested',
  clarifying: 'requested',
  awaiting_build_approval: 'building',
  build_approved: 'building',
  building: 'building',
  preview_ready: 'preview_ready',
  awaiting_deploy_approval: 'preview_ready',
  deploy_approved: 'deploying',
  deploying: 'deploying',
  live: 'live',
};

function currentStageIndex(jobStatus: string): number {
  const stageKey = JOB_STATUS_TO_STAGE[jobStatus] ?? 'requested';
  return STAGE_ORDER.indexOf(stageKey);
}

function primarySignal(dashboard: DashboardViewModel) {
  if (dashboard.metrics.pendingApprovals > 0) return 'Human gate active';
  if (dashboard.metrics.activeBuilds > 0) return 'Build sequence active';
  if (dashboard.metrics.openAlerts > 0) return 'Exception detected';
  return 'All systems nominal';
}

function primaryStatus(dashboard: DashboardViewModel): string {
  if (dashboard.metrics.pendingApprovals > 0) return 'warn';
  if (dashboard.metrics.openAlerts > 0) return 'danger';
  return 'ok';
}

function reactorLabel(dashboard: DashboardViewModel) {
  if (dashboard.metrics.pendingApprovals > 0) return 'Execution\nPaused';
  if (dashboard.metrics.activeBuilds > 0) return 'Build\nActive';
  return 'Systems\nNominal';
}

function reactorDetail(dashboard: DashboardViewModel) {
  if (dashboard.metrics.pendingApprovals > 0)
    return 'OpenClaw is ready. Holding all side effects until you approve with evidence attached.';
  if (dashboard.metrics.activeBuilds > 0)
    return 'Build sequence is running. Monitor step events and proof artifacts.';
  return 'No pending gates. OpenClaw is standing by for the next Telegram request.';
}

export default async function Dashboard() {
  const dashboard = await readMissionControlDashboard();
  const build = dashboard.buildJobs[0] || null;
  const command = dashboard.commandRequests[0] || null;
  const nextCron = dashboard.cronJobs[0];
  const topApproval = dashboard.pendingApprovals[0];
  const stageIndex = build ? currentStageIndex(build.status) : -1;
  const openAlerts = dashboard.alerts.slice(0, 3);
  const topRepair = dashboard.repairAttempts[0] || null;

  return (
    <div className="jarvis-shell">
      {/* Left nav rail */}
      <aside className="jarvis-rail" aria-label="Navigation rail">
        <div className="reactor-mark" aria-hidden="true">
          <span className="mark-core" />
        </div>
        <nav className="rail-nav" aria-label="Primary navigation">
          <Link href="/" className="rail-btn active">HQ</Link>
          <Link href="/approvals" className="rail-btn">APR</Link>
          <Link href="/learnings" className="rail-btn">LRN</Link>
          {build && <Link href={`/jobs/${build.id}`} className="rail-btn">JOB</Link>}
          <Link href="/apps/placeholder" className="rail-btn">APP</Link>
        </nav>
        <div className="rail-foot">
          <span className={`online-dot ${dashboard.health.gatewayStatus === 'nominal' ? 'green' : 'amber'}`} aria-label="Gateway status" />
          <span className="rail-btn muted">SYS</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="jarvis-main">
        <div className="depth-grid" aria-hidden="true" />

        {/* Alerts banner — only shown when alerts exist */}
        {openAlerts.length > 0 && (
          <section className="alerts-banner" aria-label="Open alerts">
            {openAlerts.map((alert) => (
              <div key={alert.id} className={`alert-row alert-${alert.severity}`}>
                <span className={`status-pill ${alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warn' : 'info'}`}>
                  {alert.severity}
                </span>
                <span className="alert-title">{alert.title}</span>
                <code className="alert-ts">{formatDateTime(alert.created_at)}</code>
              </div>
            ))}
          </section>
        )}

        {/* Hero + command prompt */}
        <header className="jarvis-hero">
          <div className="hero-copy">
            <span className="eyebrow-label">Jarvis mission interface / OpenClaw App Factory</span>
            <h1>Command the agent.<br />Verify the outcome.<br />Ship the site.</h1>
            <p className="hero-intro">One live decision, one ranked inbox, one evidence pack — Telegram to production.</p>
          </div>
          <div className="command-panel" aria-label="JARVIS command">
            <div className="cmd-prefix">JARVIS &gt;</div>
            <div className="cmd-value">
              {command
                ? `${command.command_type} — ${command.status}`
                : 'Awaiting next Telegram request'}
            </div>
            <Link href="/approvals" className="cmd-transmit">Review</Link>
          </div>
        </header>

        {/* Stage: assessment + reactor core + metrics */}
        <section className="jarvis-stage" aria-label="Execution core">

          {/* Jarvis assessment brief */}
          <article className="stage-glass stage-brief" aria-label="Jarvis assessment">
            <div>
              <span className="label-mono">Jarvis assessment</span>
              <h2>
                {dashboard.metrics.pendingApprovals > 0
                  ? 'Approval gate open. Review evidence before executing.'
                  : dashboard.metrics.openAlerts > 0
                    ? 'Exception detected. Inspect alert stack before proceeding.'
                    : 'Queue is clean. Safe to proceed.'}
              </h2>
            </div>
            <p>
              {dashboard.metrics.pendingCommands > 0
                ? `${dashboard.metrics.pendingCommands} pending command${dashboard.metrics.pendingCommands !== 1 ? 's' : ''} in queue. Approval only matters when execution state is deterministic.`
                : 'No pending commands. OpenClaw is standing by.'}
            </p>
            <div className="evidence-stack">
              <div className="ev-row">
                <span className="label-mono">Recommended action</span>
                <strong>
                  {topApproval ? `Approve ${topApproval.approval_type} — ${topApproval.summary || topApproval.requested_action}` : 'No approval gate waiting'}
                </strong>
              </div>
              <div className="ev-row">
                <span className="label-mono">Why it matters</span>
                <strong>State drift makes approval meaningless</strong>
              </div>
              <div className="ev-row">
                <span className="label-mono">Proof required</span>
                <strong>Vercel preview URL / build log / artifact hash</strong>
              </div>
              {dashboard.health.cliVersion && (
                <div className="ev-row">
                  <span className="label-mono">CLI version</span>
                  <strong>{dashboard.health.cliVersion}</strong>
                </div>
              )}
              {dashboard.health.lastSnapshotAt && (
                <div className="ev-row">
                  <span className="label-mono">Last snapshot</span>
                  <strong>{formatDateTime(dashboard.health.lastSnapshotAt)}</strong>
                </div>
              )}
            </div>
          </article>

          {/* Central arc-reactor */}
          <article className="stage-glass stage-reactor" aria-label="Execution core">
            <div className="reactor-wrap" aria-hidden="true">
              <span className="ring r1" />
              <span className="ring r2" />
              <span className="ring r3" />
              <span className="ring r4" />
              <span className="ring r5" />
              <span className="reactor-cross" />
              <span className="reactor-glow" />
            </div>
            <div className="reactor-overlay">
              <JarvisParticleCore />
            </div>
            <div className="reactor-node">
              <span className={`status-pill ${primaryStatus(dashboard)}`}>{primarySignal(dashboard)}</span>
              <h2 className="reactor-heading">{reactorLabel(dashboard)}</h2>
              <p>{reactorDetail(dashboard)}</p>
            </div>
          </article>

          {/* Metrics column */}
          <aside className="stage-glass stage-metrics" aria-label="System metrics">
            <div className="metric-card">
              <span className="label-mono">Gates</span>
              <strong className="metric-num">{dashboard.metrics.pendingApprovals}</strong>
              <small>Approval{dashboard.metrics.pendingApprovals !== 1 ? 's' : ''} waiting</small>
            </div>
            <div className="metric-card">
              <span className="label-mono">Queued</span>
              <strong className="metric-num">{dashboard.metrics.pendingCommands}</strong>
              <small>Pending commands</small>
            </div>
            <div className="metric-card">
              <span className="label-mono">Gateway</span>
              <strong className="metric-num metric-status">{dashboard.health.gatewayStatus}</strong>
              <small>{dashboard.health.model || 'model pending'}</small>
            </div>
            <div className="metric-card">
              <span className="label-mono">Apps</span>
              <strong className="metric-num">{dashboard.metrics.appCount}</strong>
              <small>Known Vercel apps</small>
            </div>
            <div className="metric-card">
              <span className="label-mono">Tokens</span>
              <strong className="metric-num metric-sm">{formatNumber(dashboard.metrics.totalTokens)}</strong>
              <small>
                {dashboard.metrics.estimatedCost != null
                  ? `~$${dashboard.metrics.estimatedCost.toFixed(2)}`
                  : 'Total burn'}
              </small>
            </div>
          </aside>
        </section>

        {/* Workflow: factory state machine + live trace */}
        <section className="jarvis-workflow" aria-label="Workflow">

          {/* State machine */}
          <article className="stage-glass workflow-machine">
            <div className="panel-head">
              <div>
                <span className="label-mono">Factory state machine</span>
                <h2>Telegram → Production</h2>
              </div>
              <span className={`status-pill ${dashboard.metrics.pendingApprovals ? 'warn' : 'ok'}`}>
                {dashboard.metrics.pendingApprovals ? 'Approval required' : 'Queue clear'}
              </span>
            </div>
            <div className="panel-body">
              <div className="stations">
                {WORKFLOW_STAGES.map((stage, idx) => {
                  const isDone = stageIndex > idx;
                  const isNow = stageIndex === idx;
                  const isPending = stageIndex < idx;
                  const pillClass = isDone ? 'ok' : isNow ? 'warn' : 'info';
                  const pillLabel = isDone ? 'Done' : isNow ? 'Now' : isPending ? 'Next' : 'Pending';
                  return (
                    <div key={stage.key} className={`station${isNow ? ' station-now' : ''}`}>
                      <span className={`status-pill ${pillClass}`}>{pillLabel}</span>
                      <h3>{stage.label}</h3>
                      <p>{stage.desc}</p>
                    </div>
                  );
                })}
              </div>

              {/* Current decision */}
              {topApproval && (
                <div className="decision-row">
                  <div>
                    <span className="label-mono">Current decision</span>
                    <h3>{topApproval.summary || topApproval.requested_action}</h3>
                    <p>
                      Type: {topApproval.approval_type} / Risk: {topApproval.risk_category || 'standard'} /
                      Requested: {formatDateTime(topApproval.requested_at)}
                    </p>
                  </div>
                  <div className="decision-actions">
                    <Link href="/approvals" className="btn-primary">Review approval</Link>
                    <Link href="/approvals" className="btn-ghost">Evidence pack</Link>
                  </div>
                </div>
              )}
              {!topApproval && build && (
                <div className="decision-row">
                  <div>
                    <span className="label-mono">Latest build</span>
                    <h3>{build.title}</h3>
                    <p>
                      Status: {build.status} / Stack: {build.proposed_stack || build.app_type || 'pending'} /
                      Updated: {formatDateTime(build.updated_at)}
                    </p>
                  </div>
                  <div className="decision-actions">
                    <Link href={`/jobs/${build.id}`} className="btn-primary">View job</Link>
                    <Link href="/approvals" className="btn-ghost">Approvals</Link>
                  </div>
                </div>
              )}
              {!topApproval && !build && (
                <div className="decision-row empty-decision">
                  <p>No pending decisions. Queue is clean.</p>
                </div>
              )}
            </div>
          </article>

          {/* Live trace */}
          <article className="stage-glass workflow-trace">
            <div className="panel-head">
              <div>
                <span className="label-mono">Live trace</span>
                <h2>Agent activity</h2>
              </div>
              <span className="status-pill info">Auditable</span>
            </div>
            <div className="panel-body trace-list">
              {dashboard.commandRequests.slice(0, 6).map((req) => (
                <div className="trace-row" key={req.id}>
                  <code>{formatDateTime(req.requested_at)}</code>
                  <p>{req.command_type} — {req.status}</p>
                </div>
              ))}
              {!dashboard.commandRequests.length && (
                <div className="trace-row">
                  <code>--:--:--</code>
                  <p>No command activity recorded yet.</p>
                </div>
              )}
            </div>
          </article>
        </section>

        {/* Bottom strip: recent builds + cron + resources */}
        <section className="jarvis-strip" aria-label="Factory data">
          <article className="strip-card wide-card">
            <div className="strip-head">
              <span className="label-mono">App Factory</span>
              <h2>Recent Builds</h2>
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

          <article className="strip-card">
            <div className="strip-head">
              <span className="label-mono">Automation</span>
              <h2>Cron Jobs</h2>
            </div>
            <div className="data-list compact">
              {dashboard.cronJobs.slice(0, 5).map((job) => (
                <div className="data-row pulse-row" key={job.name}>
                  <div><strong>{job.name}</strong><span>{formatDateTime(job.next_run_text)}</span></div>
                  <span className={`status-dot ${statusTone(job.status ?? 'unknown')}`} />
                </div>
              ))}
              {!dashboard.cronJobs.length && <div className="empty-line">No cron jobs.</div>}
            </div>
          </article>

          <article className="strip-card">
            <div className="strip-head">
              <span className="label-mono">Infrastructure</span>
              <h2>App Resources</h2>
            </div>
            <div className="data-list compact">
              {dashboard.resources.slice(0, 5).map((res) => (
                <div className="data-row" key={res.id}>
                  <div>
                    <strong>{res.name}</strong>
                    <span>{res.resource_type} / {res.environment || res.provider}</span>
                  </div>
                  <span className={`status-pill ${statusTone(res.status)}`}>{res.status}</span>
                </div>
              ))}
              {!dashboard.resources.length && <div className="empty-line">No resources tracked.</div>}
            </div>
          </article>
        </section>
      </main>

      {/* Right drawer: ranked reviewer inbox */}
      <aside className="jarvis-drawer" aria-label="Ranked reviewer inbox">
        <header className="drawer-head">
          <span className="label-mono">Ranked reviewer inbox</span>
          <h2>What needs Trevor?</h2>
          <p>Risk-ranked. Highest consequence first. Jarvis explains the move, not just the event.</p>
        </header>

        <section className="drawer-inbox">
          {/* Priority: approvals */}
          {dashboard.pendingApprovals.slice(0, 2).map((approval) => (
            <article className="inbox-card inbox-priority" key={approval.id}>
              <span className="status-pill danger">Decide now</span>
              <h3>{approval.summary || approval.requested_action}</h3>
              <p>{approval.approval_type} / risk: {approval.risk_category || 'standard'}</p>
              <div className="inbox-pairs">
                <div><span className="label-mono">Command</span><strong>{approval.approval_type}</strong></div>
                <div><span className="label-mono">Proof</span><strong>Preview URL</strong></div>
              </div>
              <Link href="/approvals" className="btn-ghost btn-sm">Review</Link>
            </article>
          ))}

          {/* Active builds */}
          {dashboard.buildJobs.slice(0, 2).map((job) => (
            <article className="inbox-card" key={job.id}>
              <span className={`status-pill ${statusTone(job.status)}`}>{job.status}</span>
              <h3>{job.title}</h3>
              <p>{job.proposed_stack || job.app_type || 'stack pending'}</p>
              <div className="inbox-pairs">
                <div><span className="label-mono">Slug</span><strong>{job.slug}</strong></div>
                <div><span className="label-mono">Updated</span><strong>{formatDateTime(job.updated_at)}</strong></div>
              </div>
            </article>
          ))}

          {/* Learnings */}
          {dashboard.learningProposals.slice(0, 1).map((proposal) => (
            <article className="inbox-card" key={proposal.id}>
              <span className="status-pill hot">Learning</span>
              <h3>{proposal.title}</h3>
              <p>{proposal.fix_summary || proposal.root_cause || 'Review and approve to apply to memory.'}</p>
            </article>
          ))}

          {/* Repair attempts */}
          {topRepair && (
            <article className="inbox-card" key={topRepair.id}>
              <span className="status-pill warn">Repair</span>
              <h3>{topRepair.build_jobs?.title || `Repair attempt #${topRepair.attempt_number}`}</h3>
              <p>{topRepair.failure_summary || topRepair.fix_summary || `Stage: ${topRepair.stage} / Status: ${topRepair.status}`}</p>
            </article>
          )}

          {/* Next cron */}
          {nextCron && !dashboard.pendingApprovals.length && !dashboard.buildJobs.length && (
            <article className="inbox-card">
              <span className="status-pill info">Setup</span>
              <h3>Next cron: {nextCron.name}</h3>
              <p>{formatDateTime(nextCron.next_run_text)}</p>
            </article>
          )}

          {!dashboard.pendingApprovals.length && !dashboard.buildJobs.length && !topRepair && !dashboard.learningProposals.length && (
            <div className="empty-line">No items need your attention.</div>
          )}
        </section>

        <footer className="drawer-foot">
          <span className={`status-pill ${dashboard.health.gatewayStatus === 'nominal' ? 'ok' : 'warn'}`}>
            OpenClaw
          </span>
          <span className="status-pill ok">Supabase</span>
          <span className="status-pill info">{dashboard.health.model || 'model'}</span>
          {nextCron && <small className="drawer-cron">Next cron: {nextCron.name}</small>}
          <small className="drawer-cron">
            Sessions: {dashboard.health.sessionsActive ?? 'n/a'} /
            Usage rows: {formatNumber(dashboard.metrics.usageRows)} /
            Alerts: {dashboard.metrics.openAlerts}
          </small>
          {dashboard.usage.estimateNote && (
            <small className="drawer-cron">{dashboard.usage.estimateNote}</small>
          )}
        </footer>
      </aside>
    </div>
  );
}

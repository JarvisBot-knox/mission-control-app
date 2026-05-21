import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requestOpenClawCommand } from '../../actions.ts';
import { formatDateTime, statusTone } from '../../../lib/format.ts';
import { readJobDetail } from '../../../lib/mission-control-data.ts';

export const dynamic = 'force-dynamic';

function CommandButton({
  commandType,
  label,
  jobId,
  targetType,
  targetId,
  riskCategory,
  returnPath,
}: {
  commandType: string;
  label: string;
  jobId: string;
  targetType?: string;
  targetId?: string;
  riskCategory?: string | null;
  returnPath: string;
}) {
  return (
    <form action={requestOpenClawCommand}>
      <input type="hidden" name="commandType" value={commandType} />
      <input type="hidden" name="buildJobId" value={jobId} />
      <input type="hidden" name="targetType" value={targetType || 'build_job'} />
      <input type="hidden" name="targetId" value={targetId || jobId} />
      <input type="hidden" name="riskCategory" value={riskCategory || ''} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <button className="command-button" type="submit">{label}</button>
    </form>
  );
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await readJobDetail(id);
  const job = detail.job;

  if (!job) notFound();

  const returnPath = `/jobs/${job.id}`;

  return (
    <div className="jarvis-shell">
      <aside className="jarvis-rail" aria-label="Navigation rail">
        <div className="reactor-mark" aria-hidden="true"><span className="mark-core" /></div>
        <nav className="rail-nav" aria-label="Primary navigation">
          <Link href="/" className="rail-btn">HQ</Link>
          <Link href="/approvals" className="rail-btn">APR</Link>
          <Link href="/learnings" className="rail-btn">LRN</Link>
          <Link href={`/jobs/${job.id}`} className="rail-btn active">JOB</Link>
        </nav>
        <div className="rail-foot"><span className="online-dot green" /></div>
      </aside>
      <main className="jarvis-main">
      <div className="detail-nav"><Link href="/">Mission Control</Link><Link href="/approvals">Approvals</Link><Link href="/learnings">Learnings</Link></div>

      <header className="detail-hero">
        <span className="micro-label">Build Job</span>
        <h1>{job.title}</h1>
        <div className="detail-meta">
          <span className={`status-pill ${statusTone(job.status)}`}>{job.status}</span>
          <span>{job.slug}</span>
          <span>{job.request_channel}</span>
          <span>{formatDateTime(job.updated_at)}</span>
        </div>
      </header>

      <section className="detail-grid">
        <article className="detail-panel wide">
          <div className="strip-head"><span className="micro-label">Timeline</span><h2>Step Events</h2></div>
          <div className="timeline">
            {detail.steps.map((step) => (
              <div className="timeline-row" key={step.id}>
                <span>{step.sequence}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.stage} / {step.status} / {formatDateTime(step.created_at)}</p>
                  {step.detail && <p>{step.detail}</p>}
                </div>
              </div>
            ))}
            {!detail.steps.length && <div className="empty-line">No step events recorded yet.</div>}
          </div>
        </article>

        <article className="detail-panel">
          <div className="strip-head"><span className="micro-label">Control Surface</span><h2>Request OpenClaw Action</h2></div>
          <div className="command-stack">
            <CommandButton commandType="approve_build" label="Request Build Approval" jobId={job.id} returnPath={returnPath} riskCategory="approval_gate" />
            <CommandButton commandType="approve_deploy" label="Request Deploy Approval" jobId={job.id} returnPath={returnPath} riskCategory="production_deploy" />
            <CommandButton commandType="retry_job" label="Request Surgical Retry" jobId={job.id} returnPath={returnPath} riskCategory="repair" />
            <CommandButton commandType="cancel_job" label="Request Cancel" jobId={job.id} returnPath={returnPath} riskCategory="workflow_control" />
          </div>
          <p className="detail-note">Buttons create pending command requests. OpenClaw must acknowledge and execute them.</p>
        </article>

        <article className="detail-panel">
          <div className="strip-head"><span className="micro-label">Approvals</span><h2>Gates</h2></div>
          <div className="data-list compact">
            {detail.approvals.map((approval) => (
              <div className="data-row" key={approval.id}>
                <div><strong>{approval.approval_type}</strong><span>{approval.requested_action}</span></div>
                <span className={`status-pill ${statusTone(approval.status)}`}>{approval.status}</span>
              </div>
            ))}
            {!detail.approvals.length && <div className="empty-line">No approvals recorded.</div>}
          </div>
        </article>

        <article className="detail-panel">
          <div className="strip-head"><span className="micro-label">Resources</span><h2>External Links</h2></div>
          <div className="data-list compact">
            {detail.resources.map((resource) => (
              <div className="data-row" key={resource.id}>
                <div><strong>{resource.name}</strong><span>{resource.provider} / {resource.resource_type}</span></div>
                {resource.url ? <a href={resource.url}>open</a> : <span className={`status-pill ${statusTone(resource.status)}`}>{resource.status}</span>}
              </div>
            ))}
            {!detail.resources.length && <div className="empty-line">No resources linked.</div>}
          </div>
        </article>

        <article className="detail-panel">
          <div className="strip-head"><span className="micro-label">Proof</span><h2>Artifacts</h2></div>
          <div className="data-list compact">
            {detail.artifacts.map((artifact) => (
              <div className="data-row" key={artifact.id}>
                <div><strong>{artifact.title}</strong><span>{artifact.artifact_type} / {formatDateTime(artifact.created_at)}</span></div>
                {artifact.url ? <a href={artifact.url}>open</a> : <span>stored</span>}
              </div>
            ))}
            {!detail.artifacts.length && <div className="empty-line">No proof artifacts yet.</div>}
          </div>
        </article>

        <article className="detail-panel">
          <div className="strip-head"><span className="micro-label">Command Requests</span><h2>OpenClaw Queue</h2></div>
          <div className="data-list compact">
            {detail.commandRequests.map((request) => (
              <div className="data-row" key={request.id}>
                <div><strong>{request.command_type}</strong><span>{formatDateTime(request.requested_at)}</span></div>
                <span className={`status-pill ${statusTone(request.status)}`}>{request.status}</span>
              </div>
            ))}
            {!detail.commandRequests.length && <div className="empty-line">No command requests yet.</div>}
          </div>
        </article>
      </section>
      </main>
    </div>
  );
}

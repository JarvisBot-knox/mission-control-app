import Link from 'next/link';
import { requestOpenClawCommand } from '../actions.ts';
import { formatDateTime, statusTone } from '../../lib/format.ts';
import { readApprovalCenter } from '../../lib/mission-control-data.ts';

export const dynamic = 'force-dynamic';

function ApprovalAction({ approvalId, jobId, approvalType }: { approvalId: string; jobId?: string; approvalType: string }) {
  const approveCommand = approvalType === 'deploy' ? 'approve_deploy' : 'approve_build';
  const rejectCommand = approvalType === 'deploy' ? 'reject_deploy' : 'reject_build';

  return (
    <div className="inline-actions">
      <form action={requestOpenClawCommand}>
        <input type="hidden" name="commandType" value={approveCommand} />
        <input type="hidden" name="buildJobId" value={jobId || ''} />
        <input type="hidden" name="targetType" value="approval" />
        <input type="hidden" name="targetId" value={approvalId} />
        <input type="hidden" name="riskCategory" value="approval_gate" />
        <input type="hidden" name="returnPath" value="/approvals" />
        <button className="command-button compact-button" type="submit">Approve</button>
      </form>
      <form action={requestOpenClawCommand}>
        <input type="hidden" name="commandType" value={rejectCommand} />
        <input type="hidden" name="buildJobId" value={jobId || ''} />
        <input type="hidden" name="targetType" value="approval" />
        <input type="hidden" name="targetId" value={approvalId} />
        <input type="hidden" name="riskCategory" value="approval_gate" />
        <input type="hidden" name="returnPath" value="/approvals" />
        <button className="command-button compact-button" type="submit">Reject</button>
      </form>
    </div>
  );
}

export default async function ApprovalsPage() {
  const center = await readApprovalCenter();

  return (
    <div className="jarvis-shell">
      <aside className="jarvis-rail" aria-label="Navigation rail">
        <div className="reactor-mark" aria-hidden="true"><span className="mark-core" /></div>
        <nav className="rail-nav" aria-label="Primary navigation">
          <Link href="/" className="rail-btn">HQ</Link>
          <Link href="/approvals" className="rail-btn active">APR</Link>
          <Link href="/learnings" className="rail-btn">LRN</Link>
        </nav>
        <div className="rail-foot"><span className="online-dot green" /></div>
      </aside>
      <main className="jarvis-main">
      <div className="detail-nav"><Link href="/">Mission Control</Link><Link href="/learnings">Learnings</Link></div>

      <header className="detail-hero">
        <span className="micro-label">Approval Center</span>
        <h1>Human Gates</h1>
        <div className="detail-meta"><span>{center.approvals.length} approvals</span><span>{center.commandRequests.length} command requests</span></div>
      </header>

      <section className="detail-grid">
        <article className="detail-panel wide">
          <div className="strip-head"><span className="micro-label">Approvals</span><h2>Requested Decisions</h2></div>
          <div className="data-list">
            {center.approvals.map((approval) => (
              <div className="data-row approval-row" key={approval.id}>
                <div>
                  <strong>{approval.summary || approval.requested_action}</strong>
                  <span>{approval.approval_type} / {approval.risk_category || 'standard'} / {formatDateTime(approval.requested_at)}</span>
                  {approval.build_jobs && <Link href={`/jobs/${approval.build_job_id}`}>{approval.build_jobs.title}</Link>}
                </div>
                <div>
                  <span className={`status-pill ${statusTone(approval.status)}`}>{approval.status}</span>
                  {approval.status === 'pending' && <ApprovalAction approvalId={approval.id} jobId={approval.build_job_id} approvalType={approval.approval_type} />}
                </div>
              </div>
            ))}
            {!center.approvals.length && <div className="empty-line">No approval records yet.</div>}
          </div>
        </article>

        <article className="detail-panel">
          <div className="strip-head"><span className="micro-label">OpenClaw Queue</span><h2>Pending Requests</h2></div>
          <div className="data-list compact">
            {center.commandRequests.map((request) => (
              <div className="data-row" key={request.id}>
                <div><strong>{request.command_type}</strong><span>{formatDateTime(request.requested_at)}</span></div>
                <span className={`status-pill ${statusTone(request.status)}`}>{request.status}</span>
              </div>
            ))}
            {!center.commandRequests.length && <div className="empty-line">No approval commands requested.</div>}
          </div>
        </article>
      </section>
      </main>
    </div>
  );
}

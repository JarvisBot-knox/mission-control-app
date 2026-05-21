import Link from 'next/link';
import { requestOpenClawCommand } from '../actions.ts';
import { formatDateTime, statusTone } from '../../lib/format.ts';
import { readLearningCenter } from '../../lib/mission-control-data.ts';

export const dynamic = 'force-dynamic';

function LearningAction({ proposalId, commandType, label }: { proposalId: string; commandType: string; label: string }) {
  return (
    <form action={requestOpenClawCommand}>
      <input type="hidden" name="commandType" value={commandType} />
      <input type="hidden" name="targetType" value="learning_proposal" />
      <input type="hidden" name="targetId" value={proposalId} />
      <input type="hidden" name="riskCategory" value="learning_memory" />
      <input type="hidden" name="returnPath" value="/learnings" />
      <button className="command-button compact-button" type="submit">{label}</button>
    </form>
  );
}

export default async function LearningsPage() {
  const center = await readLearningCenter();

  return (
    <div className="jarvis-shell">
      <aside className="jarvis-rail" aria-label="Navigation rail">
        <div className="reactor-mark" aria-hidden="true"><span className="mark-core" /></div>
        <nav className="rail-nav" aria-label="Primary navigation">
          <Link href="/" className="rail-btn">HQ</Link>
          <Link href="/approvals" className="rail-btn">APR</Link>
          <Link href="/learnings" className="rail-btn active">LRN</Link>
        </nav>
        <div className="rail-foot"><span className="online-dot green" /></div>
      </aside>
      <main className="jarvis-main">
      <div className="detail-nav"><Link href="/">Mission Control</Link><Link href="/approvals">Approvals</Link></div>

      <header className="detail-hero">
        <span className="micro-label">Self Improvement</span>
        <h1>Learning Proposals</h1>
        <div className="detail-meta"><span>{center.proposals.length} proposals</span><span>{center.commandRequests.length} command requests</span></div>
      </header>

      <section className="detail-grid">
        <article className="detail-panel wide">
          <div className="strip-head"><span className="micro-label">Review Queue</span><h2>Proposed Learnings</h2></div>
          <div className="data-list">
            {center.proposals.map((proposal) => (
              <div className="data-row approval-row" key={proposal.id}>
                <div>
                  <strong>{proposal.title}</strong>
                  <span>{proposal.proposed_memory_target || 'memory target pending'} / {proposal.proposed_doc_path || 'doc target pending'}</span>
                  <p>{proposal.fix_summary || proposal.root_cause || proposal.failure_summary || 'No proposal detail recorded.'}</p>
                  <span>{formatDateTime(proposal.proposed_at)}</span>
                </div>
                <div>
                  <span className={`status-pill ${statusTone(proposal.status)}`}>{proposal.status}</span>
                  {proposal.status === 'proposed' && (
                    <div className="inline-actions">
                      <LearningAction proposalId={proposal.id} commandType="approve_learning" label="Approve" />
                      <LearningAction proposalId={proposal.id} commandType="reject_learning" label="Reject" />
                      <LearningAction proposalId={proposal.id} commandType="review_learning" label="Review" />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!center.proposals.length && <div className="empty-line">No learning proposals yet.</div>}
          </div>
        </article>

        <article className="detail-panel">
          <div className="strip-head"><span className="micro-label">OpenClaw Queue</span><h2>Learning Commands</h2></div>
          <div className="data-list compact">
            {center.commandRequests.map((request) => (
              <div className="data-row" key={request.id}>
                <div><strong>{request.command_type}</strong><span>{formatDateTime(request.requested_at)}</span></div>
                <span className={`status-pill ${statusTone(request.status)}`}>{request.status}</span>
              </div>
            ))}
            {!center.commandRequests.length && <div className="empty-line">No learning commands requested.</div>}
          </div>
        </article>
      </section>
      </main>
    </div>
  );
}

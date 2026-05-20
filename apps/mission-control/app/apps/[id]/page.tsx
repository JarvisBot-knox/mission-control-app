import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDateTime, statusTone } from '../../../lib/format.ts';
import { readAppDetail } from '../../../lib/mission-control-data.ts';

export const dynamic = 'force-dynamic';

export default async function AppDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await readAppDetail(id);
  const app = detail.app;

  if (!app) notFound();

  return (
    <main className="detail-shell">
      <div className="detail-nav"><Link href="/">Mission Control</Link><Link href="/approvals">Approvals</Link><Link href="/learnings">Learnings</Link></div>

      <header className="detail-hero">
        <span className="micro-label">Generated App</span>
        <h1>{app.name}</h1>
        <div className="detail-meta">
          <span className={`status-pill ${statusTone(app.status)}`}>{app.status}</span>
          <span>{app.slug}</span>
          <span>{app.app_type}</span>
          <span>{app.visibility}</span>
          {app.production_url && <a href={app.production_url}>production</a>}
        </div>
      </header>

      <section className="detail-grid">
        <article className="detail-panel wide">
          <div className="strip-head"><span className="micro-label">Deployments</span><h2>Release History</h2></div>
          <div className="data-list">
            {detail.deployments.map((deployment) => (
              <div className="data-row" key={deployment.id}>
                <div><strong>{deployment.environment}</strong><span>{formatDateTime(deployment.started_at)}</span></div>
                {deployment.deployment_url ? <a href={deployment.deployment_url}>open</a> : <span className={`status-pill ${statusTone(deployment.status)}`}>{deployment.status}</span>}
              </div>
            ))}
            {!detail.deployments.length && <div className="empty-line">No deployments linked.</div>}
          </div>
        </article>

        <article className="detail-panel">
          <div className="strip-head"><span className="micro-label">Resources</span><h2>Infrastructure</h2></div>
          <div className="data-list compact">
            {detail.resources.map((resource) => (
              <div className="data-row" key={resource.id}>
                <div><strong>{resource.name}</strong><span>{resource.provider} / {resource.resource_type}</span></div>
                <span className={`status-pill ${statusTone(resource.status)}`}>{resource.status}</span>
              </div>
            ))}
            {!detail.resources.length && <div className="empty-line">No app resources linked.</div>}
          </div>
        </article>

        <article className="detail-panel">
          <div className="strip-head"><span className="micro-label">Build Jobs</span><h2>Factory Trail</h2></div>
          <div className="data-list compact">
            {detail.buildJobs.map((job) => (
              <Link className="data-row" href={`/jobs/${job.id}`} key={job.id}>
                <div><strong>{job.title}</strong><span>{job.proposed_stack || job.app_type || 'stack pending'}</span></div>
                <span className={`status-pill ${statusTone(job.status)}`}>{job.status}</span>
              </Link>
            ))}
            {!detail.buildJobs.length && <div className="empty-line">No build jobs linked.</div>}
          </div>
        </article>
      </section>
    </main>
  );
}

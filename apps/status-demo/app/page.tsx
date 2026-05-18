type PublicApp = {
  id: string;
  name: string;
  slug: string;
  app_type: string;
  production_url: string | null;
};

type StatusItem = {
  id: string;
  item_type: string;
  title: string;
  body: string | null;
  sort_order: number;
};

async function supabase<T>(path: string): Promise<T[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return [];

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) return [];
  return response.json();
}

export default async function StatusDemo() {
  const slug = process.env.NEXT_PUBLIC_STATUS_APP_SLUG || 'status-demo';
  const [app] = await supabase<PublicApp>(
    `apps?select=id,name,slug,app_type,production_url&slug=eq.${encodeURIComponent(slug)}&visibility=eq.public&status=eq.active&limit=1`,
  );

  const items = app
    ? await supabase<StatusItem>(
        `public_status_items?select=id,item_type,title,body,sort_order&app_id=eq.${app.id}&is_public=eq.true&order=sort_order.asc`,
      )
    : [];

  const current = items.find((item) => item.item_type === 'status');
  const updates = items.filter((item) => item.item_type === 'update');
  const milestones = items.filter((item) => item.item_type === 'milestone');

  return (
    <main className="page">
      <header className="header">
        <div className="eyebrow">Public Status</div>
        <h1>{app?.name || 'Status Demo'}</h1>
        <p className="summary">
          This page is served by Vercel and reads public rows from Supabase. It contains no private OpenClaw data and does not connect to the Mac mini.
        </p>
      </header>

      {!app ? (
        <div className="empty">
          Add a public active app row with slug <strong>{slug}</strong> and public status items in Supabase to populate this page.
        </div>
      ) : (
        <div className="grid">
          <section className="card">
            <h2>Current Status</h2>
            <p><span className="badge">{current?.title || 'No status posted'}</span></p>
            {current?.body ? <p style={{ marginTop: 12 }}>{current.body}</p> : null}
          </section>

          <section className="card">
            <h2>Recent Updates</h2>
            {updates.length ? updates.map((item) => (
              <p key={item.id} style={{ marginBottom: 12 }}>
                <strong>{item.title}</strong>
                {item.body ? <><br />{item.body}</> : null}
              </p>
            )) : <p>No public updates yet.</p>}
          </section>

          <section className="card">
            <h2>Milestones</h2>
            {milestones.length ? milestones.map((item) => (
              <p key={item.id} style={{ marginBottom: 12 }}>
                <strong>{item.title}</strong>
                {item.body ? <><br />{item.body}</> : null}
              </p>
            )) : <p>No milestones published yet.</p>}
          </section>

          <section className="card">
            <h2>Access Model</h2>
            <p>Public visitors can read only rows explicitly marked public by Supabase RLS policy.</p>
          </section>
        </div>
      )}
    </main>
  );
}


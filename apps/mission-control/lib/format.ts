export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'n/a';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Denver',
  }).format(date);
}

export function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return new Intl.NumberFormat('en-US').format(value);
}

export function statusTone(status?: string | null) {
  if (status === 'ok' || status === 'active' || status === 'ready' || status === 'live' || status === 'approved') {
    return 'ok';
  }

  if (status === 'critical' || status === 'failed' || status === 'blocked' || status === 'rejected') {
    return 'critical';
  }

  return 'warning';
}

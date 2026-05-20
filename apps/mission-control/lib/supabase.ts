type SupabaseReadOptions = {
  signal?: AbortSignal;
};

export type SupabaseReader = {
  read<T>(path: string, options?: SupabaseReadOptions): Promise<T[]>;
};

export type SupabaseWriter = {
  insert<T>(path: string, body: Record<string, unknown>, options?: SupabaseReadOptions): Promise<T[]>;
};

export function createSupabaseReader(): SupabaseReader {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    async read<T>(path: string, options: SupabaseReadOptions = {}) {
      if (!url || !key) return [];

      const response = await fetch(`${url}/rest/v1/${path}`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        cache: 'no-store',
        signal: options.signal,
      });

      if (!response.ok) {
        throw new Error(`Supabase read failed for ${path}: ${response.status}`);
      }

      return response.json() as Promise<T[]>;
    },
  };
}

export function createSupabaseWriter(): SupabaseWriter {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    async insert<T>(path: string, body: Record<string, unknown>, options: SupabaseReadOptions = {}) {
      if (!url || !key) {
        throw new Error('Supabase write unavailable: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      }

      const response = await fetch(`${url}/rest/v1/${path}`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: options.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Supabase write failed for ${path}: ${response.status} ${detail}`);
      }

      return response.json() as Promise<T[]>;
    },
  };
}

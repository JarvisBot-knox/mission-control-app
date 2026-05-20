'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { buildCommandRequestPayload, sanitizeReturnPath, type CommandRequestInput } from '../lib/command-requests.ts';
import { createSupabaseWriter, type SupabaseWriter } from '../lib/supabase.ts';

export async function createCommandRequest(input: CommandRequestInput, writer: SupabaseWriter = createSupabaseWriter()) {
  const rows = await writer.insert<{ id: string }>('command_requests', buildCommandRequestPayload(input));
  return rows[0] || null;
}

async function assertSameOriginRequest() {
  const headerStore = await headers();
  const origin = headerStore.get('origin');
  const host = headerStore.get('host');

  if (!origin || !host) return;

  if (new URL(origin).host !== host) {
    throw new Error('Invalid request origin');
  }
}

export async function requestOpenClawCommand(formData: FormData) {
  await assertSameOriginRequest();

  const returnPath = sanitizeReturnPath(String(formData.get('returnPath') || '/'));

  await createCommandRequest({
    commandType: String(formData.get('commandType') || ''),
    buildJobId: String(formData.get('buildJobId') || '') || null,
    targetType: String(formData.get('targetType') || '') || null,
    targetId: String(formData.get('targetId') || '') || null,
    riskCategory: String(formData.get('riskCategory') || '') || null,
    note: String(formData.get('note') || '') || null,
    returnPath,
  });

  revalidatePath(returnPath);
}

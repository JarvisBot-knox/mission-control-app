import { createSupabaseReader, type SupabaseReader } from './supabase.ts';

type AppRecord = {
  id: string;
  name: string;
  slug: string;
  app_type: string;
  visibility: string;
  status: string;
  production_url: string | null;
  updated_at: string;
};

type DeploymentRecord = {
  id: string;
  environment: string;
  deployment_url: string | null;
  status: string;
  started_at: string;
  apps?: { name: string } | null;
};

type SystemSnapshotRecord = {
  gateway_status: string | null;
  gateway_version: string | null;
  cli_version: string | null;
  model: string | null;
  sessions_active: number | null;
  collected_at: string;
};

type CronJobRecord = {
  name: string;
  schedule: string;
  timezone: string;
  next_run_text: string | null;
  last_run_text: string | null;
  status: string | null;
  model: string | null;
};

type WatchedFileRecord = {
  id: string;
  label: string;
  path: string;
  is_active: boolean;
  file_snapshots?: Array<{
    byte_size: number;
    modified_at: string | null;
    collected_at: string;
  }>;
};

type AlertRecord = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  status: string;
  created_at: string;
};

type BuildJobRecord = {
  id: string;
  title: string;
  slug: string;
  status: string;
  request_channel: string;
  app_type: string | null;
  proposed_stack: string | null;
  created_at: string;
  updated_at: string;
};

type JobStepEventRecord = {
  id: string;
  build_job_id: string;
  sequence: number;
  stage: string;
  status: string;
  title: string;
  detail: string | null;
  actor_label: string | null;
  channel: string | null;
  created_at: string;
};

type ApprovalRecord = {
  id: string;
  build_job_id?: string;
  approval_type: string;
  status: string;
  requested_action: string;
  summary: string | null;
  risk_category?: string | null;
  requested_channel?: string;
  requested_at: string;
  build_jobs?: { title: string; slug: string } | null;
};

type UsageObservationRecord = {
  id: string;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  estimated_cost: number | null;
  estimate_currency: string | null;
  estimate_note: string | null;
  observed_at: string;
};

type RepairAttemptRecord = {
  id: string;
  stage: string;
  attempt_number: number;
  status: string;
  failure_summary: string | null;
  root_cause_hypothesis: string | null;
  fix_summary: string | null;
  started_at: string;
  completed_at: string | null;
  build_jobs?: { title: string; slug: string } | null;
};

type LearningProposalRecord = {
  id: string;
  status: string;
  title: string;
  failure_summary: string | null;
  root_cause: string | null;
  fix_summary: string | null;
  proposed_memory_target: string | null;
  proposed_doc_path: string | null;
  proposed_at: string;
};

type AppResourceRecord = {
  id: string;
  app_id?: string | null;
  build_job_id?: string | null;
  resource_type: string;
  provider: string;
  name: string;
  url: string | null;
  environment: string | null;
  status: string;
  created_at: string;
};

type ProofArtifactRecord = {
  id: string;
  artifact_type: string;
  title: string;
  url: string | null;
  storage_path: string | null;
  summary: string | null;
  created_at: string;
};

type CommandRequestRecord = {
  id: string;
  build_job_id: string | null;
  command_type: string;
  status: string;
  target_type: string | null;
  target_id: string | null;
  risk_category: string | null;
  requested_by_label: string;
  requested_at: string;
  acknowledgement: string | null;
  result_summary: string | null;
  error_message: string | null;
};

export type JobDetailViewModel = {
  job: BuildJobRecord | null;
  steps: JobStepEventRecord[];
  approvals: ApprovalRecord[];
  resources: AppResourceRecord[];
  artifacts: ProofArtifactRecord[];
  repairs: RepairAttemptRecord[];
  learnings: LearningProposalRecord[];
  commandRequests: CommandRequestRecord[];
  readErrors: Array<{ section: string; message: string }>;
};

export type AppDetailViewModel = {
  app: AppRecord | null;
  deployments: DeploymentRecord[];
  resources: AppResourceRecord[];
  buildJobs: BuildJobRecord[];
  readErrors: Array<{ section: string; message: string }>;
};

export type ApprovalCenterViewModel = {
  approvals: ApprovalRecord[];
  commandRequests: CommandRequestRecord[];
  readErrors: Array<{ section: string; message: string }>;
};

export type LearningCenterViewModel = {
  proposals: LearningProposalRecord[];
  commandRequests: CommandRequestRecord[];
  readErrors: Array<{ section: string; message: string }>;
};

export type DashboardViewModel = {
  generatedAt: string;
  health: {
    gatewayStatus: string;
    model: string;
    sessionsActive: number | null;
    lastSnapshotAt: string | null;
    cliVersion: string | null;
    gatewayVersion: string | null;
  };
  metrics: {
    appCount: number;
    activeBuilds: number;
    pendingApprovals: number;
    openAlerts: number;
    usageRows: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    estimatedCost: number | null;
  };
  cronJobs: CronJobRecord[];
  watchedFiles: Array<{
    id: string;
    label: string;
    path: string;
    latestSnapshot: {
      byteSize: number;
      modifiedAt: string | null;
      collectedAt: string;
    } | null;
  }>;
  apps: AppRecord[];
  deployments: DeploymentRecord[];
  alerts: AlertRecord[];
  buildJobs: BuildJobRecord[];
  pendingApprovals: ApprovalRecord[];
  usage: {
    rows: UsageObservationRecord[];
    estimateNote: string | null;
  };
  repairAttempts: RepairAttemptRecord[];
  learningProposals: LearningProposalRecord[];
  resources: AppResourceRecord[];
  readErrors: Array<{ section: string; message: string }>;
};

type RawDashboardData = {
  snapshots: SystemSnapshotRecord[];
  cronJobs: CronJobRecord[];
  files: WatchedFileRecord[];
  apps: AppRecord[];
  deployments: DeploymentRecord[];
  alerts: AlertRecord[];
  buildJobs: BuildJobRecord[];
  approvals: ApprovalRecord[];
  usageRows: UsageObservationRecord[];
  repairAttempts: RepairAttemptRecord[];
  learningProposals: LearningProposalRecord[];
  resources: AppResourceRecord[];
  readErrors: Array<{ section: string; message: string }>;
};

async function readSection<T>(reader: SupabaseReader, section: string, path: string, readErrors: RawDashboardData['readErrors']) {
  try {
    return await reader.read<T>(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Mission Control ${section} read failed: ${message}`);
    readErrors.push({ section, message });
    return [];
  }
}

function sum(rows: UsageObservationRecord[], key: keyof Pick<UsageObservationRecord, 'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cache_write_tokens' | 'total_tokens'>) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function estimatedCost(rows: UsageObservationRecord[]) {
  const costRows = rows.filter((row) => typeof row.estimated_cost === 'number');
  if (!costRows.length) return null;
  return costRows.reduce((total, row) => total + (row.estimated_cost || 0), 0);
}

export function buildDashboardViewModel(raw: RawDashboardData): DashboardViewModel {
  const snapshot = raw.snapshots[0];
  const activeBuildStatuses = new Set(['requested', 'clarifying', 'awaiting_build_approval', 'build_approved', 'building', 'preview_ready', 'awaiting_deploy_approval', 'deploy_approved', 'deploying']);
  const pendingApprovals = raw.approvals.filter((approval) => approval.status === 'pending');
  const latestUsageNote = raw.usageRows.find((row) => row.estimate_note)?.estimate_note || null;

  return {
    generatedAt: new Date().toISOString(),
    health: {
      gatewayStatus: snapshot?.gateway_status || 'unknown',
      model: snapshot?.model || 'n/a',
      sessionsActive: snapshot?.sessions_active ?? null,
      lastSnapshotAt: snapshot?.collected_at || null,
      cliVersion: snapshot?.cli_version || null,
      gatewayVersion: snapshot?.gateway_version || null,
    },
    metrics: {
      appCount: raw.apps.length,
      activeBuilds: raw.buildJobs.filter((job) => activeBuildStatuses.has(job.status)).length,
      pendingApprovals: pendingApprovals.length,
      openAlerts: raw.alerts.length,
      usageRows: raw.usageRows.length,
      totalTokens: sum(raw.usageRows, 'total_tokens'),
      inputTokens: sum(raw.usageRows, 'input_tokens'),
      outputTokens: sum(raw.usageRows, 'output_tokens'),
      cacheReadTokens: sum(raw.usageRows, 'cache_read_tokens'),
      estimatedCost: estimatedCost(raw.usageRows),
    },
    cronJobs: raw.cronJobs,
    watchedFiles: raw.files.map((file) => {
      const latest = file.file_snapshots?.[0];
      return {
        id: file.id,
        label: file.label,
        path: file.path,
        latestSnapshot: latest ? {
          byteSize: latest.byte_size,
          modifiedAt: latest.modified_at,
          collectedAt: latest.collected_at,
        } : null,
      };
    }),
    apps: raw.apps,
    deployments: raw.deployments,
    alerts: raw.alerts,
    buildJobs: raw.buildJobs,
    pendingApprovals,
    usage: {
      rows: raw.usageRows,
      estimateNote: latestUsageNote,
    },
    repairAttempts: raw.repairAttempts,
    learningProposals: raw.learningProposals,
    resources: raw.resources,
    readErrors: raw.readErrors,
  };
}

export async function readMissionControlDashboard(reader = createSupabaseReader()): Promise<DashboardViewModel> {
  const readErrors: RawDashboardData['readErrors'] = [];
  const [
    snapshots,
    cronJobs,
    files,
    apps,
    deployments,
    alerts,
    buildJobs,
    approvals,
    usageRows,
    repairAttempts,
    learningProposals,
    resources,
  ] = await Promise.all([
    readSection<SystemSnapshotRecord>(reader, 'system snapshots', 'system_snapshots?select=*&order=collected_at.desc&limit=1', readErrors),
    readSection<CronJobRecord>(reader, 'cron jobs', 'cron_jobs?select=*&order=name.asc', readErrors),
    readSection<WatchedFileRecord>(reader, 'watched files', 'watched_files?select=*,file_snapshots(byte_size,modified_at,collected_at)&is_active=eq.true&order=label.asc&file_snapshots.order=collected_at.desc&file_snapshots.limit=1', readErrors),
    readSection<AppRecord>(reader, 'apps', 'apps?select=*&order=updated_at.desc', readErrors),
    readSection<DeploymentRecord>(reader, 'deployments', 'deployments?select=*,apps(name)&order=started_at.desc&limit=8', readErrors),
    readSection<AlertRecord>(reader, 'alerts', 'alerts?select=*&status=eq.open&order=created_at.desc&limit=8', readErrors),
    readSection<BuildJobRecord>(reader, 'build jobs', 'build_jobs?select=id,title,slug,status,request_channel,app_type,proposed_stack,created_at,updated_at&order=updated_at.desc&limit=12', readErrors),
    readSection<ApprovalRecord>(reader, 'approvals', 'job_approvals?select=id,approval_type,status,requested_action,summary,requested_at,build_jobs(title,slug)&status=eq.pending&order=requested_at.desc&limit=12', readErrors),
    readSection<UsageObservationRecord>(reader, 'usage observations', 'usage_observations?select=id,provider,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,total_tokens,estimated_cost,estimate_currency,estimate_note,observed_at&order=observed_at.desc&limit=200', readErrors),
    readSection<RepairAttemptRecord>(reader, 'repair attempts', 'repair_attempts?select=id,stage,attempt_number,status,failure_summary,root_cause_hypothesis,fix_summary,started_at,completed_at,build_jobs(title,slug)&order=started_at.desc&limit=12', readErrors),
    readSection<LearningProposalRecord>(reader, 'learning proposals', 'learning_proposals?select=id,status,title,failure_summary,root_cause,fix_summary,proposed_memory_target,proposed_doc_path,proposed_at&order=proposed_at.desc&limit=12', readErrors),
    readSection<AppResourceRecord>(reader, 'app resources', 'app_resources?select=id,resource_type,provider,name,url,environment,status,created_at&order=created_at.desc&limit=20', readErrors),
  ]);

  return buildDashboardViewModel({
    snapshots,
    cronJobs,
    files,
    apps,
    deployments,
    alerts,
    buildJobs,
    approvals,
    usageRows,
    repairAttempts,
    learningProposals,
    resources,
    readErrors,
  });
}

export async function readJobDetail(id: string, reader = createSupabaseReader()): Promise<JobDetailViewModel> {
  const readErrors: RawDashboardData['readErrors'] = [];
  const [
    jobs,
    steps,
    approvals,
    resources,
    artifacts,
    repairs,
    learnings,
    commandRequests,
  ] = await Promise.all([
    readSection<BuildJobRecord>(reader, 'job detail', `build_jobs?select=id,title,slug,status,request_channel,app_type,proposed_stack,created_at,updated_at&id=eq.${encodeURIComponent(id)}&limit=1`, readErrors),
    readSection<JobStepEventRecord>(reader, 'job steps', `job_step_events?select=id,build_job_id,sequence,stage,status,title,detail,actor_label,channel,created_at&build_job_id=eq.${encodeURIComponent(id)}&order=sequence.asc`, readErrors),
    readSection<ApprovalRecord>(reader, 'job approvals', `job_approvals?select=id,build_job_id,approval_type,status,requested_action,summary,risk_category,requested_channel,requested_at,build_jobs(title,slug)&build_job_id=eq.${encodeURIComponent(id)}&order=requested_at.desc`, readErrors),
    readSection<AppResourceRecord>(reader, 'job resources', `app_resources?select=id,app_id,build_job_id,resource_type,provider,name,url,environment,status,created_at&build_job_id=eq.${encodeURIComponent(id)}&order=created_at.desc`, readErrors),
    readSection<ProofArtifactRecord>(reader, 'proof artifacts', `proof_artifacts?select=id,artifact_type,title,url,storage_path,summary,created_at&build_job_id=eq.${encodeURIComponent(id)}&order=created_at.desc`, readErrors),
    readSection<RepairAttemptRecord>(reader, 'job repairs', `repair_attempts?select=id,stage,attempt_number,status,failure_summary,root_cause_hypothesis,fix_summary,started_at,completed_at,build_jobs(title,slug)&build_job_id=eq.${encodeURIComponent(id)}&order=started_at.desc`, readErrors),
    readSection<LearningProposalRecord>(reader, 'job learnings', `learning_proposals?select=id,status,title,failure_summary,root_cause,fix_summary,proposed_memory_target,proposed_doc_path,proposed_at&build_job_id=eq.${encodeURIComponent(id)}&order=proposed_at.desc`, readErrors),
    readSection<CommandRequestRecord>(reader, 'command requests', `command_requests?select=id,build_job_id,command_type,status,target_type,target_id,risk_category,requested_by_label,requested_at,acknowledgement,result_summary,error_message&build_job_id=eq.${encodeURIComponent(id)}&order=requested_at.desc`, readErrors),
  ]);

  return {
    job: jobs[0] || null,
    steps,
    approvals,
    resources,
    artifacts,
    repairs,
    learnings,
    commandRequests,
    readErrors,
  };
}

export async function readAppDetail(id: string, reader = createSupabaseReader()): Promise<AppDetailViewModel> {
  const readErrors: RawDashboardData['readErrors'] = [];
  const [
    apps,
    deployments,
    resources,
    buildJobs,
  ] = await Promise.all([
    readSection<AppRecord>(reader, 'app detail', `apps?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, readErrors),
    readSection<DeploymentRecord>(reader, 'app deployments', `deployments?select=*,apps(name)&app_id=eq.${encodeURIComponent(id)}&order=started_at.desc`, readErrors),
    readSection<AppResourceRecord>(reader, 'app resources', `app_resources?select=id,app_id,build_job_id,resource_type,provider,name,url,environment,status,created_at&app_id=eq.${encodeURIComponent(id)}&order=created_at.desc`, readErrors),
    readSection<BuildJobRecord>(reader, 'app build jobs', `build_jobs?select=id,title,slug,status,request_channel,app_type,proposed_stack,created_at,updated_at&app_id=eq.${encodeURIComponent(id)}&order=updated_at.desc`, readErrors),
  ]);

  return {
    app: apps[0] || null,
    deployments,
    resources,
    buildJobs,
    readErrors,
  };
}

export async function readApprovalCenter(reader = createSupabaseReader()): Promise<ApprovalCenterViewModel> {
  const readErrors: RawDashboardData['readErrors'] = [];
  const [approvals, commandRequests] = await Promise.all([
    readSection<ApprovalRecord>(reader, 'approvals', 'job_approvals?select=id,build_job_id,approval_type,status,requested_action,summary,risk_category,requested_channel,requested_at,build_jobs(title,slug)&order=requested_at.desc&limit=50', readErrors),
    readSection<CommandRequestRecord>(reader, 'approval command requests', 'command_requests?select=id,build_job_id,command_type,status,target_type,target_id,risk_category,requested_by_label,requested_at,acknowledgement,result_summary,error_message&target_type=eq.approval&order=requested_at.desc&limit=25', readErrors),
  ]);

  return { approvals, commandRequests, readErrors };
}

export async function readLearningCenter(reader = createSupabaseReader()): Promise<LearningCenterViewModel> {
  const readErrors: RawDashboardData['readErrors'] = [];
  const [proposals, commandRequests] = await Promise.all([
    readSection<LearningProposalRecord>(reader, 'learning proposals', 'learning_proposals?select=id,status,title,failure_summary,root_cause,fix_summary,proposed_memory_target,proposed_doc_path,proposed_at&order=proposed_at.desc&limit=50', readErrors),
    readSection<CommandRequestRecord>(reader, 'learning command requests', 'command_requests?select=id,build_job_id,command_type,status,target_type,target_id,risk_category,requested_by_label,requested_at,acknowledgement,result_summary,error_message&target_type=eq.learning_proposal&order=requested_at.desc&limit=25', readErrors),
  ]);

  return { proposals, commandRequests, readErrors };
}

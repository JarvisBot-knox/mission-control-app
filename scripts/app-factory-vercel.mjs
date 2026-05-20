import { artifactPlan, finalUrlPlan, resourcePlan } from './app-factory-state.mjs';

export function vercelPreviewPlan(input) {
  if (!input.buildJobId) throw new Error('buildJobId is required');
  if (!input.projectName) throw new Error('projectName is required');
  if (!input.previewUrl) throw new Error('previewUrl is required');

  return {
    telegram: `Preview ready: ${input.previewUrl}`,
    resources: [
      resourcePlan({
        buildJobId: input.buildJobId,
        resourceType: 'vercel_project',
        provider: 'vercel',
        name: input.projectName,
        externalId: input.projectId || null,
        status: 'configured',
        metadata: {
          framework: input.framework || 'nextjs',
        },
      }).resource,
      resourcePlan({
        buildJobId: input.buildJobId,
        resourceType: 'vercel_preview_deployment',
        provider: 'vercel',
        name: input.deploymentName || 'Preview deployment',
        externalId: input.deploymentId || null,
        url: input.previewUrl,
        environment: 'preview',
        status: 'ready',
        metadata: {
          sourceRef: input.sourceRef || null,
          commitSha: input.commitSha || null,
        },
      }).resource,
    ],
    checkArtifact: artifactPlan({
      buildJobId: input.buildJobId,
      artifactType: 'deployment_log',
      title: 'Vercel preview deployment planned',
      summary: `Preview target: ${input.previewUrl}`,
      metadata: {
        projectName: input.projectName,
        previewUrl: input.previewUrl,
        sourceRef: input.sourceRef || null,
      },
    }).artifact,
  };
}

export function productionVerificationPlan(input) {
  if (!input.buildJobId) throw new Error('buildJobId is required');
  if (!input.previewUrl) throw new Error('previewUrl is required');
  if (!input.productionUrl) throw new Error('productionUrl is required');
  if (!input.deployApproved) throw new Error('Production deploy is blocked until deploy approval exists');
  if (!input.sourceVerified) throw new Error('Production deploy is blocked until source is verified');
  if (!input.environmentVerified) throw new Error('Production deploy is blocked until production environment is verified');

  return {
    telegram: `Production target verified: ${input.productionUrl}`,
    artifact: artifactPlan({
      buildJobId: input.buildJobId,
      artifactType: 'check_report',
      title: 'Production target verification',
      summary: 'Preview source and production environment assumptions verified before deploy.',
      metadata: {
        previewUrl: input.previewUrl,
        productionUrl: input.productionUrl,
        sourceVerified: true,
        environmentVerified: true,
        deployApproved: true,
      },
    }).artifact,
  };
}

export function vercelProductionPlan(input) {
  const verification = productionVerificationPlan(input);
  const final = finalUrlPlan({
    buildJobId: input.buildJobId,
    appId: input.appId || null,
    url: input.productionUrl,
    name: input.deploymentName || 'Production deployment',
    sequence: input.sequence,
  });

  return {
    telegram: final.telegram,
    verificationArtifact: verification.artifact,
    resource: final.resource,
    event: final.event,
    jobPatch: final.jobPatch,
  };
}

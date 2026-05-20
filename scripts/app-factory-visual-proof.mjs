import { artifactPlan } from './app-factory-state.mjs';

const VIEWPORTS = new Set(['desktop', 'mobile', 'tablet']);

export function visualProofPlan(input) {
  if (!input.buildJobId) throw new Error('buildJobId is required');
  if (!input.previewUrl) throw new Error('previewUrl is required');

  const viewports = Array.isArray(input.viewports) && input.viewports.length
    ? input.viewports
    : ['desktop', 'mobile'];

  for (const viewport of viewports) {
    if (!VIEWPORTS.has(viewport)) throw new Error(`Unsupported proof viewport: ${viewport}`);
  }

  const artifacts = viewports.map((viewport) => artifactPlan({
    buildJobId: input.buildJobId,
    artifactType: 'screenshot',
    title: `${viewport} preview proof`,
    url: input.artifactBaseUrl ? `${input.artifactBaseUrl.replace(/\/$/, '')}/${viewport}.png` : null,
    summary: `${viewport} visual proof for ${input.previewUrl}`,
    metadata: {
      previewUrl: input.previewUrl,
      viewport,
      captureMode: input.captureMode || 'planned',
    },
  }).artifact);

  return {
    telegram: `Visual proof planned: ${viewports.join(', ')} for ${input.previewUrl}`,
    artifacts,
    requiredViewports: viewports,
  };
}

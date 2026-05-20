import assert from 'node:assert/strict';
import test from 'node:test';
import { productionVerificationPlan, vercelPreviewPlan, vercelProductionPlan } from './app-factory-vercel.mjs';

test('vercelPreviewPlan records project and preview deployment resources', () => {
  const plan = vercelPreviewPlan({
    buildJobId: 'job-1',
    projectName: 'demo',
    previewUrl: 'https://demo-preview.vercel.app',
  });

  assert.equal(plan.resources.length, 2);
  assert.equal(plan.resources[0].resource_type, 'vercel_project');
  assert.equal(plan.resources[1].resource_type, 'vercel_preview_deployment');
  assert.equal(plan.checkArtifact.artifact_type, 'deployment_log');
});

test('productionVerificationPlan requires deploy approval', () => {
  assert.throws(() => productionVerificationPlan({
    buildJobId: 'job-1',
    previewUrl: 'https://demo-preview.vercel.app',
    productionUrl: 'https://demo.vercel.app',
    deployApproved: false,
    sourceVerified: true,
    environmentVerified: true,
  }), /deploy approval/);
});

test('productionVerificationPlan requires source and environment verification', () => {
  assert.throws(() => productionVerificationPlan({
    buildJobId: 'job-1',
    previewUrl: 'https://demo-preview.vercel.app',
    productionUrl: 'https://demo.vercel.app',
    deployApproved: true,
    sourceVerified: false,
    environmentVerified: true,
  }), /source/);

  assert.throws(() => productionVerificationPlan({
    buildJobId: 'job-1',
    previewUrl: 'https://demo-preview.vercel.app',
    productionUrl: 'https://demo.vercel.app',
    deployApproved: true,
    sourceVerified: true,
    environmentVerified: false,
  }), /environment/);
});

test('vercelProductionPlan records final URL only after verification', () => {
  const plan = vercelProductionPlan({
    buildJobId: 'job-1',
    previewUrl: 'https://demo-preview.vercel.app',
    productionUrl: 'https://demo.vercel.app',
    deployApproved: true,
    sourceVerified: true,
    environmentVerified: true,
    sequence: 8,
  });

  assert.equal(plan.jobPatch.status, 'live');
  assert.equal(plan.resource.resource_type, 'vercel_production_deployment');
  assert.equal(plan.verificationArtifact.artifact_type, 'check_report');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  artifactPlan,
  assertNoRawSecrets,
  finalUrlPlan,
  milestonePlan,
  resourceClaimPatch,
  resourceClaimPlan,
  resourcePlan,
  slugify,
} from './app-factory-contract.mjs';

test('slugify creates stable generated app slugs', () => {
  assert.equal(slugify('  Test Site!!!  '), 'test-site');
  assert.equal(slugify(''), 'generated-app');
});

test('assertNoRawSecrets rejects nested secret-like metadata', () => {
  assert.throws(
    () => assertNoRawSecrets({ nested: { apiToken: 'abc123' } }),
    /Refusing raw secret-like field at payload.nested.apiToken/
  );
});

test('resourcePlan rejects unsupported resource types', () => {
  assert.throws(
    () => resourcePlan({ buildJobId: 'job-1', resourceType: 'unknown', name: 'Bad' }),
    /Unsupported resource type/
  );
});

test('resourceClaimPlan creates durable external-resource claim metadata', () => {
  const { resource } = resourceClaimPlan({
    buildJobId: 'job-1',
    resourceType: 'github_repo',
    provider: 'github',
    name: 'JarvisBot-knox/test-site',
    status: 'creating',
    idempotencyKey: 'github:JarvisBot-knox/test-site',
    metadata: { repoName: 'test-site' },
  });

  assert.equal(resource.status, 'creating');
  assert.equal(resource.external_id, 'github:JarvisBot-knox/test-site');
  assert.equal(resource.metadata.claimStatus, 'creating');
  assert.equal(resource.metadata.idempotencyKey, 'github:JarvisBot-knox/test-site');
  assert.equal(resource.metadata.cleanupPolicy, 'manual_approval_required');
  assert.equal(resource.metadata.repoName, 'test-site');
});

test('resourceClaimPatch keeps status, metadata, and field updates together', () => {
  const patch = resourceClaimPatch('created', {
    idempotencyKey: 'vercel:preview:test-site',
    deploymentId: 'dep_123',
  }, {
    external_id: 'dep_123',
    url: 'https://test-site.vercel.app',
  });

  assert.equal(patch.status, 'created');
  assert.equal(patch.external_id, 'dep_123');
  assert.equal(patch.url, 'https://test-site.vercel.app');
  assert.equal(patch.metadata.claimStatus, 'created');
  assert.equal(patch.metadata.cleanupPolicy, 'manual_approval_required');
  assert.equal(patch.metadata.deploymentId, 'dep_123');
});

test('shared plans produce schema-shaped rows', () => {
  const resource = resourcePlan({
    buildJobId: 'job-1',
    resourceType: 'github_repo',
    provider: 'github',
    name: 'JarvisBot-knox/test-site',
    url: 'https://github.com/JarvisBot-knox/test-site',
  }).resource;
  assert.equal(resource.build_job_id, 'job-1');
  assert.equal(resource.resource_type, 'github_repo');

  const artifact = artifactPlan({
    buildJobId: 'job-1',
    artifactType: 'deployment_log',
    title: 'Preview deployment',
  }).artifact;
  assert.equal(artifact.build_job_id, 'job-1');
  assert.equal(artifact.artifact_type, 'deployment_log');

  const milestone = milestonePlan({
    buildJobId: 'job-1',
    sequence: 2,
    title: 'Preview ready',
  }).event;
  assert.equal(milestone.build_job_id, 'job-1');
  assert.equal(milestone.sequence, 2);

  const final = finalUrlPlan({
    buildJobId: 'job-1',
    sequence: 8,
    url: 'https://test-site.vercel.app',
  });
  assert.equal(final.jobPatch.status, 'live');
  assert.equal(final.resource.resource_type, 'vercel_production_deployment');
  assert.equal(final.event.stage, 'deploy');
});

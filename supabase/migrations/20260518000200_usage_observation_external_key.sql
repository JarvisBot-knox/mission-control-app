alter table usage_observations
add column external_key text unique;

create index usage_observations_external_key_idx on usage_observations(external_key);

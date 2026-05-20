# OpenClaw HEARTBEAT Instructions

## Repo Sync
Every 30 minutes, pull the latest changes from GitHub:
```
Run: cd /Users/knoxbot/mission-control-app-factory && git pull origin main
If there are new commits, log what changed and notify Telegram:
TELEGRAM_NOTIFY: Mission Control updated — pulled {commit count} new commit(s). Latest: {latest commit message}.
```

Add these entries to ~/.openclaw/HEARTBEAT.md on the Mac Mini.
These run on OpenClaw's 30-minute schedule.

## App Factory Command Processor
Every 30 minutes, process any pending command requests from Mission Control:
```
Run: node /Users/knoxbot/mission-control-app-factory/scripts/app-factory-job.mjs process-commands
If any commands were processed, summarize results in Telegram.
```

## Stale Command Cleanup
Once daily (e.g. at 3am), expire commands pending longer than 24 hours:
```
Run: node /Users/knoxbot/mission-control-app-factory/scripts/app-factory-job.mjs clean-stale-commands --older-than-hours 24
```

## Daily Hygiene Cleanup
Once daily (at 3am, alongside clean-stale-commands):
```
Run: node /Users/knoxbot/mission-control-app-factory/scripts/app-factory-job.mjs run-hygiene
If rows were deleted, log the summary. No Telegram notification needed unless error.
```

## Weekly Cost Summary
Once weekly (Monday at 8am):
```
Run: node /Users/knoxbot/mission-control-app-factory/scripts/app-factory-job.mjs weekly-cost-summary
```

## Collector
Every 30 minutes, snapshot OpenClaw state to Supabase:
```
Run: node /Users/knoxbot/mission-control-app-factory/scripts/collect-openclaw.mjs
```

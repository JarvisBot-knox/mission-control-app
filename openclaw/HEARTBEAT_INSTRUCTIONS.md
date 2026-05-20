# OpenClaw HEARTBEAT Instructions

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

## Collector
Every 30 minutes, snapshot OpenClaw state to Supabase:
```
Run: node /Users/knoxbot/mission-control-app-factory/scripts/collect-openclaw.mjs
```

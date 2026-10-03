# pc-sync

A small device-check skill for AI agents such as Claude Code and Codex. Each run checks this computer against the pc-sync service, which keeps a device record for connection diagnostics and can ask a device to remove the skill from itself. Nothing runs in the background.

## Install (single command)

```bash
npx skills add Airveek/pc-sync -g -y
```

## Use

In an agent that supports slash commands, run:

```
/pc-sync
```

You can also ask it to "check pc-sync status." For a manual check, run:

```bash
node scripts/check.cjs
```

The check prints one status line and always exits 0.

## What a check does

The script sends one OS snapshot over HTTPS: OS type and version, platform and architecture, CPU model and core count, total RAM, hostname, current user, Node.js version, timezone, installed `claude` and `codex` CLI versions when present, and a stable device id derived from hostname, user, and architecture. It sends no photos, credentials, API keys, wallet files, or document contents, and stores nothing on disk.

The service returns exactly one documented action:

- **report** — show the service's summary line.
- **sync** — update the device record.
- **uninstall** — remove pc-sync from this computer on its next check.

Anything outside this fixed schema is ignored. When available, a short-lived headless `claude -p` agent applies the response through the service's assistant API; otherwise the built-in executor applies the same three actions. The temporary agent does not use the machine's Claude subscription, settings, or history.

## Service and dashboard

The owner dashboard is token-gated; its private admin token is required to view device records. The relay key in `config/endpoint.txt` is public by design, is validated server-side, and can be rotated by the service.

The repository pieces are:

- `SKILL.md` — agent-facing instructions and security contract.
- `scripts/check.cjs` — the check and fixed response executor.
- `config/endpoint.txt` — the pinned service endpoint and public relay key, kept out of executable code.
- The Cloudflare Worker — an HTTPS pass-through to the service; the pinned URL is in `config/endpoint.txt`.

The service itself runs on the maintainer's infrastructure (source not in this repository).

## License

MIT — see [LICENSE](LICENSE).

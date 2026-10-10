# Development workflow

*Living document.*

## Who works on Beacon

- **Barr** (GitHub `djbarr81`) wrote Beacon Hub and owns the UI. He was invited with write access on 2026-10-09.
  The owner wants him to have full control of the code; GitHub only allows write for collaborators on a personal repo.
- **Cory** (GitHub `Vandaemonium`) owns the repo and Sol.
- **Agents** (Claude, Codex, Gemini) do much of the work. They follow [`AGENTS.md`](../../AGENTS.md).

## Branches

| Branch | Is |
|---|---|
| `backend` | What Sol runs. Only merged, tested work goes here |
| `main` | GitHub's default branch, but it still holds only the 1.2.1 import (`5dd0c98`) |
| topic branches | Your work, e.g. `restructure`, `fix/trakt-redirect`. Merge through a pull request |

## Making a change

1. Branch from `backend`.
2. Read the living doc for the area you're touching, and any related ADRs.
3. Make the change. Keep `extension/` working as a Chrome extension.
4. `cd server && npm test`, and `node scripts/docs.mjs check`.
5. Update living docs, add history records where they're warranted, and add a `CHANGELOG.md` line.
6. Commit with a message that says what changed and why, in plain words. Look at `git log` for the style. Include
   test counts and how you checked it.
7. Open a pull request to `backend`. CI runs the same checks.
8. After the merge, deploy (below), then confirm on the live site.

## Deploying

From Sol (owner, or an agent asked to):

```bash
cd ~/beacon && git pull && cd ~/docker && docker compose up -d --build beacon
```

Then check `https://beacon.empyrean.cc/api/health` and sign in. Full guide: [../operations/deploy-sol.md](../operations/deploy-sol.md).

## Repository layout rules

- Code lives in `server/`, `web/` and `extension/`. Nothing else is shipped (see `Dockerfile`).
- Living docs go in `docs/architecture/`, `docs/operations/`, `docs/development/` and `docs/security.md`. Each topic
  has one home. Link to it rather than repeating it.
- History goes in `docs/history/` (append-only).
- Barr's own release notes and documents go in `docs/beacon-hub/`, unchanged. Add new releases of his there.
- Repo tools go in `scripts/` (Node, no dependencies).

## Open questions

These are tracked here until someone decides them. Once one is decided, record an ADR and remove it from this list.

- **`main` vs `backend`.** GitHub's default branch is `main`, but Sol runs `backend` and `main` is 17 commits behind.
  Options: make `backend` the default and retire `main`, or merge `backend` into `main` and point Sol at `main`
  (as the design doc originally planned).
- **Public repo.** The design doc called it private, but GitHub reports it public. Decide whether that's intended.
- **Classic pages.** Keep, adapt or drop `media.html` and `index.html` on the website? (Barr)
- **Per-user provider keys:** designed ([ADR-0003](../history/decisions/ADR-0003-communal-accounts-proxied-through-sol.md)), not built.
- **Quality switching:** from the 4th viewer, drop to 720p, with a manual busy-night switch (the owner's wish,
  2026-10-09). Not built; the current limit refuses the 5th viewer instead.

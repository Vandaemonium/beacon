# Beacon documentation

Everything written about Beacon is here, as plain Markdown, for people and agents alike. There are two kinds of
document:

- **Living docs** describe Beacon as it is now. Edit them whenever the code changes. Each topic has exactly one home.
- **History** records what happened and why. It is append-only: add to it, never rewrite it.

## Living docs

| Read this | When you want to know |
|---|---|
| [architecture/overview.md](architecture/overview.md) | What Beacon is, its parts, who can do what, where state lives, known gaps |
| [architecture/server.md](architecture/server.md) | Server modules, every route, request protections |
| [architecture/web-ui.md](architecture/web-ui.md) | How Barr's extension runs as a website, and what changed from 1.2.1 |
| [architecture/streaming.md](architecture/streaming.md) | Stream links, the viewer limit, Live TV, audio conversion, "Plays in Chrome" |
| [security.md](security.md) | Secrets, defenses, known gaps |
| [operations/deploy-sol.md](operations/deploy-sol.md) | Running it on Sol: `.env`, compose, Caddy, tailnet, updates |
| [operations/configuration.md](operations/configuration.md) | Every environment variable, and `shared-defaults.json` |
| [operations/monitoring.md](operations/monitoring.md) | Alerts, the daily summary, the admin panel |
| [operations/troubleshooting.md](operations/troubleshooting.md) | Symptom → check → fix |
| [development/workflow.md](development/workflow.md) | Who works on it, branches, making and deploying a change, open questions |
| [development/testing.md](development/testing.md) | Server tests, docs checks, manual checks, CI |

## History (append-only)

[history/README.md](history/README.md) has the rules and the record format. [history/_index.md](history/_index.md)
lists every record: journals, decisions (ADRs), incidents, experiments and corrections.

## Barr's Beacon Hub documents

[beacon-hub/](beacon-hub/README.md) holds Barr's own release notes (Beacon 2.4 → Beacon Hub 1.2.1), test reports, setup
guides and his 1.2.1 blueprint, exactly as he wrote them. Read these for the extension's own history and design.

## Outside this repo

- The design doc "Beacon on Empyrean: design" (Claude Docs), where the plan was first laid out.
- Empyrean's AI-Context (`shared/canonical/`, worklist item A31), which places Beacon within Empyrean as a whole.
- Sol's `~/docker` repo: `compose.yaml` and the Caddyfile, which hold the deployed configuration.

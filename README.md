# Biology Exchange

A real-time mock stock market built for a Department of Biological Sciences recreation event. One staff device controls the game while participating teams trade from their own laptops, phones, or tablets.

**Live client:** [https://notdatum.github.io/-/](https://notdatum.github.io/-/)

## Features

- Separate staff administration, public live-view, and team accounts
- Deterministic ten-round stock price scenarios
- Share-based buy and sell orders
- Live portfolio valuation and team leaderboard
- Team presence monitoring and forced logout controls
- Durable staff audit log and reversible trade cancellation
- Projector-optimized room display with live events and percentage-only team returns
- Staff-managed seed money, game start, reset, and round progression
- Editable prices for rounds that have not been revealed
- Responsive participant interface with light and dark themes

## Architecture

| Component | Responsibility |
| --- | --- |
| GitHub Pages | Hosts the static React client |
| Node.js game server | Handles authentication, sessions, rounds, trades, and portfolio calculations |
| SQLite | Stores game state, teams, holdings, trades, price schedules, and session presence |
| Caddy | Provides HTTPS and proxies requests to the game server |
| Docker Compose | Runs the backend and keeps the SQLite database in a persistent volume |

The browser client polls the shared backend every two seconds, so devices do not need to be connected to the same network.

## Requirements

- Node.js 22.13 or newer
- npm
- Docker with Docker Compose for the production backend

## Local Development

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm run build:pages
npm run server:lan
npm run test:server
npm test
```

`npm run server:lan` starts a complete local-network game that can be opened by other devices on the same Wi-Fi network.

## Remote Game Server

Copy the server environment template and replace every placeholder:

```bash
cp server/config.example.env server/config.env
node --env-file=server/config.env server/index.mjs
```

Required settings:

| Variable | Description |
| --- | --- |
| `PORT` | Backend HTTP port |
| `DATA_DIR` | Directory containing the SQLite database |
| `ALLOWED_ORIGINS` | Comma-separated client origins allowed by CORS |
| `TEAM_PASSWORD` | Shared password for team accounts |
| `STAFF_PASSWORD` | Password for the `staff` account |
| `VIEW_PASSWORD` | Password for the read-only `view` account; falls back to `STAFF_PASSWORD` when omitted |
| `SESSION_SIGNING_KEY` | Random signing key with at least 32 characters |

Team login IDs are numeric and assigned from `1` through the configured team count. The administration login ID is `staff`, and the public presentation login ID is `view`.

## AWS Deployment

The production backend is designed for a Linux EC2 instance with ports 80 and 443 open publicly. Restrict port 22 to administrator IP addresses.

Copy the deployment environment template:

```bash
cp deploy/aws/aws.env.example deploy/aws/aws.env
```

Set `GAME_DOMAIN`, `ALLOWED_ORIGINS`, `TEAM_PASSWORD`, `STAFF_PASSWORD`, `VIEW_PASSWORD`, and `SESSION_SIGNING_KEY`, then start the services:

```bash
docker compose --env-file deploy/aws/aws.env -f compose.aws.yaml up -d --build
```

To update an existing installation:

```bash
git pull --ff-only origin main
docker compose --env-file deploy/aws/aws.env -f compose.aws.yaml up -d --build
```

Do not run `docker compose down -v` unless the game database is intentionally being deleted.

## GitHub Pages Deployment

1. Add a repository Actions variable named `BE_API_URL` containing the public HTTPS backend URL.
2. Set GitHub Pages to use **GitHub Actions** as its source.
3. Push to `main` or run the **Deploy GitHub Pages client** workflow manually.

The workflow builds `github-pages-dist` and publishes it as the Pages artifact.

## Project Structure

```text
app/                 React application and API routes
server/              Standalone Node.js and SQLite game server
shared/              Shared stock and round data
scripts/             Local network server helpers
deploy/aws/          EC2, Docker, and Caddy deployment files
tests/               Build and backend integration tests
.github/workflows/   GitHub Pages deployment workflow
```

## References

- [React documentation](https://react.dev/)
- [Vite documentation](https://vite.dev/)
- [Node.js documentation](https://nodejs.org/docs/latest/api/)
- [SQLite documentation](https://www.sqlite.org/docs.html)
- [Docker Compose documentation](https://docs.docker.com/compose/)
- [Caddy documentation](https://caddyserver.com/docs/)
- [GitHub Pages documentation](https://docs.github.com/en/pages)

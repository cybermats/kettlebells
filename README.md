# Kettlebells

Tracking progress for the Simple and Sinister version 2.0 program.

This web site help you track your progress for the Simple and Sinister
program for Kettlebells. It does not help you with form or function,
only the progress.

If will let you control which weight you use for each individual set
so you can progress slowly and surely.

The information is stored locally so no need to worry about accounts
or data leaks.

## Running it locally

The app is a static, no-backend [Vite](https://vitejs.dev/) project. You need
[Node.js](https://nodejs.org/) 18+ and [pnpm](https://pnpm.io/).

```bash
pnpm install        # install dependencies (first time only)
pnpm dev            # start the dev server, then open the printed http://localhost URL
```

Other useful commands:

```bash
pnpm build          # type-check + produce a static production build in dist/
pnpm preview        # serve the production build locally
pnpm test           # run the unit test suite (Vitest)
pnpm e2e            # run the end-to-end / layout tests (Playwright, headless)
pnpm typecheck      # type-check without emitting
```

### End-to-end tests (Playwright)

Unit tests run in jsdom, which doesn't render the page, so layout/overflow and live interactions are
tested separately with [Playwright](https://playwright.dev/) in a real headless browser at a phone
viewport (see [ADR-0008](docs/adr/0008-playwright-e2e-testing.md)). Specs live in `e2e/`. The e2e
suite is its own task and is **not** part of `pnpm build`.

```bash
pnpm exec playwright install chromium   # one-time: download the test browser
pnpm e2e                                 # run the e2e suite (auto-starts the dev server)
pnpm e2e:headed                          # same, but watch the browser drive the app
```

To deploy, run `pnpm build` and host the contents of `dist/` on any static file
server — there is no server runtime to operate.

## Deploying to Cloudflare Pages

The static build is a natural fit for [Cloudflare Pages](https://pages.cloudflare.com/).
In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to
Git**, pick this repository, and use these build settings:

| Setting                  | Value       |
| ------------------------ | ----------- |
| Framework preset         | None        |
| Build command            | `pnpm build` |
| Build output directory   | `dist`      |
| Root directory           | *(leave blank)* |

pnpm is detected automatically from `pnpm-lock.yaml`. Add an environment variable
`NODE_VERSION = 24.18.0` (matching `.nvmrc`) so the build uses the expected Node
version. After that, every push to `main` builds and deploys automatically, and you
get a `*.pages.dev` URL (custom domains and HTTPS are included on the free plan).

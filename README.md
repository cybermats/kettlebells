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
pnpm test           # run the test suite (Vitest)
pnpm typecheck      # type-check without emitting
```

To deploy, run `pnpm build` and host the contents of `dist/` on any static file
server — there is no server runtime to operate.

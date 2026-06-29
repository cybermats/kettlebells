---
name: worktree
description: Manage a pool of isolated git worktrees under /tmp using a concurrency-safe slot system. Use when you (or parallel agents) need a scratch worktree to work in without disturbing the main checkout — acquire one, work in it, then release it back to the pool.
allowed-tools: Bash
---

# Git worktree pool

Hands out isolated git worktrees from a fixed pool of **slots** so multiple agents
can each work in their own checkout at the same time without stepping on each other
or on the main working directory. Worktrees live under `/tmp`.

All commands go through the helper script. Run it from anywhere inside the repo:

```bash
.claude/skills/worktree/worktree.sh <command> [args]
```

## Lifecycle

An agent **acquires** a worktree, **works** in it, then **releases** it back.

### 1. Acquire

```bash
WT=$(.claude/skills/worktree/worktree.sh acquire)
cd "$WT"
```

`acquire` prints the worktree path to **stdout** (capture it) and a human summary to
stderr. It claims the first free slot and creates a worktree there on a new branch
`wt/slot-N` cut from `HEAD`.

Options:
- `--branch <name>` — use/create this branch instead of the default `wt/slot-N`.
- `--base <ref>` — cut the new branch from `<ref>` instead of `HEAD`.
- `--detach` — detached `HEAD` at `--base` (no branch).

If every slot is taken it exits non-zero. Either `release` one, or raise the pool
size with `WORKTREE_MAX_SLOTS` (default 8).

### 2. Work

Do your work inside `$WT`. It is a full, independent checkout with its own branch,
index, and `HEAD`; commits there don't touch the main checkout. Commit as normal.

### 3. Release

```bash
.claude/skills/worktree/worktree.sh release "$WT"
```

From inside the worktree you can omit the argument — it infers the current one:

```bash
cd "$WT" && .claude/skills/worktree/worktree.sh release
```

You may also release by slot number: `release 3`.

Release refuses to discard uncommitted changes. To force-remove (throwing work away)
add `--force`. To also delete the slot's branch add `--delete-branch`. Releasing
frees the slot for the next agent.

## Inspecting & maintenance

```bash
.claude/skills/worktree/worktree.sh list    # show all slots: free / in-use, branch, path
.claude/skills/worktree/worktree.sh prune   # clear stale admin entries (e.g. after a /tmp wipe)
```

If `/tmp` was cleared out from under git, run `prune` to reconcile, then the slots
are free again.

## How it works (and why it's safe for parallel agents)

- The pool lives at `/tmp/<repo>-<hash>-worktrees/`, keyed by the main repo's path so
  different repos never collide. Slots are `slot-1 … slot-N`.
- Slot allocation happens under an `flock`'d lock file, so two agents calling
  `acquire` simultaneously are serialized and can never claim the same slot.
- The filesystem is the source of truth: a slot is in use iff its `slot-N` directory
  exists. Crash-resilient — there is no separate registry to get out of sync. Per-slot
  metadata under `.meta/` is only for `list` display.

## Notes

- Worktrees under `/tmp` are ephemeral. **Commit or push** anything you want to keep
  before releasing or before the machine clears `/tmp`.
- One agent = one slot at a time is the intended pattern. Always release when done so
  the pool doesn't leak slots.

#!/usr/bin/env bash
#
# worktree.sh — manage a pool of git worktrees under /tmp with a concurrency-safe
# slot system, so multiple agents can each hold an isolated worktree at once.
#
# Slots are claimed under an flock'd lock, so two agents calling `acquire` at the
# same time can never grab the same slot. The filesystem is the source of truth:
# a slot is "in use" iff its worktree directory exists.
#
# Commands:
#   acquire [--branch <name>] [--base <ref>] [--detach]
#   release [<slot|path>] [--delete-branch] [--force]
#   list
#   prune
#
# Env:
#   WORKTREE_MAX_SLOTS   max concurrent worktrees (default 8)

set -euo pipefail

MAX_SLOTS="${WORKTREE_MAX_SLOTS:-8}"

die() { echo "worktree: $*" >&2; exit 1; }

# Absolute path to the MAIN repo's root, even when called from inside a worktree.
main_root() {
  local cdir
  cdir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
    || die "not inside a git repository"
  dirname "$cdir"
}

# Stable per-repo base dir under /tmp. Keyed by repo name + path hash so distinct
# checkouts of the same repo name don't collide.
base_dir() {
  local root key
  root="$(main_root)"
  key="$(basename "$root")-$(printf '%s' "$root" | sha1sum | cut -c1-8)"
  printf '/tmp/%s-worktrees' "$key"
}

slot_path()  { printf '%s/slot-%s' "$(base_dir)" "$1"; }
meta_path()  { printf '%s/.meta/slot-%s' "$(base_dir)" "$1"; }

# Acquire the pool lock on fd 9 for the lifetime of this process.
lock_pool() {
  local base
  base="$(base_dir)"
  mkdir -p "$base/.meta"
  exec 9>"$base/.lock"
  flock 9
}

cmd_acquire() {
  local branch="" base_ref="HEAD" detach=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --branch) branch="${2:?--branch needs a value}"; shift 2 ;;
      --base)   base_ref="${2:?--base needs a value}"; shift 2 ;;
      --detach) detach=1; shift ;;
      *) die "acquire: unknown arg '$1'" ;;
    esac
  done

  local root base
  root="$(main_root)"
  base="$(base_dir)"
  lock_pool

  # Find the first free slot (no worktree directory present).
  local n wt=""
  for n in $(seq 1 "$MAX_SLOTS"); do
    local candidate; candidate="$(slot_path "$n")"
    if [ ! -e "$candidate" ]; then wt="$candidate"; break; fi
  done
  [ -n "$wt" ] || die "all $MAX_SLOTS slots are in use (raise WORKTREE_MAX_SLOTS or release one)"

  [ -z "$branch" ] && branch="wt/slot-$n"

  # Create the worktree. Detached, existing branch, or fresh branch.
  if [ "$detach" -eq 1 ]; then
    git -C "$root" worktree add --detach "$wt" "$base_ref" >/dev/null
  elif git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$root" worktree add "$wt" "$branch" >/dev/null
  else
    git -C "$root" worktree add -b "$branch" "$wt" "$base_ref" >/dev/null
  fi

  # Record metadata for `list`.
  {
    echo "slot=$n"
    echo "path=$wt"
    echo "branch=$([ "$detach" -eq 1 ] && echo '(detached)' || echo "$branch")"
    echo "base=$base_ref"
    echo "created=$(date -Iseconds)"
    echo "pid=$$"
  } > "$(meta_path "$n")"

  # Machine-readable line first, then a human hint on stderr.
  echo "$wt"
  echo "acquired slot $n at $wt (branch: ${branch})" >&2
}

cmd_release() {
  local target="" delete_branch=0 force=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --delete-branch) delete_branch=1; shift ;;
      --force) force=1; shift ;;
      -*) die "release: unknown flag '$1'" ;;
      *) target="$1"; shift ;;
    esac
  done

  local root base wt
  root="$(main_root)"
  base="$(base_dir)"

  # Resolve target: explicit slot number, explicit path, or infer from cwd.
  if [ -z "$target" ]; then
    wt="$(git rev-parse --show-toplevel 2>/dev/null)" || die "release: no slot/path given and not inside a worktree"
  elif [[ "$target" =~ ^[0-9]+$ ]]; then
    wt="$(slot_path "$target")"
  else
    wt="$target"
  fi
  [ -e "$wt" ] || die "release: worktree not found: $wt"

  case "$wt" in
    "$base"/slot-*) : ;;
    *) die "release: '$wt' is not a managed worktree under $base" ;;
  esac
  local n="${wt##*/slot-}"

  # Move out of the worktree before removing it, so removing our own cwd doesn't
  # leave later git calls running from a deleted directory.
  cd "$root"
  lock_pool

  # Capture branch before removal (for optional --delete-branch).
  local branch=""
  branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

  local rm_args=()
  [ "$force" -eq 1 ] && rm_args+=(--force)
  if ! git -C "$root" worktree remove "${rm_args[@]}" "$wt" 2>/dev/null; then
    die "could not remove $wt (uncommitted changes? re-run with --force to discard)"
  fi
  rm -f "$base/.meta/slot-$n"

  if [ "$delete_branch" -eq 1 ] && [ -n "$branch" ] && [ "$branch" != "HEAD" ]; then
    git -C "$root" branch -D "$branch" >/dev/null 2>&1 \
      && echo "deleted branch $branch" >&2 || true
  fi

  echo "released slot $n" >&2
}

cmd_list() {
  local base; base="$(base_dir)"
  printf '%-5s %-10s %-28s %s\n' "SLOT" "STATE" "BRANCH" "PATH"
  local n
  for n in $(seq 1 "$MAX_SLOTS"); do
    local wt meta="" state branch="-" path="-"
    wt="$(slot_path "$n")"
    if [ -e "$wt" ]; then
      state="in-use"
      path="$wt"
      meta="$(meta_path "$n")"
      [ -f "$meta" ] && branch="$(sed -n 's/^branch=//p' "$meta")"
    else
      state="free"
    fi
    printf '%-5s %-10s %-28s %s\n' "$n" "$state" "$branch" "$path"
  done
}

cmd_prune() {
  local root; root="$(main_root)"
  git -C "$root" worktree prune
  echo "pruned stale worktree administrative entries" >&2
}

[ $# -ge 1 ] || die "usage: worktree.sh {acquire|release|list|prune} [args]"
cmd="$1"; shift
case "$cmd" in
  acquire) cmd_acquire "$@" ;;
  release) cmd_release "$@" ;;
  list)    cmd_list "$@" ;;
  prune)   cmd_prune "$@" ;;
  *) die "unknown command '$cmd'" ;;
esac

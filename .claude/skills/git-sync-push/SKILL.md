---
name: git-sync-push
description: Safely sync and push local work to main - stash local changes, pull the latest from the remote, pop the stash, commit, and push to main. Use this skill whenever the user says "git push", "push to main", "pull then push", "sync and push", "stash pop and push", "push my changes", or wants to ship local changes to the main branch while making sure remote changes are pulled in first, even if they don't mention stash or pull explicitly.
---

# Git Sync & Push

Push local work to `main` without clobbering remote changes: **stash -> pull -> stash pop -> commit -> push**.

## Workflow

Run these steps in order from the repo root. Stop and report at any failure; never skip ahead.

### 1. Inspect
```bash
git status --short
git branch --show-current
git remote -v
```
- Confirm the current branch. If it is not `main`, tell the user and ask whether to switch to `main` or push this branch. Do not assume.
- Note whether there are uncommitted changes (tracked or untracked) and/or unpushed commits.

### 2. Stash local changes (only if there are uncommitted changes)
```bash
git stash push -u -m "git-sync-push: auto-stash $(date +%Y%m%d-%H%M%S)"
```
`-u` includes untracked files. If the working tree is clean, skip this step and step 4.

### 3. Pull the latest from remote
```bash
git pull --rebase origin main
```
- Use `--rebase` to keep history linear (existing local commits get replayed on top of remote).
- If the user prefers merge commits, use `git pull origin main` instead.
- On rebase conflicts: stop, list conflicted files (`git status`), help resolve them, then `git rebase --continue`. Never use `--skip` or `--abort` without asking.

### 4. Restore stashed changes
```bash
git stash pop
```
- If conflicts occur, the stash is **kept** by git. Show conflicted files, resolve them with the user, then `git add` the resolved files and `git stash drop` once everything is verified.
- Never drop the stash while conflicts are unresolved.

### 5. Commit
- Review what will be committed: `git status --short` and `git diff --stat`.
- Stage and commit: `git add -A && git commit -m "<message>"`.
- Message: use the one the user gave; otherwise write a short, imperative summary based on the diff (e.g. `Fix login redirect on expired session`) and show it in the report.
- If there is nothing to commit but there are unpushed commits, skip to step 6.
- If both are empty, report "nothing to push" and stop.

### 6. Push to main
```bash
git push origin main
```
- If rejected (remote moved again), repeat from step 3 once. Do not retry in a loop.
- **Never use `--force` or `--force-with-lease`** unless the user explicitly asks for it.

### 7. Report
Summarize briefly: branch, whether a stash was made/popped, new commits pulled in (count), commit(s) pushed (hash + message), and anything the user needs to follow up on.

## Safety rules
- Never force-push, `reset --hard`, or `stash drop` unprompted.
- If the repo has protected `main` (push rejected by policy), say so and offer to create a feature branch + PR instead.
- Don't push secrets: if `git status` shows files like `.env`, credentials, or key files being staged, pause and ask.
- If no remote is configured or auth fails, report the exact error rather than guessing.

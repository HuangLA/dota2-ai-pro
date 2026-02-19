# Session Checklist

Use this checklist at the start and end of every coding session.

## 1) Get bearings

- Confirm current branch and cleanly identify in-scope files.
- Read `PROGRESS.md` first.
- Read latest `harness/agent-progress.md` entry.

## 2) Read execution context

- Review recent commits: `git log --oneline -n 15`.
- Review current plan source: `harness/feature_list.json`.
- Pick exactly one feature/task for this session.

## 3) Run init

- Run `harness/init.bat` on Windows or `bash harness/init.sh` on bash.
- Ensure backend/frontend dependency checks pass or capture missing prerequisites.

## 4) Implement one feature only

- Keep scope minimal and reversible.
- Avoid unrelated refactors.
- Update tests/docs only for the selected feature.

## 5) Verify with critical regression

- Run at least one targeted test or non-destructive smoke check.
- Run one lightweight end-to-end path relevant to the feature.
- Record exact commands and result in `harness/agent-progress.md`.

## 6) Close session

- Update feature state in `harness/feature_list.json` (`passes` only when verified).
- Append handoff entry to `harness/agent-progress.md`.
- Add one minimal update line into `PROGRESS.md` when milestone-level progress is made.

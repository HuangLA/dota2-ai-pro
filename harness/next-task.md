# Next Task (One Session)

## Selected feature

- Feature ID: `PH4-1-OPENDOTA-SYNC`
- Slice ID: `PH4-1-OPENDOTA-SYNC-SLICE-1`
- Goal: add a minimal OpenDota connectivity + recent matches sync skeleton that can run safely in one session.

## Scope (small step)

- Add `backend/services/opendota_service.py` with:
  - typed client method to fetch recent matches (bounded page/limit),
  - timeout + basic error handling.
- Add one backend endpoint (example: `POST /api/v1/admin/opendota/sync/recent`) that:
  - calls service,
  - returns fetched count + dry-run summary,
  - does not change existing replay/playback flows.
- Add one focused test for successful service call path (mocked HTTP).

## Acceptance criteria

- Endpoint returns `200` with deterministic JSON shape: `status`, `fetched`, `dry_run`.
- Service handles upstream timeout/network error and returns controlled failure response.
- Existing core endpoints (`/api/v1/matches`, `/api/v1/playback/{id}/ticks`) remain unaffected.

## Test steps

1. Run backend targeted test for OpenDota service/endpoint.
2. Call new endpoint in dry-run mode and confirm non-zero/zero fetched handling.
3. Call existing health or matches endpoint as quick regression.

## Completion update protocol

- In `harness/feature_list.json`:
  - keep `PH4-1-OPENDOTA-SYNC` as `passes: false` unless end-to-end sync is fully verified,
  - optionally add a child/slice feature entry for this step and mark that slice `passes: true`.
- In `harness/agent-progress.md`:
  - append one new entry with commands, results, and follow-up risks.
- In `PROGRESS.md`:
  - append one minimal line in update log noting the completed slice.

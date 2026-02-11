# Replay Management System - Implementation Plan

## 1. Current Status Analysis
- **Backend**: 
  - Upload/Parse APIs are fully functional (`routers/replays.py`).
  - Match APIs (List/Delete) are functional (`routers/matches.py`).
  - Database Schema (`sqlite_db.py`) already has tables and indexes for `player_matches` and `teams`, supporting future search requirements.
- **Frontend**:
  - `RealMatchViewer` exists for viewing single matches.
  - **Missing**: Replay Upload UI, Match List UI, Delete functionality.

## 2. Implementation Roadmap

### Phase 1: Backend Enhancements (Search Prep)
Although the schema supports it, the current `GET /api/v1/matches` endpoint only filters by `status` and `league_id`.
- **Task B1**: Update `backend/storage/match_storage.py` -> `list_matches` to accept `player_id` and `team_id`.
- **Task B2**: Update `backend/routers/matches.py` -> `list_matches` to expose these query parameters.

### Phase 2: Frontend - Match List & Management
Create a dashboard to view and manage parsed matches.
- **Task F1**: Create `api/matchService.ts` (Client for new endpoints).
- **Task F2**: Create `MatchListPage` (`/matches`).
  - **Components**: 
    - Data Grid (Match ID, Winner, Duration, Played At).
    - "Delete" button with confirmation (Calls `DELETE /matches/{id}`).
    - "Watch" button (Navigates to `/match/{id}`).
    - Filter inputs (future hookup for Player/Team search).

### Phase 3: Frontend - Replay Upload & Parsing
Create a streamlined workflow for adding new matches.
- **Task F3**: Create `ReplayUpload` component.
  - Drag & Drop zone for `.dem` files.
  - Calls `POST /api/v1/replays/upload`.
- **Task F4**: Create `ParseStatus` component.
  - Polls `GET /api/v1/replays/tasks`.
  - Shows progress bars for active parsing tasks.
  - Auto-refreshes Match List upon completion.

## 3. Future Search Features (Planned)
Since Phase 1 adds the backend support:
- **UI**: Add "Search by Player ID" and "Search by Team ID" inputs to the `MatchListPage` filter bar.

## 4. Execution Order
1. **Backend**: Add search filters (Quick win).
2. **Frontend**: Build Match List (allows verifying backend data).
3. **Frontend**: Build Upload/Parse UI (completes the loop).

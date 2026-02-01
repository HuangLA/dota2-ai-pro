# Task List: Dota 2 Professional Replay Analysis Tool

## Phase 1: Planning & Requirements [ ]
- [/] **Feasibility & Feature Discussion**
    - [x] Research Valve .dem file format and parsing feasibility.
    - [x] Present feature proposals (Vision, Economy, Combat, Movement) to user.
    - [x] Refine requirements based on user feedback.
- [/] **Product Requirements Document (PRD)**
    - [x] Draft PRD.md including User Stories, Functional Requirements, and Non-functional Requirements.
    - [x] Define MVP scope vs Future features.
    - [x] Review PRD with user.
- [x] **Technical Architecture**
    - [x] Select Replay Parser (Go - Manta).
    - [x] Define Backend stack (Python + Pandas for AI).
    - [x] Define Frontend stack (Electron + React + PixiJS).

## Phase 2: MVP Implementation [ ]
- [ ] **Setup & Infrastructure**
    - [ ] Initialize Electron + React project.
    - [ ] Set up Python virtual environment and sidecar script.
    - [ ] Compile/Install Manta parsing tool.
- [ ] **Core Parsing Engine**
    - [ ] Implement Node.js <-> Python IPC bridge.
    - [ ] Implement .dem file parsing pipe (Dem -> Manta -> JSON -> Python).
    - [ ] Data Cleaning: Convert raw JSON to Pandas DataFrames.
- [ ] **Data Analysis Modules**
    - [ ] Basic Stats: Gold/XP graphs, LH/DN.
    - [ ] Map Data: Extract Hero trajectories (X, Y, Time).
    - [ ] Combat Log: Parse damage events.
- [ ] **Frontend Visualization**
    - [ ] Dashboard UI (Chart.js/Recharts).
    - [ ] Interactive Map (PixiJS) - Rendering background and hero icons.

## Phase 3: AI & Advanced Modules [ ]
- [ ] **Habit Analysis Engine**
    - [ ] Implement Ward Clustering (Scikit-learn DBSCAN).
    - [ ] Implement Rotation Timing Logic.
- [ ] **Multi-Match Analysis**
    - [ ] Database schema for storing aggregate match data.
    - [ ] "Compare to Pro" functionality.

## Phase 3: Verification & Delivery [ ]
- [ ] **Testing**
    - [ ] Test with sample .dem files (Standard & Pro matches).
    - [ ] Verify data accuracy against in-game scoreboard.
- [ ] **Documentation**
    - [ ] Writing User Guide for analysts.

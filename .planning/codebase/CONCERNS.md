# Codebase Concerns

## Brownfield Risks

### 1. Current domain model is Excel-first

`TableInfo` and related shapes are useful for parsing spreadsheets, but they are not yet a full canonical schema model for live DB management. Foreign keys, indexes, unique constraints, and deployment metadata need richer representation.

### 2. The app is packaged as a mostly single built product

Frontend, backend, and desktop flows are coordinated, but there is no extension runtime boundary yet. Loading optional UI and server logic from downloaded artifacts will require a deliberate host API.

### 3. GitHub updates currently target the whole application

The app already uses GitHub Releases for application updates, but extension asset delivery is a different problem. It needs its own catalog, checksums, compatibility rules, and error handling.

### 4. Existing codebase is already active

The git worktree is not clean, which means project initialization and future extension work must avoid accidental coupling with unrelated edits.

### 5. DB management can expand scope rapidly

There is a risk of unintentionally building a DBeaver-like general database client. The project needs strong scope guards to stay focused on:

- schema management
- diff
- deploy preview/apply
- visualization

## Product Risks

- Oracle/native dependency weight may complicate downloadable packaging
- Manifest security and trust checks must be explicit
- Download/install failures need a smooth recovery path
- The base app must not regress when no extension is installed

## Execution Guidance

- Build the extension host before the DB extension itself
- Make the DB extension official-only first
- Introduce canonical schema normalization early
- Keep destructive deploy actions gated and conservative


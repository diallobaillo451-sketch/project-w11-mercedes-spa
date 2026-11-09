# Push W11 shared assets to GitLab (newbot-shared)

## Rules (Baillo / Opi)

- Project: `issagabah451/project-w11-mercedes-spa`
- Branch: **`newbot-shared` only** — never `main`, never Pages pipeline
- Destination root: `shared/` (e.g. `shared/assets/monza_2020/…`)
- No git auth / no LFS on this box → use GitLab MCP `user-GitLab` / `add_commit`
- Encode binaries as **base64**; text (`.md`, `.json`, `.gltf`, `.sh`, `.ps1`) as `encoding: "text"`
- Commit messages end with `[skip ci]`
- Push **in real time** at each delivery, not at the end

## Size limits

- Raw file **> ~3 MiB** → split into numbered parts: `<name>.part001`, `<name>.part002`, …
- Keep each part ≤ 3 MiB raw (≈ 4 MiB base64)
- Prefer **1 large part per commit**; pack many small files per commit (budget ≈ 3.0–3.2 MiB raw total, ≤ 50 files)
- Before retrying a failed commit: `list_repository_tree` / `get_repository_file` to see if it already landed

## Per-folder helpers (required when anything was split)

In each delivered folder (`shared/assets/<circuit>/`, `shared/assets/spa_pits/`, …):

1. **`REASSEMBLE.md`** — table of split files with size, part count, sha256; plus full sha256 inventory
2. **`reassemble.sh`** — `cat <file>.part* > <file>` then `sha256sum -c`
3. **`reassemble.ps1`** — same for Windows PowerShell

## Staging layout (local)

```
/workspace/w11-shared/work/gitlab_push/
  staging/           # mirrored shared-relative paths + *.content payloads
  batches/batch_NNN.json
  manifest.json      # split list, batch list, totals
  progress.json      # next_batch, completed shas, failures
```

Generate with the staging Python used for monza/spa_pits (see transcript / recreate from this doc).

Each `*.content` file is either UTF-8 text or **raw base64 with no newlines**.

## MCP call pattern

```text
namespace: user-GitLab
tool:     add_commit
args:
  project_id: issagabah451/project-w11-mercedes-spa
  branch: newbot-shared
  commit_message: "shared: … [skip ci]"
  actions:
    - action: create          # or update if file already exists
      file_path: shared/assets/...
      content: "$file:/workspace/w11-shared/work/gitlab_push/staging/....content"
      encoding: base64 | text
      execute_filemode: true  # only for reassemble.sh
```

`$file:…` is expanded by CallDynamicTool (external MCP) before the request is sent — required for large payloads.

## Sequential commits only

Never fire two `add_commit` calls in parallel on the same branch (race on HEAD). One commit → wait for sha → next.

## Verify

1. `list_repository_tree` recursive on `shared/assets/<folder>` @ `newbot-shared`
2. Spot-check: fetch all parts of one split file via `get_repository_file`, concat, compare sha256 to `REASSEMBLE.md`
3. Tree URL:
   `https://gitlab.com/issagabah451/project-w11-mercedes-spa/-/tree/newbot-shared/shared/assets`

## Also push with every circuit delivery

- `/workspace/w11-shared/assets/CIRCUITS_STATUS.md` → `shared/assets/CIRCUITS_STATUS.md`
- `/workspace/w11-shared/work/SPA_VISUAL_PARITY.md` → `shared/work/SPA_VISUAL_PARITY.md`
- Any new `MANQUANTS.md` / previews / marshals.json for that circuit

## Report back to parent / Opi

- Commit count + list of shas (or first/last)
- Total raw size pushed
- Files that were split
- Failures (path + error)
- Tree URL

## Hard limit: 4 `$file:` refs per CallDynamicTool

CallDynamicTool replaces at most **4** `$file:/abs/path` symbolic arguments per call.
Therefore each `add_commit` can attach at most 4 file payloads via `$file`.
Practical packing: **exactly 4 files per commit**, all via `$file:` (base64 or text).
Payloads of **4 × ~4 MiB base64 (~16 MiB)** have been verified to work on GitLab.com via this MCP.

Do **not** fire parallel `add_commit` calls on `newbot-shared` (HEAD race).

## Important: MCP stores base64 literally

Even with `encoding: "base64"`, the GitLab MCP `add_commit` path used here leaves the
**base64 text** as the blob content (same as earlier `shared/incoming/cars/` pushes).
Consumers must `base64 -d` non-text files. For split files, decode **each part**, then
concatenate (see `reassemble.sh`). Spot-check: fetch parts via raw API, decode each,
concat, compare sha256 to `REASSEMBLE.md`.

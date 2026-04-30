"""Migration 001 — introduce Projects and Fireworks.

The model shifts from "user owns shows + per-user library of videos" to
"project owns shows + project's inventory of fireworks; each firework has
0..N videos." See CHANGES / discussion in the project repo for the full
rationale; this module performs the one-shot schema + data migration.

Key decisions baked in here:
- Fireworks live in a global pool (rows in `fireworks`). A project's
  "library" is `project_fireworks` rows pointing at them. This sets up
  for cross-project reuse and a future public/manufacturer marketplace.
- Naming priority for the migrated firework is, in order:
    1. The instance's `name` field as it appeared in any show.data
       (preserves what the user actually wrote on each clip)
    2. Title from any user's library entry for that filename
    3. videos.title (the YouTube title)
    4. The filename itself (last-resort fallback)
- Library trim/crop defaults move from `library.metadata` onto the
  `firework_videos` row as `default_trim_*` / `default_crop_*`.
- Show data is rewritten: `data.videos[]` (per-instance with filename) →
  `data.fireworks[]` (per-instance with firework_id; trim/crop become
  optional overrides).
- The old `library` table is renamed `library_v1_archive` for safety
  rather than dropped, in case the migration is wrong.
"""

from __future__ import annotations

import json
import os
from typing import Any


def _execute(cur, sql: str, params: tuple | None = None) -> None:
    if params is not None:
        cur.execute(sql, params)
    else:
        cur.execute(sql)


def _fetchone(cur):
    return cur.fetchone()


def _fetchall(cur):
    return cur.fetchall()


def _admin_user_ids() -> set[int]:
    raw = os.environ.get("ADMIN_USER_IDS", "").strip()
    if not raw:
        return set()
    try:
        return {int(x.strip()) for x in raw.split(",") if x.strip()}
    except ValueError:
        return set()


def run(conn) -> None:
    cur = conn.cursor()

    # -------- Schema --------
    _execute(cur, """
        CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            plan TEXT NOT NULL DEFAULT 'free',
            created_by_user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    _execute(cur, """
        CREATE TABLE IF NOT EXISTS project_members (
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'editor',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (project_id, user_id)
        )
    """)
    _execute(cur, """
        CREATE INDEX IF NOT EXISTS idx_project_members_user
        ON project_members(user_id)
    """)

    _execute(cur, """
        CREATE TABLE IF NOT EXISTS fireworks (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            manufacturer TEXT,
            description TEXT,
            box_photo_url TEXT,
            fuse_delay_seconds REAL,
            effect_duration_seconds REAL,
            shot_count INTEGER,
            grams INTEGER,
            price_cents INTEGER,
            source_url TEXT,
            visibility TEXT NOT NULL DEFAULT 'project',
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by_user_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    _execute(cur, """
        CREATE INDEX IF NOT EXISTS idx_fireworks_visibility
        ON fireworks(visibility)
    """)

    _execute(cur, """
        CREATE TABLE IF NOT EXISTS firework_videos (
            id SERIAL PRIMARY KEY,
            firework_id INTEGER NOT NULL REFERENCES fireworks(id) ON DELETE CASCADE,
            video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
            kind TEXT NOT NULL DEFAULT 'user',
            is_primary BOOLEAN NOT NULL DEFAULT FALSE,
            default_trim_start REAL DEFAULT 0,
            default_trim_end REAL DEFAULT 0,
            default_crop_x REAL DEFAULT 0,
            default_crop_y REAL DEFAULT 0,
            default_crop_width REAL DEFAULT 100,
            default_crop_height REAL DEFAULT 100,
            created_by_user_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (firework_id, video_id)
        )
    """)
    _execute(cur, """
        CREATE INDEX IF NOT EXISTS idx_firework_videos_firework
        ON firework_videos(firework_id)
    """)
    # Only one primary video per firework
    _execute(cur, """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_firework_videos_one_primary
        ON firework_videos(firework_id) WHERE is_primary
    """)

    _execute(cur, """
        CREATE TABLE IF NOT EXISTS project_fireworks (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            firework_id INTEGER NOT NULL REFERENCES fireworks(id) ON DELETE CASCADE,
            count INTEGER DEFAULT 1,
            notes TEXT,
            added_by_user_id INTEGER REFERENCES users(id),
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (project_id, firework_id)
        )
    """)
    _execute(cur, """
        CREATE INDEX IF NOT EXISTS idx_project_fireworks_project
        ON project_fireworks(project_id)
    """)

    # Add project_id and created_by_user_id to shows (keep user_id for now;
    # later migration can drop it once code paths are removed)
    _execute(cur, """
        ALTER TABLE shows ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id)
    """)
    _execute(cur, """
        ALTER TABLE shows ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id)
    """)

    # -------- Data --------
    _execute(cur, "SELECT id, username FROM users ORDER BY id")
    users = _fetchall(cur)
    if not users:
        print("    no users — nothing to migrate")
        return

    admin_ids = _admin_user_ids()
    owner = next((u for u in users if u["id"] in admin_ids), users[0])
    owner_id = owner["id"]
    print(f"    project owner: user_id={owner_id} ({owner['username']})")

    # Create the default project (idempotent: only once via name match)
    _execute(cur, "SELECT id FROM projects WHERE name = %s", ("2026 - 4th of July",))
    existing_project = _fetchone(cur)
    if existing_project:
        project_id = existing_project["id"]
        print(f"    reusing existing project id={project_id}")
    else:
        _execute(cur, """
            INSERT INTO projects (name, plan, created_by_user_id)
            VALUES (%s, 'free', %s) RETURNING id
        """, ("2026 - 4th of July", owner_id))
        project_id = _fetchone(cur)["id"]
        print(f"    created project '2026 - 4th of July' (id={project_id})")

    # Membership
    for u in users:
        role = "owner" if u["id"] in admin_ids else "editor"
        _execute(cur, """
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
        """, (project_id, u["id"], role))
    print(f"    members added: {len(users)}")

    # ---- Build the filename → name map (priority order documented above) ----
    name_for: dict[str, tuple[str, int]] = {}  # filename -> (name, priority)

    def _propose(filename: str, name: str | None, priority: int) -> None:
        if not filename or not name:
            return
        if name == filename:
            return
        existing = name_for.get(filename)
        if not existing or existing[1] > priority:
            name_for[filename] = (name, priority)

    # Priority 4: videos.title
    _execute(cur, "SELECT filename, title FROM videos")
    for row in _fetchall(cur):
        _propose(row["filename"], row["title"], 4)

    # Priority 3: any library title (only if `library` still exists)
    _execute(cur, """
        SELECT to_regclass('public.library') IS NOT NULL AS has_library
    """)
    has_library = bool(_fetchone(cur)["has_library"])
    if has_library:
        _execute(cur, """
            SELECT v.filename, l.metadata
            FROM library l JOIN videos v ON l.video_id = v.id
        """)
        for row in _fetchall(cur):
            try:
                meta = json.loads(row["metadata"]) if row["metadata"] else {}
            except (TypeError, ValueError):
                meta = {}
            _propose(row["filename"], meta.get("title"), 3)

    # Priority 2 (best): show instance names — these are what the user
    # explicitly typed on each clip, e.g. "Mr Rex", "Trooper".
    _execute(cur, "SELECT id, user_id, name, data FROM shows")
    shows = _fetchall(cur)
    for show in shows:
        try:
            data = json.loads(show["data"]) if show["data"] else {}
        except (TypeError, ValueError):
            data = {}
        for inst in (data.get("videos") or []):
            _propose(inst.get("filename"), inst.get("name"), 2)

    # ---- Per-filename: create firework + firework_videos + project_fireworks ----
    _execute(cur, "SELECT id, filename, title FROM videos ORDER BY id")
    all_videos = _fetchall(cur)

    firework_id_by_filename: dict[str, int] = {}
    print(f"    creating fireworks for {len(all_videos)} unique videos")
    for v in all_videos:
        filename = v["filename"]
        chosen_name = name_for.get(filename, (filename, 99))[0]

        # Library defaults (highest-id wins arbitrarily — they should mostly agree).
        lib_meta: dict[str, Any] = {}
        if has_library:
            _execute(cur, """
                SELECT metadata FROM library WHERE video_id = %s ORDER BY id DESC LIMIT 1
            """, (v["id"],))
            row = _fetchone(cur)
            if row and row["metadata"]:
                try:
                    lib_meta = json.loads(row["metadata"])
                except (TypeError, ValueError):
                    lib_meta = {}

        _execute(cur, """
            INSERT INTO fireworks (name, visibility, metadata, created_by_user_id)
            VALUES (%s, 'project', '{}'::jsonb, %s)
            RETURNING id
        """, (chosen_name, owner_id))
        firework_id = _fetchone(cur)["id"]

        _execute(cur, """
            INSERT INTO firework_videos (
                firework_id, video_id, kind, is_primary,
                default_trim_start, default_trim_end,
                default_crop_x, default_crop_y, default_crop_width, default_crop_height,
                created_by_user_id
            ) VALUES (%s, %s, 'user', TRUE, %s, %s, %s, %s, %s, %s, %s)
        """, (
            firework_id, v["id"],
            float(lib_meta.get("defaultTrimStart") or 0),
            float(lib_meta.get("defaultTrimEnd") or 0),
            float(lib_meta.get("defaultCropX") or 0),
            float(lib_meta.get("defaultCropY") or 0),
            float(lib_meta.get("defaultCropWidth") or 100),
            float(lib_meta.get("defaultCropHeight") or 100),
            owner_id,
        ))

        _execute(cur, """
            INSERT INTO project_fireworks (project_id, firework_id, added_by_user_id)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
        """, (project_id, firework_id, owner_id))

        firework_id_by_filename[filename] = firework_id

    # ---- Rewrite shows ----
    print(f"    migrating {len(shows)} shows")
    for show in shows:
        try:
            data = json.loads(show["data"]) if show["data"] else {}
        except (TypeError, ValueError):
            data = {}

        old_instances = data.get("videos") or []
        new_instances = []
        for inst in old_instances:
            filename = inst.get("filename")
            firework_id = firework_id_by_filename.get(filename)
            if not firework_id:
                print(f"      WARN show {show['id']}: instance filename {filename!r} "
                      f"has no firework row — dropping instance")
                continue
            new_instances.append({
                "id": inst.get("id"),
                "firework_id": firework_id,
                # video_id null → use the firework's primary video at runtime
                "video_id": None,
                "offset": inst.get("offset", 0),
                # Per-instance overrides; null/absent means "use the firework_video defaults".
                "trim_start": inst.get("trimStart"),
                "trim_end": inst.get("trimEnd"),
                "crop_x": inst.get("cropX"),
                "crop_y": inst.get("cropY"),
                "crop_width": inst.get("cropWidth"),
                "crop_height": inst.get("cropHeight"),
                "volume": inst.get("volume", 1.0),
                "color": inst.get("color"),
                # Keep the user-typed clip name for display purposes (we'll show
                # it as "Trooper" even if the firework is named "Trooper" too).
                "label": inst.get("name"),
            })

        new_data = {
            "totalDuration": data.get("totalDuration", 60),
            "zoom": data.get("zoom", 1),
            "fireworks": new_instances,
        }

        _execute(cur, """
            UPDATE shows
            SET project_id = %s,
                created_by_user_id = COALESCE(created_by_user_id, user_id),
                data = %s
            WHERE id = %s
        """, (project_id, json.dumps(new_data), show["id"]))

    # Archive legacy table (don't drop — safety net)
    if has_library:
        _execute(cur, """
            ALTER TABLE library RENAME TO library_v1_archive
        """)
        print("    renamed library → library_v1_archive (kept for safety)")

    print("    migration body complete")

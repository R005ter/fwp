"""DB helpers for the project / firework model introduced in migration 001.

Kept separate from `database.py` so the legacy helpers there stay clean
and the new surface is easy to audit. Everything here uses the same
`get_db()` connection helper from database.py.
"""

from __future__ import annotations

import json
from typing import Any

from database import get_db, execute_sql, fetch_one, fetch_all


# ---------------------------------------------------------------------------
# Projects + membership
# ---------------------------------------------------------------------------

def list_projects_for_user(user_id: int) -> list[dict]:
    """Projects the user is a member of, with their role."""
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            SELECT p.id, p.name, p.plan, p.created_at, pm.role
            FROM projects p
            JOIN project_members pm ON pm.project_id = p.id
            WHERE pm.user_id = %s
            ORDER BY p.created_at ASC, p.id ASC
        """, (user_id,))
        return list(fetch_all(cur))
    finally:
        conn.close()


def get_project(project_id: int) -> dict | None:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, "SELECT * FROM projects WHERE id = %s", (project_id,))
        return fetch_one(cur)
    finally:
        conn.close()


def get_member_role(project_id: int, user_id: int) -> str | None:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            SELECT role FROM project_members WHERE project_id = %s AND user_id = %s
        """, (project_id, user_id))
        row = fetch_one(cur)
        return row["role"] if row else None
    finally:
        conn.close()


def list_project_members(project_id: int) -> list[dict]:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            SELECT pm.user_id, u.username, u.email, pm.role, pm.joined_at
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = %s
            ORDER BY pm.joined_at ASC
        """, (project_id,))
        return list(fetch_all(cur))
    finally:
        conn.close()


def create_project(name: str, owner_user_id: int, plan: str = "free") -> dict:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            INSERT INTO projects (name, plan, created_by_user_id)
            VALUES (%s, %s, %s) RETURNING id
        """, (name, plan, owner_user_id))
        project_id = fetch_one(cur)["id"]
        execute_sql(cur, """
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (%s, %s, 'owner')
        """, (project_id, owner_user_id))
        conn.commit()
        return {"id": project_id, "name": name, "plan": plan, "role": "owner"}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Fireworks + their videos
# ---------------------------------------------------------------------------

_FIREWORK_BASIC_COLS = (
    "id, name, manufacturer, description, box_photo_url, "
    "fuse_delay_seconds, effect_duration_seconds, shot_count, grams, "
    "price_cents, source_url, visibility, metadata, created_by_user_id, "
    "created_at, updated_at"
)


def _firework_row_to_dict(row: dict) -> dict:
    out = dict(row)
    md = out.get("metadata")
    if isinstance(md, str):
        try:
            out["metadata"] = json.loads(md)
        except (TypeError, ValueError):
            out["metadata"] = {}
    elif md is None:
        out["metadata"] = {}
    return out


def get_firework(firework_id: int) -> dict | None:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, f"SELECT {_FIREWORK_BASIC_COLS} FROM fireworks WHERE id = %s",
                    (firework_id,))
        row = fetch_one(cur)
        return _firework_row_to_dict(row) if row else None
    finally:
        conn.close()


def list_fireworks_for_project(project_id: int) -> list[dict]:
    """All fireworks in a project's inventory, joined with the primary video info."""
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, f"""
            SELECT
                {", ".join("f." + c for c in _FIREWORK_BASIC_COLS.split(", "))},
                pf.count AS project_count,
                pf.notes AS project_notes,
                fv.id AS primary_firework_video_id,
                v.filename AS primary_filename,
                fv.default_trim_start, fv.default_trim_end,
                fv.default_crop_x, fv.default_crop_y,
                fv.default_crop_width, fv.default_crop_height
            FROM project_fireworks pf
            JOIN fireworks f ON pf.firework_id = f.id
            LEFT JOIN firework_videos fv ON fv.firework_id = f.id AND fv.is_primary
            LEFT JOIN videos v ON v.id = fv.video_id
            WHERE pf.project_id = %s
            ORDER BY f.name COLLATE "C" ASC
        """, (project_id,))
        return [_firework_row_to_dict(r) for r in fetch_all(cur)]
    finally:
        conn.close()


def list_firework_videos(firework_id: int) -> list[dict]:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            SELECT fv.id, fv.video_id, fv.kind, fv.is_primary,
                   fv.default_trim_start, fv.default_trim_end,
                   fv.default_crop_x, fv.default_crop_y,
                   fv.default_crop_width, fv.default_crop_height,
                   v.filename, v.title AS video_title
            FROM firework_videos fv
            JOIN videos v ON v.id = fv.video_id
            WHERE fv.firework_id = %s
            ORDER BY fv.is_primary DESC, fv.id ASC
        """, (firework_id,))
        return list(fetch_all(cur))
    finally:
        conn.close()


def create_firework(*,
                    name: str,
                    created_by: int,
                    visibility: str = "project",
                    fields: dict | None = None,
                    metadata: dict | None = None) -> int:
    fields = fields or {}
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            INSERT INTO fireworks (
                name, manufacturer, description, box_photo_url,
                fuse_delay_seconds, effect_duration_seconds, shot_count, grams,
                price_cents, source_url, visibility, metadata, created_by_user_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            RETURNING id
        """, (
            name,
            fields.get("manufacturer"),
            fields.get("description"),
            fields.get("box_photo_url"),
            fields.get("fuse_delay_seconds"),
            fields.get("effect_duration_seconds"),
            fields.get("shot_count"),
            fields.get("grams"),
            fields.get("price_cents"),
            fields.get("source_url"),
            visibility,
            json.dumps(metadata or {}),
            created_by,
        ))
        firework_id = fetch_one(cur)["id"]
        conn.commit()
        return firework_id
    finally:
        conn.close()


# Columns we let the PATCH endpoint touch directly. metadata is special-cased.
_PATCHABLE_FIREWORK_COLS = {
    "name", "manufacturer", "description", "box_photo_url",
    "fuse_delay_seconds", "effect_duration_seconds", "shot_count", "grams",
    "price_cents", "source_url", "visibility",
}


def update_firework(firework_id: int, patch: dict[str, Any]) -> bool:
    sets = []
    params: list[Any] = []
    for col in _PATCHABLE_FIREWORK_COLS:
        if col in patch:
            sets.append(f"{col} = %s")
            params.append(patch[col])
    if "metadata" in patch:
        sets.append("metadata = %s::jsonb")
        params.append(json.dumps(patch["metadata"] or {}))
    if not sets:
        return False
    sets.append("updated_at = CURRENT_TIMESTAMP")
    params.append(firework_id)

    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, f"UPDATE fireworks SET {', '.join(sets)} WHERE id = %s", tuple(params))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def attach_video_to_firework(*,
                             firework_id: int,
                             video_id: int,
                             created_by: int,
                             kind: str = "user",
                             is_primary: bool = False,
                             defaults: dict | None = None) -> int:
    defaults = defaults or {}
    conn = get_db()
    cur = conn.cursor()
    try:
        if is_primary:
            execute_sql(cur, """
                UPDATE firework_videos SET is_primary = FALSE WHERE firework_id = %s
            """, (firework_id,))
        execute_sql(cur, """
            INSERT INTO firework_videos (
                firework_id, video_id, kind, is_primary,
                default_trim_start, default_trim_end,
                default_crop_x, default_crop_y, default_crop_width, default_crop_height,
                created_by_user_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (firework_id, video_id) DO UPDATE SET
                kind = EXCLUDED.kind,
                is_primary = EXCLUDED.is_primary,
                default_trim_start = EXCLUDED.default_trim_start,
                default_trim_end = EXCLUDED.default_trim_end,
                default_crop_x = EXCLUDED.default_crop_x,
                default_crop_y = EXCLUDED.default_crop_y,
                default_crop_width = EXCLUDED.default_crop_width,
                default_crop_height = EXCLUDED.default_crop_height
            RETURNING id
        """, (
            firework_id, video_id, kind, is_primary,
            float(defaults.get("default_trim_start") or 0),
            float(defaults.get("default_trim_end") or 0),
            float(defaults.get("default_crop_x") or 0),
            float(defaults.get("default_crop_y") or 0),
            float(defaults.get("default_crop_width") or 100),
            float(defaults.get("default_crop_height") or 100),
            created_by,
        ))
        fv_id = fetch_one(cur)["id"]
        conn.commit()
        return fv_id
    finally:
        conn.close()


def update_firework_video(firework_video_id: int, patch: dict) -> bool:
    """Patch a firework_video row.

    is_primary is special-cased: setting it true demotes any other row on
    the same firework first (the partial unique index would otherwise fail).
    Setting it false is allowed (firework will have no primary until another
    is_primary=true is set; UI should prevent leaving zero primaries).
    """
    cols = {
        "default_trim_start", "default_trim_end",
        "default_crop_x", "default_crop_y", "default_crop_width", "default_crop_height",
        "kind",
    }
    sets, params = [], []
    for c in cols:
        if c in patch:
            sets.append(f"{c} = %s")
            params.append(patch[c])

    set_primary = patch.get("is_primary")  # may be None / True / False

    if not sets and set_primary is None:
        return False

    conn = get_db()
    cur = conn.cursor()
    try:
        if set_primary is True:
            # Find the firework_id this row belongs to so we can demote peers.
            execute_sql(cur,
                "SELECT firework_id FROM firework_videos WHERE id = %s",
                (firework_video_id,)
            )
            row = fetch_one(cur)
            if not row:
                return False
            execute_sql(cur, """
                UPDATE firework_videos SET is_primary = FALSE
                WHERE firework_id = %s AND id <> %s
            """, (row["firework_id"], firework_video_id))
            sets.append("is_primary = TRUE")
        elif set_primary is False:
            sets.append("is_primary = FALSE")

        if sets:
            params.append(firework_video_id)
            execute_sql(cur, f"UPDATE firework_videos SET {', '.join(sets)} WHERE id = %s",
                        tuple(params))

        conn.commit()
        return True
    finally:
        conn.close()


def delete_firework_video(firework_video_id: int) -> bool:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, "DELETE FROM firework_videos WHERE id = %s", (firework_video_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Project inventory (project_fireworks)
# ---------------------------------------------------------------------------

def add_firework_to_project(project_id: int, firework_id: int, *,
                            added_by: int, count: int | None = None,
                            notes: str | None = None) -> None:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            INSERT INTO project_fireworks (project_id, firework_id, count, notes, added_by_user_id)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (project_id, firework_id) DO UPDATE
              SET count = COALESCE(EXCLUDED.count, project_fireworks.count),
                  notes = COALESCE(EXCLUDED.notes, project_fireworks.notes)
        """, (project_id, firework_id, count, notes, added_by))
        conn.commit()
    finally:
        conn.close()


def remove_firework_from_project(project_id: int, firework_id: int) -> bool:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            DELETE FROM project_fireworks WHERE project_id = %s AND firework_id = %s
        """, (project_id, firework_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Shows scoped to a project
# ---------------------------------------------------------------------------

def list_shows_for_project(project_id: int) -> list[dict]:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            SELECT s.id, s.name, s.data, s.timestamp,
                   s.created_by_user_id, u.username AS creator_username
            FROM shows s
            LEFT JOIN users u ON u.id = s.created_by_user_id
            WHERE s.project_id = %s
            ORDER BY s.timestamp DESC
        """, (project_id,))
        rows = fetch_all(cur)
        out = []
        for r in rows:
            d = dict(r)
            if isinstance(d.get("data"), str):
                try:
                    d["data"] = json.loads(d["data"])
                except (TypeError, ValueError):
                    d["data"] = {}
            out.append(d)
        return out
    finally:
        conn.close()


def upsert_show(project_id: int, name: str, data: dict, created_by: int) -> dict:
    conn = get_db()
    cur = conn.cursor()
    try:
        # Existing show in this project + name → update; else insert.
        execute_sql(cur, """
            SELECT id FROM shows WHERE project_id = %s AND name = %s
        """, (project_id, name))
        existing = fetch_one(cur)
        if existing:
            execute_sql(cur, """
                UPDATE shows
                SET data = %s, timestamp = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (json.dumps(data), existing["id"]))
            conn.commit()
            return {"id": existing["id"], "name": name, "created": False}
        else:
            execute_sql(cur, """
                INSERT INTO shows (project_id, name, data, timestamp, created_by_user_id, user_id)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, %s, %s)
                RETURNING id
            """, (project_id, name, json.dumps(data), created_by, created_by))
            new_id = fetch_one(cur)["id"]
            conn.commit()
            return {"id": new_id, "name": name, "created": True}
    finally:
        conn.close()


def delete_show(project_id: int, name: str) -> bool:
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            DELETE FROM shows WHERE project_id = %s AND name = %s
        """, (project_id, name))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()

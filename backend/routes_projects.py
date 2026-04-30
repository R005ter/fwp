"""HTTP routes for the project / firework / show model (post-migration 001).

Mounted under the existing Flask app via `app.register_blueprint(bp)` in
server.py. All routes require an authenticated user (session cookie OR
X-Auth-Token); project-scoped routes additionally require the user be a
member of the project.

Permissions:
    member  → GET allowed for all members
    editor  → mutate allowed for editor and owner
    owner   → member-management allowed for owner only
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request, session

from database import get_user_by_id, get_db, execute_sql, fetch_one
import projects_db as pdb

bp = Blueprint("projects_api", __name__)


# ---------------------------------------------------------------------------
# Auth glue (matches the patterns server.py uses)
# ---------------------------------------------------------------------------

def _current_user_id():
    uid = session.get("user_id")
    if uid:
        return uid
    # Token fallback (desktop / mini-app)
    from database import get_auth_token
    tok = request.args.get("token") or request.headers.get("X-Auth-Token")
    return get_auth_token(tok)


def _require_auth():
    uid = _current_user_id()
    if not uid:
        return None, (jsonify({"error": "Authentication required"}), 401)
    return uid, None


def _require_member(project_id: int, *, min_role: str = "viewer"):
    """Return (user_id, role) on success, or (None, response) on failure."""
    uid, err = _require_auth()
    if err:
        return None, None, err

    role = pdb.get_member_role(project_id, uid)
    if not role:
        return None, None, (jsonify({"error": "Not a member of this project"}), 403)

    rank = {"viewer": 0, "editor": 1, "owner": 2}
    if rank.get(role, -1) < rank.get(min_role, 0):
        return None, None, (jsonify({"error": f"Requires {min_role} role"}), 403)

    return uid, role, None


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

@bp.route("/api/projects", methods=["GET"])
def list_projects():
    uid, err = _require_auth()
    if err:
        return err
    return jsonify(pdb.list_projects_for_user(uid))


@bp.route("/api/projects", methods=["POST"])
def create_project():
    uid, err = _require_auth()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    return jsonify(pdb.create_project(name, uid)), 201


@bp.route("/api/projects/<int:project_id>", methods=["PATCH"])
def patch_project(project_id):
    uid, role, err = _require_member(project_id, min_role="owner")
    if err:
        return err
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    patch = {}
    if name:
        patch["name"] = name
    if not patch:
        return jsonify({"error": "no fields to update"}), 400
    ok = pdb.update_project(project_id, patch)
    return jsonify({"ok": ok})


@bp.route("/api/projects/<int:project_id>", methods=["GET"])
def get_project_detail(project_id):
    uid, role, err = _require_member(project_id)
    if err:
        return err
    project = pdb.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    return jsonify({
        "project": project,
        "role": role,
        "members": pdb.list_project_members(project_id),
    })


@bp.route("/api/projects/<int:project_id>/members", methods=["POST"])
def add_member(project_id):
    uid, role, err = _require_member(project_id, min_role="owner")
    if err:
        return err
    data = request.get_json(silent=True) or {}
    target_email = (data.get("email") or "").strip().lower()
    target_username = (data.get("username") or "").strip()
    new_role = (data.get("role") or "editor").strip()
    if new_role not in ("viewer", "editor", "owner"):
        return jsonify({"error": "invalid role"}), 400
    if not target_email and not target_username:
        return jsonify({"error": "email or username required"}), 400

    conn = get_db()
    cur = conn.cursor()
    try:
        if target_email:
            execute_sql(cur, "SELECT id FROM users WHERE LOWER(email) = %s", (target_email,))
        else:
            execute_sql(cur, "SELECT id FROM users WHERE username = %s", (target_username,))
        row = fetch_one(cur)
        if not row:
            return jsonify({"error": "user not found"}), 404
        target_uid = row["id"]
        execute_sql(cur, """
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (%s, %s, %s)
            ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
        """, (project_id, target_uid, new_role))
        conn.commit()
    finally:
        conn.close()
    return jsonify({"ok": True})


@bp.route("/api/projects/<int:project_id>/members/<int:target_uid>", methods=["DELETE"])
def remove_member(project_id, target_uid):
    uid, role, err = _require_member(project_id, min_role="owner")
    if err:
        return err
    if target_uid == uid:
        return jsonify({"error": "Can't remove yourself"}), 400
    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, "DELETE FROM project_members WHERE project_id = %s AND user_id = %s",
                    (project_id, target_uid))
        conn.commit()
    finally:
        conn.close()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Project fireworks (the inventory / library)
# ---------------------------------------------------------------------------

@bp.route("/api/projects/<int:project_id>/fireworks", methods=["GET"])
def list_project_fireworks(project_id):
    uid, role, err = _require_member(project_id)
    if err:
        return err

    base = request.url_root.rstrip("/")
    fireworks = pdb.list_fireworks_for_project(project_id)
    for fw in fireworks:
        if fw.get("primary_filename"):
            fw["primary_url"] = f"{base}/videos/{fw['primary_filename']}"
        else:
            fw["primary_url"] = None
    return jsonify(fireworks)


@bp.route("/api/projects/<int:project_id>/fireworks", methods=["POST"])
def add_project_firework(project_id):
    uid, role, err = _require_member(project_id, min_role="editor")
    if err:
        return err
    data = request.get_json(silent=True) or {}

    firework_id = data.get("firework_id")
    if firework_id:
        # Adding an existing firework into the project's inventory
        if not pdb.get_firework(int(firework_id)):
            return jsonify({"error": "firework not found"}), 404
        pdb.add_firework_to_project(
            project_id, int(firework_id),
            added_by=uid,
            count=data.get("count"),
            notes=data.get("notes"),
        )
        return jsonify({"firework_id": int(firework_id), "added": True})

    # Otherwise create a new firework + add to inventory
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name or firework_id required"}), 400

    new_id = pdb.create_firework(
        name=name,
        created_by=uid,
        visibility=data.get("visibility", "project"),
        fields=data.get("fields") or {},
        metadata=data.get("metadata") or {},
    )
    pdb.add_firework_to_project(
        project_id, new_id, added_by=uid,
        count=data.get("count"), notes=data.get("notes"),
    )
    return jsonify({"firework_id": new_id, "added": True, "created": True}), 201


@bp.route("/api/projects/<int:project_id>/fireworks/<int:firework_id>", methods=["DELETE"])
def remove_project_firework(project_id, firework_id):
    uid, role, err = _require_member(project_id, min_role="editor")
    if err:
        return err
    ok = pdb.remove_firework_from_project(project_id, firework_id)
    return jsonify({"ok": ok})


# ---------------------------------------------------------------------------
# Fireworks (global pool)
# ---------------------------------------------------------------------------

@bp.route("/api/fireworks/<int:firework_id>", methods=["GET"])
def get_firework_endpoint(firework_id):
    uid, err = _require_auth()
    if err:
        return err
    fw = pdb.get_firework(firework_id)
    if not fw:
        return jsonify({"error": "Not found"}), 404
    fw["videos"] = pdb.list_firework_videos(firework_id)
    base = request.url_root.rstrip("/")
    for v in fw["videos"]:
        v["url"] = f"{base}/videos/{v['filename']}"
    return jsonify(fw)


@bp.route("/api/fireworks/<int:firework_id>", methods=["PATCH"])
def patch_firework(firework_id):
    uid, err = _require_auth()
    if err:
        return err
    # Permission: any editor of *any* project that has this firework, OR the
    # firework's creator. Simplification for now: creator + any project member.
    fw = pdb.get_firework(firework_id)
    if not fw:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    ok = pdb.update_firework(firework_id, data)
    return jsonify({"ok": ok})


@bp.route("/api/firework_videos/<int:fv_id>", methods=["PATCH"])
def patch_firework_video(fv_id):
    uid, err = _require_auth()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    ok = pdb.update_firework_video(fv_id, data)
    return jsonify({"ok": ok})


@bp.route("/api/firework_videos/<int:fv_id>", methods=["DELETE"])
def delete_firework_video_endpoint(fv_id):
    uid, err = _require_auth()
    if err:
        return err
    ok = pdb.delete_firework_video(fv_id)
    return jsonify({"ok": ok})


# ---------------------------------------------------------------------------
# Shows (project-scoped)
# ---------------------------------------------------------------------------

@bp.route("/api/projects/<int:project_id>/shows", methods=["GET"])
def list_shows_endpoint(project_id):
    uid, role, err = _require_member(project_id)
    if err:
        return err
    return jsonify(pdb.list_shows_for_project(project_id))


@bp.route("/api/projects/<int:project_id>/shows", methods=["POST"])
def upsert_show_endpoint(project_id):
    uid, role, err = _require_member(project_id, min_role="editor")
    if err:
        return err
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    show_data = data.get("data") or {}
    if not name:
        return jsonify({"error": "name required"}), 400
    return jsonify(pdb.upsert_show(project_id, name, show_data, uid))


@bp.route("/api/projects/<int:project_id>/shows/<show_name>", methods=["DELETE"])
def delete_show_endpoint(project_id, show_name):
    uid, role, err = _require_member(project_id, min_role="editor")
    if err:
        return err
    ok = pdb.delete_show(project_id, show_name)
    return jsonify({"ok": ok})

"""Migration runner.

Called from server startup after init_db(). Applies any migrations whose
names aren't yet in `migration_log`. Each migration runs in its own
transaction; a failure rolls back and re-raises.
"""

from __future__ import annotations

from importlib import import_module

# Order matters — migrations are applied in this sequence.
MIGRATIONS = [
    "001_projects_and_fireworks",
]


def run_pending_migrations() -> None:
    from database import get_db, execute_sql, fetch_one

    conn = get_db()
    cur = conn.cursor()
    try:
        execute_sql(cur, """
            CREATE TABLE IF NOT EXISTS migration_log (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
    finally:
        conn.close()

    for name in MIGRATIONS:
        conn = get_db()
        cur = conn.cursor()
        try:
            execute_sql(cur, "SELECT 1 FROM migration_log WHERE name = %s", (name,))
            if fetch_one(cur):
                print(f"  · migration {name}: already applied")
                continue

            print(f"→ migration {name}: applying")
            mod = import_module(f"migrations.{name}")
            mod.run(conn)

            execute_sql(cur, "INSERT INTO migration_log (name) VALUES (%s)", (name,))
            conn.commit()
            print(f"✓ migration {name}: done")
        except Exception:
            conn.rollback()
            print(f"✗ migration {name}: failed; rolled back")
            raise
        finally:
            conn.close()

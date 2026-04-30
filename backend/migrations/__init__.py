"""Database migrations.

Each module in this package implements `run(conn)` and is registered in
`run_pending_migrations`. A `migration_log` table records applied names so
re-runs are idempotent.
"""

from .runner import run_pending_migrations  # noqa: F401

"""SQLite online backup API; use during the documented maintenance window."""
import argparse
from pathlib import Path
import sqlite3
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('destination',type=Path);a=p.parse_args()
if not a.source.is_file():p.error('Source database not found')
if a.destination.exists():p.error('Destination already exists; choose a fresh backup name')
a.destination.parent.mkdir(parents=True,exist_ok=True)
with sqlite3.connect(a.source.resolve().as_uri()+'?mode=ro',uri=True) as src, sqlite3.connect(a.destination) as dst:
    src.backup(dst)
    result=dst.execute('PRAGMA integrity_check').fetchall()
    if result != [('ok',)]:raise RuntimeError(str(result))
print('Backup integrity: ok')

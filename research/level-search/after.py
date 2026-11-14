"""Start a predeclared study only after its predecessor completes successfully."""
import json,subprocess,sys,time
from pathlib import Path
report=Path(sys.argv[1]);plan=sys.argv[2]
while not report.exists():
    time.sleep(2)
previous=json.loads(report.read_text())
expected=json.loads(Path(previous['plan']).read_text())
if previous['stopped'] or len(previous['results'])!=len(expected['trials']) or any('error' in row for row in previous['results']):
    raise SystemExit('Preceding study incomplete or failed; successor not launched')
raise SystemExit(subprocess.run(['node','--env-file=.env','research/level-search/run.ts',plan]).returncode)

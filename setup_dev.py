"""Cross-platform developer setup. Does not read or transmit the team's key."""
import os
import shutil
import subprocess
import sys
from pathlib import Path

def main():
    root=Path(__file__).resolve().parent
    if sys.version_info < (3,10):
        raise SystemExit('Use Python 3.12 (at least Python 3.10).')
    env=root/'.venv'
    python=env/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    if not python.exists():
        subprocess.run([sys.executable,'-m','venv',str(env)],check=True)
    subprocess.run([str(python),'-m','pip','install','-r',str(root/'requirements.txt')],check=True,cwd=root)
    if not (root/'.env').exists():
        shutil.copyfile(root/'.env.example',root/'.env')
    print('Environment ready. Put your team key in local .env for simulations only.')
    print(f'Tests: "{python}" -m unittest discover -s tests -v')

if __name__=='__main__': main()

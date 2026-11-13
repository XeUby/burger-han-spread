"""Load local credentials without printing them or overriding environment variables."""
import os
from pathlib import Path

def load_env():
    # Use OS certificate validation on Windows; never disable TLS verification.
    import sys
    if sys.platform == 'win32':
        import truststore
        truststore.inject_into_ssl()
    path = Path(__file__).parent / '.env'
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip())

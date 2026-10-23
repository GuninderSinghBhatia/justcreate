import sys
from pathlib import Path

# Run tests against the in-repo package without installing it.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

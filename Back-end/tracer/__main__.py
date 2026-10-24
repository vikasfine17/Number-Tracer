import json
import sys

from .pipeline import trace

if len(sys.argv) < 2:
    sys.exit('usage: python -m tracer "India\'s literacy rate is 77%"')
print(json.dumps(trace(" ".join(sys.argv[1:])), indent=2))

import importlib.util, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))

def load():
    if 'api_index' in sys.modules: return sys.modules['api_index']
    spec = importlib.util.spec_from_file_location('api_index', ROOT / 'api/index.py')
    mod = importlib.util.module_from_spec(spec); sys.modules['api_index'] = mod; spec.loader.exec_module(mod)
    return mod

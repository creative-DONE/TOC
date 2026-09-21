import uvicorn
import os
import sys
from pathlib import Path

# Add backend directory to sys.path so app can be imported directly
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

if __name__ == "__main__":
    print("================================================================")
    print("  Intelligent TOC-Based Textile Colouring Production Scheduler  ")
    print("================================================================")
    print("  Starting FastAPI Server on http://127.0.0.1:8000 ...")
    print("================================================================")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True, reload_dirs=[str(backend_dir)])

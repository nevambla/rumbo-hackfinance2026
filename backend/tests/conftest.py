import os
import tempfile

# Isolate runtime state and pin the demo date before the app reads settings.
os.environ["RUNTIME_DIR"] = tempfile.mkdtemp(prefix="rumbo-test-")
os.environ["DEMO_TODAY"] = "2026-08-18"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["ELEVENLABS_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    c = TestClient(app)
    c.post("/api/demo/reset")
    yield c
    c.post("/api/demo/reset")

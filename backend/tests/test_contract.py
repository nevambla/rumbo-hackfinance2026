"""The published contract (contract/) must match the running API."""
import json
from pathlib import Path

from app.main import app
from app.models import AnswerRequest, ExpenseRequest, SimulateRequest

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = ROOT / "contract"
BODY_MODELS = {"/api/tools/simulate": SimulateRequest, "/api/tools/expenses": ExpenseRequest,
               "/api/tools/answers": AnswerRequest}


def _tools():
    return json.loads((CONTRACT / "client_tools.json").read_text(encoding="utf-8"))["tools"]


def test_nine_client_tools_wait_for_response():
    tools = _tools()
    assert len(tools) == 9 and len({t["name"] for t in tools}) == 9
    for t in tools:
        assert t["type"] == "client" and t["expects_response"] is True


def test_every_tool_endpoint_exists():
    paths = app.openapi()["paths"]
    for t in _tools():
        ep = t["endpoint"]
        assert ep["method"].lower() in paths.get(ep["path"], {}), t["name"]


def test_tool_params_match_request_models():
    for t in _tools():
        model = BODY_MODELS.get(t["endpoint"]["path"])
        if model is None:
            continue
        assert set(t["parameters"]["properties"]) == set(model.model_fields), t["name"]
        required = {k for k, f in model.model_fields.items() if f.is_required()}
        assert set(t["parameters"]["required"]) == required, t["name"]


def test_openapi_snapshot_is_up_to_date():
    """If this fails, run `make contract` and commit contract/openapi.json."""
    from scripts.export_contract import render

    assert (CONTRACT / "openapi.json").read_text(encoding="utf-8") == render()

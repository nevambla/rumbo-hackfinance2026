# Rumbo API — make install | make dev | make test
PY ?= python3
VENV := .venv
BIN := $(VENV)/bin
PORT ?= 8000
HOST ?= 127.0.0.1

.PHONY: install dev run test contract reset clean

install:
	$(PY) -m venv $(VENV)
	$(BIN)/pip install -q --upgrade pip
	$(BIN)/pip install -q -e ".[dev]"
	@test -f .env || (cp .env.example .env && echo "Creado .env a partir de .env.example (modo mock)")

dev:
	$(BIN)/uvicorn app.main:app --reload --host $(HOST) --port $(PORT)

run:
	$(BIN)/uvicorn app.main:app --host $(HOST) --port $(PORT)

test:
	$(BIN)/python -m pytest -q

contract:
	$(BIN)/python scripts/export_contract.py

reset:
	rm -rf data/runtime

clean: reset
	rm -rf $(VENV) *.egg-info

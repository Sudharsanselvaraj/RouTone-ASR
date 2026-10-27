.PHONY: setup test eval server web build clean

setup:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -e ".[dev]"
	cd apps/web && npm install

test:
	.venv/bin/pytest tests/ -v

eval:
	.venv/bin/python -c "from overlapweave.evaluation.harness import BenchmarkHarness; BenchmarkHarness().run_benchmark(save_results=True)"

server:
	.venv/bin/uvicorn overlapweave.api.app:app --host 127.0.0.1 --port 8000 --reload

web:
	cd apps/web && npm run dev

build:
	cd apps/web && npm run build

clean:
	rm -rf .pytest_cache build dist *.egg-info apps/web/dist
	find . -type d -name __pycache__ -exec rm -rf {} +

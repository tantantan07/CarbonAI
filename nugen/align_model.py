"""
Align + deploy the CarbonAI model on Nugen (follows nugen-cookbook/guides/alignment_with_nugen_api).

    pip install requests
    export NUGEN_API_KEY=...            # platform.nugen.in -> API Keys
    python align_model.py               # full run: upload -> benchmark -> align -> deploy
    python align_model.py --status ALIGNMENT_ID

You can also do all of this in the Nugen platform UI without code: upload
carbonai_domain_alignment.md as the document, upload carbonai_benchmark.json
as the benchmark, pick a base model, align, then deploy.

When done, copy the deployed model id into backend/.env as NUGEN_MODEL_ID.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

BASE_URL = "https://api.nugen.in"
HERE = Path(__file__).parent
API_KEY = os.environ.get("NUGEN_API_KEY")
if not API_KEY:
    sys.exit("Set NUGEN_API_KEY first")
H = {"Authorization": f"Bearer {API_KEY}"}
BASE_MODEL = os.environ.get("NUGEN_BASE_MODEL", "meta-llama/Llama-3.2-3B-Instruct")


def show(r):
    print(r.status_code, r.text[:800])
    r.raise_for_status()
    return r.json()


def wait(url, ok=("READY", "COMPLETED", "SUCCESS", "DEPLOYED"), bad=("FAILED", "ERROR"), every=10):
    while True:
        data = show(requests.get(url, headers=H))
        status = str(data.get("status", "")).upper()
        print("  status:", status)
        if status in ok:
            return data
        if status in bad:
            sys.exit(f"Failed: {data}")
        time.sleep(every)


def run():
    doc = HERE / "carbonai_domain_alignment.md"
    print("1) Uploading domain document")
    with open(doc, "rb") as f:
        up = show(requests.post(f"{BASE_URL}/api/v3/documents/create", headers=H,
                                data={"categories": "text/json", "names": "carbonai_domain_alignment"},
                                files={"files": (doc.name, f)}))
    document_id = up["document_ids"][0]
    wait(f"{BASE_URL}/api/v3/documents/{document_id}/status")

    print("2) Uploading CarbonAI benchmark")
    with open(HERE / "carbonai_benchmark.json", "rb") as f:
        bm = show(requests.post(f"{BASE_URL}/api/v3/benchmarks/upload", headers=H,
                                data={"name": "CarbonAI benchmark", "document_id": [document_id],
                                      "description": "Carbon accounting Q&A for Indian businesses"},
                                files={"file": ("carbonai_benchmark.json", f, "application/json")}))
    benchmark_id = bm["benchmark_id"]
    wait(f"{BASE_URL}/api/v3/benchmarks/{benchmark_id}/status")

    print("3) Creating alignment project on", BASE_MODEL)
    al = show(requests.post(f"{BASE_URL}/api/v3/alignment-projects/create", headers=H, json={
        "alignment_name": "CarbonAI Carbon Intelligence",
        "base_model_id": BASE_MODEL,
        "document_ids": [document_id],
        "benchmark_id": benchmark_id,
        "description": "CarbonAI agents: GHG Protocol accounting, Indian emission factors, climate-tech economics, BRSR/CCTS context",
    }))
    alignment_id = al["alignment_id"]
    print("   alignment_id =", alignment_id)
    wait(f"{BASE_URL}/api/v3/alignment-projects/{alignment_id}/status", every=30)

    deploy_latest()


def deploy_latest():
    print("4) Listing aligned models")
    models = show(requests.get(f"{BASE_URL}/api/v3/models/aligned", headers=H))
    model_id = models["domain_aligned_models"][0]["model_id"]
    print("5) Deploying", model_id)
    show(requests.post(f"{BASE_URL}/api/v3/models/{model_id}/deployment", headers=H))
    print("\nWhen the deployment shows as ready on platform.nugen.in, set in backend/.env:\n"
          f"  NUGEN_MODEL_ID={model_id}\n  LLM_PROVIDER=nugen")


def smoke_test(model_id):
    r = requests.post(f"{BASE_URL}/api/v3/inference/chat/completions", headers={**H, "Content-Type": "application/json"},
                      json={"model": model_id, "stream": False, "max_tokens": 200, "temperature": 0.1,
                            "messages": [{"role": "user", "content": "What emission factor does CarbonAI use for Indian grid electricity?"}]})
    print(json.dumps(show(r), indent=2)[:1500])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", help="poll an alignment id")
    ap.add_argument("--deploy", action="store_true", help="deploy the newest aligned model")
    ap.add_argument("--test", help="send a test prompt to a deployed model id")
    a = ap.parse_args()
    if a.status:
        wait(f"{BASE_URL}/api/v3/alignment-projects/{a.status}/status", every=30)
    elif a.deploy:
        deploy_latest()
    elif a.test:
        smoke_test(a.test)
    else:
        run()

from backend.services import runtime_trace_store


def test_runtime_trace_store_persists_and_returns_latest_record(tmp_path, monkeypatch):
    trace_path = tmp_path / "runtime-traces.jsonl"
    monkeypatch.setattr(runtime_trace_store, "_TRACE_STORE_PATH", trace_path)

    runtime_trace_store.persist_runtime_trace_summary(
        run_id="run-1",
        selected_skills=["old"],
        candidates=[],
        context_trace=[],
        provider="openai",
        mode="general",
    )
    runtime_trace_store.persist_runtime_trace_summary(
        run_id="run-1",
        selected_skills=["odoo_inspect_report"],
        candidates=[{"name": "odoo_inspect_report", "reason": "x" * 800}],
        context_trace=[{"type": "reference_auto_loaded"}],
        output_template={"skill": "output_report_writer"},
        provider="openai",
        mode="general",
    )

    record = runtime_trace_store.get_runtime_trace_summary("run-1")

    assert record is not None
    assert record["selected_skills"] == ["odoo_inspect_report"]
    assert record["output_template"] == {"skill": "output_report_writer"}
    assert record["candidates"][0]["reason"].endswith("…")
from click.testing import CliRunner
from odoo_consultant_portal.cli.main import cli


def test_cli_help():
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "odoo-portal" in result.output.lower() or "odoo consultant" in result.output.lower()


def test_source_sync_help():
    runner = CliRunner()
    result = runner.invoke(cli, ["source", "sync", "--help"])
    assert result.exit_code == 0
    assert "--version" in result.output
    assert "--path" in result.output


def test_init_command(tmp_path, monkeypatch):
    monkeypatch.setenv("ODOO_PORTAL_DATA_DIR", str(tmp_path))
    runner = CliRunner()
    result = runner.invoke(cli, ["init"])
    assert result.exit_code == 0
    assert "initialized" in result.output.lower()

from unittest.mock import patch, MagicMock
from odoo_consultant_portal.services.source_manager import detect_ssh_keys, test_github_ssh, SUPPORTED_VERSIONS


def test_supported_versions():
    assert "17.0" in SUPPORTED_VERSIONS
    assert "15.0" in SUPPORTED_VERSIONS
    assert len(SUPPORTED_VERSIONS) == 5


def test_detect_ssh_keys_no_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("pathlib.Path.home", lambda: tmp_path)
    keys = detect_ssh_keys()
    assert isinstance(keys, list)


def test_github_ssh_failure():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=1, stderr="Permission denied")
        result = test_github_ssh()
        assert result is False


def test_github_ssh_success():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stderr="successfully authenticated")
        result = test_github_ssh()
        assert result is True

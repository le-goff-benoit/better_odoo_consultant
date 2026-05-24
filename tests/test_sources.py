from unittest.mock import patch, MagicMock
from backend.services.source_manager import detect_ssh_keys, test_github_ssh, SUPPORTED_VERSIONS


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
        mock_run.return_value = MagicMock(stdout="", stderr="Permission denied (publickey).")
        result = test_github_ssh()
        assert result is False


def test_github_ssh_success_exit1():
    # GitHub répond avec exit code 1 et stderr — c'est le comportement réel
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            stdout="",
            stderr="Hi le-goff-benoit! You've successfully authenticated, but GitHub does not provide shell access.",
        )
        result = test_github_ssh()
        assert result is True


def test_github_ssh_success_stdout():
    # Certaines configs SSH renvoient sur stdout
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            stdout="Hi user! You've successfully authenticated.",
            stderr="",
        )
        result = test_github_ssh()
        assert result is True

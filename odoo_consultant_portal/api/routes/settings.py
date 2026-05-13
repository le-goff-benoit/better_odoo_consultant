from fastapi import APIRouter, Body
import json
import subprocess
import sys
from pathlib import Path

router = APIRouter()

SETTINGS_DIR = Path.home() / '.odoo-consultant'
USER_PROFILE_FILE = SETTINGS_DIR / 'user-profile.json'


@router.get('/user-profile')
def get_user_profile():
    if USER_PROFILE_FILE.exists():
        return json.loads(USER_PROFILE_FILE.read_text())
    return {}


@router.post('/user-profile')
def save_user_profile(data: dict = Body(...)):
    SETTINGS_DIR.mkdir(exist_ok=True)
    USER_PROFILE_FILE.write_text(json.dumps(data, ensure_ascii=False))
    return data


@router.get('/data-dir')
def get_data_dir():
    return {"path": str(SETTINGS_DIR)}


@router.post('/open-folder')
def open_data_folder():
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    subprocess.Popen([opener, str(SETTINGS_DIR)])
    return {"opened": str(SETTINGS_DIR)}

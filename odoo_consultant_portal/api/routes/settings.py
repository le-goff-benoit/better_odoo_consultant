from fastapi import APIRouter, Body
import json
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

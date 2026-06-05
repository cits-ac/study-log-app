import os
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or SUPABASE_SERVICE_KEY


def _check_env():
    missing = [name for name, val in [
        ("SUPABASE_URL", SUPABASE_URL),
        ("SUPABASE_KEY", SUPABASE_SERVICE_KEY),
    ] if not val]
    if missing:
        raise RuntimeError("環境変数が未設定です: " + ", ".join(missing))


def service_client():
    _check_env()
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def anon_client():
    _check_env()
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def verify_token(auth_header):
    """Returns (user_id, role). Raises ValueError if invalid."""
    if not auth_header or not auth_header.startswith("Bearer "):
        raise ValueError("認証トークンがありません")
    token = auth_header[7:]
    sb = service_client()
    try:
        resp = sb.auth.get_user(token)
    except Exception:
        raise ValueError("トークンが無効か期限切れです。再ログインしてください")
    if not resp or not resp.user:
        raise ValueError("トークンが無効です。再ログインしてください")
    user_id = resp.user.id
    profile = sb.table("profiles").select("role").eq("id", user_id).execute()
    role = profile.data[0]["role"] if profile.data else "user"
    return user_id, role

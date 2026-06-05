import os
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_KEY"]
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", SUPABASE_SERVICE_KEY)


def service_client():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def anon_client():
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def verify_token(auth_header):
    """Returns (user_id, role). Raises ValueError if invalid."""
    if not auth_header or not auth_header.startswith("Bearer "):
        raise ValueError("No token")
    token = auth_header[7:]
    sb = service_client()
    resp = sb.auth.get_user(token)
    if not resp.user:
        raise ValueError("Invalid token")
    user_id = resp.user.id
    profile = sb.table("profiles").select("role").eq("id", user_id).single().execute()
    role = profile.data.get("role", "user") if profile.data else "user"
    return user_id, role

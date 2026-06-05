from http.server import BaseHTTPRequestHandler
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _utils import service_client, anon_client


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n)) if n else {}

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            body = self._body()
            username = body.get("username", "").strip()
            password = body.get("password", "")
            if not username or not password:
                self._json(400, {"error": "IDとパスワードを入力してください"})
                return
            email = f"{username}@studylog.local"
            sb_anon = anon_client()
            resp = sb_anon.auth.sign_in_with_password({"email": email, "password": password})
            sb = service_client()
            profile = sb.table("profiles").select("*").eq("id", resp.user.id).single().execute()
            self._json(200, {
                "access_token": resp.session.access_token,
                "user": {
                    "id": resp.user.id,
                    "username": profile.data["username"],
                    "role": profile.data["role"],
                },
            })
        except Exception:
            self._json(401, {"error": "IDまたはパスワードが正しくありません"})

    def log_message(self, format, *args):
        pass

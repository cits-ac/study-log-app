from http.server import BaseHTTPRequestHandler
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _utils import service_client

SETUP_KEY = os.environ.get("SETUP_KEY", "")
ADMIN_ID = "admin"
ADMIN_PASS = "p@ssw0rd"


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

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
        if SETUP_KEY:
            body = self._body()
            if body.get("setup_key") != SETUP_KEY:
                self._json(403, {"error": "無効なセットアップキーです"})
                return
        try:
            sb = service_client()
            existing = sb.table("profiles").select("id").eq("username", ADMIN_ID).execute()
            if existing.data:
                self._json(409, {"error": "管理者アカウントはすでに存在します"})
                return
            email = f"{ADMIN_ID}@studylog.local"
            resp = sb.auth.admin.create_user({
                "email": email,
                "password": ADMIN_PASS,
                "email_confirm": True,
            })
            sb.table("profiles").insert({
                "id": resp.user.id,
                "username": ADMIN_ID,
                "role": "admin",
            }).execute()
            self._json(200, {"message": "管理者アカウントを作成しました"})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def log_message(self, format, *args):
        pass

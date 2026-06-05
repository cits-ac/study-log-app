from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _utils import service_client, verify_token


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
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

    def _require_admin(self):
        try:
            user_id, role = verify_token(self.headers.get("Authorization"))
            if role != "admin":
                self._json(403, {"error": "管理者権限が必要です"})
                return None, None
            return user_id, role
        except ValueError as e:
            self._json(401, {"error": str(e)})
            return None, None
        except Exception as e:
            self._json(500, {"error": f"認証エラー: {e}"})
            return None, None

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        user_id, _ = self._require_admin()
        if not user_id:
            return
        try:
            sb = service_client()
            result = sb.table("profiles").select("id, username, role, created_at").order("created_at").execute()
            self._json(200, result.data)
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_POST(self):
        user_id, _ = self._require_admin()
        if not user_id:
            return
        try:
            body = self._body()
            username = body.get("username", "").strip()
            password = body.get("password", "").strip()
            role = body.get("role", "user")
            if not username or not password:
                self._json(400, {"error": "IDとパスワードは必須です"})
                return
            if role not in ("admin", "user"):
                self._json(400, {"error": "ロールは admin または user です"})
                return
            email = f"{username}@studylog.local"
            sb = service_client()
            resp = sb.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,
            })
            sb.table("profiles").insert({
                "id": resp.user.id,
                "username": username,
                "role": role,
            }).execute()
            self._json(201, {"id": resp.user.id, "username": username, "role": role})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_DELETE(self):
        user_id, _ = self._require_admin()
        if not user_id:
            return
        try:
            qs = parse_qs(urlparse(self.path).query)
            target_id = qs.get("id", [None])[0]
            if not target_id:
                self._json(400, {"error": "idが必要です"})
                return
            if target_id == user_id:
                self._json(400, {"error": "自分自身は削除できません"})
                return
            sb = service_client()
            sb.auth.admin.delete_user(target_id)
            self._json(200, {"message": "削除しました"})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def log_message(self, format, *args):
        pass

from http.server import BaseHTTPRequestHandler
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _utils import service_client, anon_client, verify_token


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
            user_id, _ = verify_token(self.headers.get("Authorization"))
        except ValueError as e:
            self._json(401, {"error": str(e)})
            return
        except Exception as e:
            self._json(500, {"error": f"認証エラー: {e}"})
            return
        try:
            body = self._body()
            current = body.get("current_password", "")
            new = body.get("new_password", "")
            if not current or not new:
                self._json(400, {"error": "現在のパスワードと新しいパスワードを入力してください"})
                return
            if len(new) < 6:
                self._json(400, {"error": "新しいパスワードは6文字以上にしてください"})
                return

            sb = service_client()
            # ユーザ名を取得して現在のパスワードを検証
            profile = sb.table("profiles").select("username").eq("id", user_id).execute()
            if not profile.data:
                self._json(404, {"error": "ユーザが見つかりません"})
                return
            email = f"{profile.data[0]['username']}@studylog.local"
            try:
                anon_client().auth.sign_in_with_password({"email": email, "password": current})
            except Exception:
                self._json(403, {"error": "現在のパスワードが正しくありません"})
                return

            sb.auth.admin.update_user_by_id(user_id, {"password": new})
            self._json(200, {"message": "パスワードを変更しました"})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def log_message(self, format, *args):
        pass

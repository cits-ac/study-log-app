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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
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

    def _auth(self):
        try:
            return verify_token(self.headers.get("Authorization"))
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
        user_id, _ = self._auth()
        if not user_id:
            return
        try:
            sb = service_client()
            result = sb.table("books").select("*").eq("user_id", user_id).order("created_at").execute()
            self._json(200, result.data)
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_POST(self):
        user_id, _ = self._auth()
        if not user_id:
            return
        try:
            body = self._body()
            name = body.get("name", "").strip()
            if not name:
                self._json(400, {"error": "書籍名は必須です"})
                return
            sb = service_client()
            result = sb.table("books").insert({"user_id": user_id, "name": name}).execute()
            self._json(201, result.data[0])
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_PUT(self):
        user_id, _ = self._auth()
        if not user_id:
            return
        try:
            body = self._body()
            sid = body.get("id")
            name = body.get("name", "").strip()
            if not sid or not name:
                self._json(400, {"error": "idと名前は必須です"})
                return
            sb = service_client()
            result = (
                sb.table("books")
                .update({"name": name})
                .eq("id", sid)
                .eq("user_id", user_id)
                .execute()
            )
            if not result.data:
                self._json(404, {"error": "書籍が見つかりません"})
                return
            self._json(200, result.data[0])
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_DELETE(self):
        user_id, _ = self._auth()
        if not user_id:
            return
        try:
            qs = parse_qs(urlparse(self.path).query)
            sid = qs.get("id", [None])[0]
            if not sid:
                self._json(400, {"error": "idが必要です"})
                return
            sb = service_client()
            sb.table("books").delete().eq("id", sid).eq("user_id", user_id).execute()
            self._json(200, {"message": "削除しました"})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def log_message(self, format, *args):
        pass

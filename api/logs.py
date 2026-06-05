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
        user_id, role = self._auth()
        if not user_id:
            return
        try:
            sb = service_client()
            q = sb.table("study_logs").select("*").order("created_at", desc=True)
            if role != "admin":
                q = q.eq("user_id", user_id)
            result = q.execute()
            self._json(200, result.data)
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_POST(self):
        user_id, _ = self._auth()
        if not user_id:
            return
        try:
            body = self._body()
            sb = service_client()
            result = sb.table("study_logs").insert({
                "date": body["date"],
                "subject": body.get("subject"),
                "content": body["content"],
                "book": body.get("book"),
                "topic": body.get("topic"),
                "page_from": body.get("page_from"),
                "page_to": body.get("page_to"),
                "tags": body.get("tags", []),
                "interval": body.get("interval", 1),
                "ef": body.get("ef", 2.5),
                "next_review": body["next_review"],
                "review_count": body.get("review_count", 0),
                "user_id": user_id,
            }).execute()
            self._json(201, result.data[0])
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_PUT(self):
        user_id, role = self._auth()
        if not user_id:
            return
        try:
            body = self._body()
            fields = {
                "interval": body["interval"],
                "ef": body["ef"],
                "next_review": body["next_review"],
                "review_count": body["review_count"],
            }
            # 編集フォームから送られる項目（存在する場合のみ更新）
            for key in ("date", "subject", "content", "book", "topic", "page_from", "page_to", "tags"):
                if key in body:
                    fields[key] = body[key]
            sb = service_client()
            q = sb.table("study_logs").update(fields).eq("id", body["id"])
            if role != "admin":
                q = q.eq("user_id", user_id)
            result = q.execute()
            self._json(200, result.data[0] if result.data else {})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_DELETE(self):
        user_id, role = self._auth()
        if not user_id:
            return
        try:
            qs = parse_qs(urlparse(self.path).query)
            log_id = qs.get("id", [None])[0]
            if not log_id:
                self._json(400, {"error": "idが必要です"})
                return
            sb = service_client()
            q = sb.table("study_logs").delete().eq("id", log_id)
            if role != "admin":
                q = q.eq("user_id", user_id)
            q.execute()
            self._json(200, {"message": "削除しました"})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def log_message(self, format, *args):
        pass

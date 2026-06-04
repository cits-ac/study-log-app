from http.server import BaseHTTPRequestHandler
import json
import os
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]


class handler(BaseHTTPRequestHandler):
    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n)) if n else {}

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        try:
            sb = create_client(SUPABASE_URL, SUPABASE_KEY)
            result = sb.table("study_logs").select("*").order("created_at", desc=True).execute()
            self._json(200, result.data)
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_POST(self):
        try:
            body = self._body()
            sb = create_client(SUPABASE_URL, SUPABASE_KEY)
            result = sb.table("study_logs").insert({
                "date": body["date"],
                "subject": body["subject"],
                "content": body["content"],
                "tags": body.get("tags", []),
                "interval": body.get("interval", 1),
                "ef": body.get("ef", 2.5),
                "next_review": body["next_review"],
                "review_count": body.get("review_count", 0),
            }).execute()
            self._json(201, result.data[0])
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_PUT(self):
        try:
            body = self._body()
            sb = create_client(SUPABASE_URL, SUPABASE_KEY)
            result = sb.table("study_logs").update({
                "interval": body["interval"],
                "ef": body["ef"],
                "next_review": body["next_review"],
                "review_count": body["review_count"],
            }).eq("id", body["id"]).execute()
            self._json(200, result.data[0])
        except Exception as e:
            self._json(500, {"error": str(e)})

    def log_message(self, format, *args):
        pass

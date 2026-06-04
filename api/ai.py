from http.server import BaseHTTPRequestHandler
import json
import os
import anthropic

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]


class handler(BaseHTTPRequestHandler):
    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
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

    def do_POST(self):
        try:
            log = self._body().get("log", {})
            client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            message = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                messages=[{
                    "role": "user",
                    "content": (
                        "あなたは学習コーチです。以下の学習記録に対して、"
                        "復習のポイントと覚えておくべき重要事項を2〜3文で日本語でアドバイスしてください。簡潔に。\n\n"
                        f"科目: {log.get('subject')}\n"
                        f"学習内容: {log.get('content')}\n"
                        f"タグ: {', '.join(log.get('tags', []))}"
                    ),
                }],
            )
            text = message.content[0].text if message.content else "フィードバックを取得できませんでした。"
            self._json(200, {"feedback": text})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def log_message(self, format, *args):
        pass

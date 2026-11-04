"""Serves the emulator check's test live updates (android-emulator-check.sh, step 7) on this
computer's 127.0.0.1:<port>: files from <dir>, readable by the app's page (any origin) and
never cached. The emulator reaches it as its own localhost through `adb reverse`.

Run: python3 .github/scripts/live-update-test-server.py <dir> <port>
"""
import http.server
import os
import socketserver
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('test server: ' + (fmt % args) + '\n')
        sys.stderr.flush()


def main():
    os.chdir(sys.argv[1])
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', int(sys.argv[2])), Handler) as httpd:
        httpd.serve_forever()


if __name__ == '__main__':
    main()

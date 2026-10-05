# Read-only live OAuth configuration check; never creates or authenticates a user.
import base64
import http.cookiejar
import hashlib
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

def contains(value, expected):
    if value == expected:
        return True
    if isinstance(value, dict):
        return any(contains(item, expected) for item in value.values())
    if isinstance(value, list):
        return any(contains(item, expected) for item in value)
    return False

opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
for origin in ['https://sellio.apptelier.sg', 'https://selliosg.base44.app']:
    callback = origin + '/Auth?sellio_mobile_oauth=1&attempt=' + secrets.token_hex(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(secrets.token_bytes(32)).digest()).decode().rstrip('=')
    query = urllib.parse.urlencode({
        'provider': 'google', 'redirect_to': callback,
        'code_challenge': challenge, 'code_challenge_method': 's256',
    })
    try:
        response = opener.open('https://gzktuteedbtnaxfdylyu.supabase.co/auth/v1/authorize?' + query, timeout=15)
        headers, status = response.headers, response.status
    except urllib.error.HTTPError as failure:
        headers, status = failure.headers, failure.code
    target = urllib.parse.urlsplit(headers.get('Location', ''))
    state = urllib.parse.parse_qs(target.query).get('state', [''])[0]
    # Supabase uses opaque provider state. Cancel this synthetic authorization
    # instead of signing in, then inspect only the resulting redirect address.
    cancellation = urllib.parse.urlencode({'error': 'access_denied', 'state': state})
    try:
        response = opener.open('https://gzktuteedbtnaxfdylyu.supabase.co/auth/v1/callback?' + cancellation, timeout=15)
        returned = response.headers.get('Location', '')
    except urllib.error.HTTPError as failure:
        returned = failure.headers.get('Location', '')
    final_url = urllib.parse.urlsplit(returned)
    original_url = urllib.parse.urlsplit(callback)
    preserved = (final_url.scheme, final_url.netloc, final_url.path, final_url.query) == (
        original_url.scheme, original_url.netloc, original_url.path, original_url.query)
    result = {
        'origin': origin, 'http_status': status, 'authorization_host': target.hostname,
        'callback_preserved': preserved,
    }
    print(json.dumps(result))
    if status != 302 or target.hostname != 'accounts.google.com' or not preserved:
        raise SystemExit('Supabase callback configuration was not verified; review redirect allowlist before release.')

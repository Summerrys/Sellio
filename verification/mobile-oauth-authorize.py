# Read-only live OAuth configuration check; never creates or authenticates a user.
import base64
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

opener = urllib.request.build_opener(NoRedirect)
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
    try:
        payload = json.loads(base64.urlsafe_b64decode(state.split('.')[1] + '==='))
        preserved = contains(payload, callback)
    except (ValueError, IndexError):
        preserved = None
    result = {
        'origin': origin, 'http_status': status, 'authorization_host': target.hostname,
        'callback_preserved': preserved,
    }
    print(json.dumps(result))
    if status != 302 or target.hostname != 'accounts.google.com' or not preserved:
        raise SystemExit('Supabase callback configuration was not verified; review redirect allowlist before release.')

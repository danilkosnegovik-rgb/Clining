#!/usr/bin/env python3
"""
Локальный сервер для ICT (Технологии промышленной чистоты).
Обеспечивает:
- отдачу статических файлов сайта;
- строгую блокировку HTTP-доступа к .env, .git и служебным файлам;
- защищённую авторизацию по логину и паролю из .env (challenge-response PBKDF2-SHA256 + HMAC-SHA256 + HttpOnly cookie);
- смену логина и пароля с перезаписью .env;
- сохранение WebP-фотографий, data/media.json и data/services.json.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from email.parser import BytesParser
from email.policy import default as email_default_policy
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(ROOT_DIR, '.env')
IMAGES_DIR = os.path.join(ROOT_DIR, 'assets', 'images')
MEDIA_JSON_PATH = os.path.join(ROOT_DIR, 'data', 'media.json')
SERVICES_JSON_PATH = os.path.join(ROOT_DIR, 'data', 'services.json')

BLOCKED_PREFIXES = ('/.env', '/.git', '/server.py', '/AGENTS.md', '/admin/api/env.php', '/admin/api/config.')

# In-memory nonces & sessions (single local instance)
NONCES = {}
SESSIONS = {}


def load_env():
    data = {}
    if not os.path.isfile(ENV_PATH):
        return data
    with open(ENV_PATH, 'r', encoding='utf-8') as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def save_env(updates):
    data = load_env()
    for k, v in updates.items():
        data[k] = str(v).replace('\r', '').replace('\n', '')
    lines = [
        '# ICT Admin Credentials (stored as salted PBKDF2-SHA256 hash)',
        '# Managed automatically via Admin Panel or edited manually'
    ]
    for k, v in data.items():
        lines.append(f'{k}={v}')
    with open(ENV_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


def parse_pbkdf2(encoded):
    parts = encoded.split('$')
    if len(parts) != 4 or parts[0] != 'pbkdf2_sha256':
        return None
    return {
        'iterations': int(parts[1]),
        'salt': parts[2],
        'hash': parts[3].lower()
    }


def make_pbkdf2_hash(password, iterations=120000):
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), iterations)
    return f'pbkdf2_sha256${iterations}${salt}${dk.hex()}'


def ensure_default_env():
    env = load_env()
    if not env.get('ADMIN_LOGIN') or not parse_pbkdf2(env.get('ADMIN_PASSWORD_HASH', '')):
        save_env({
            'ADMIN_LOGIN': env.get('ADMIN_LOGIN') or 'admin',
            'ADMIN_PASSWORD_HASH': make_pbkdf2_hash('ICT-Admin-2026'),
            'ADMIN_SESSION_SECRET': env.get('ADMIN_SESSION_SECRET') or secrets.token_hex(32)
        })


class ICTHandler(SimpleHTTPRequestHandler):
    def send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        if extra_headers:
            for k, v in extra_headers:
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def get_session(self):
        cookie_hdr = self.headers.get('Cookie', '')
        if not cookie_hdr:
            return None
        c = SimpleCookie()
        c.load(cookie_hdr)
        morsel = c.get('ict_session')
        if not morsel:
            return None
        sid = morsel.value
        sess = SESSIONS.get(sid)
        if not sess or sess['exp'] < time.time():
            SESSIONS.pop(sid, None)
            return None
        return sess

    def require_auth(self):
        sess = self.get_session()
        if not sess:
            self.send_json(401, {'ok': False, 'error': 'Требуется авторизация в админ-панели.'})
            return None
        return sess

    def is_blocked_path(self, path):
        norm = path.lower()
        return any(norm.startswith(p.lower()) for p in BLOCKED_PREFIXES)

    def do_GET(self):
        parsed = urlparse(self.path)
        if self.is_blocked_path(parsed.path):
            self.send_json(403, {'ok': False, 'error': 'Access denied'})
            return

        if parsed.path == '/admin/api/auth.php':
            action = parse_qs(parsed.query).get('action', [''])[0]
            if action == 'session':
                sess = self.get_session()
                self.send_json(200, {
                    'ok': True,
                    'authenticated': bool(sess),
                    'login': sess['login'] if sess else ''
                })
                return
            if action == 'challenge':
                env = load_env()
                info = parse_pbkdf2(env.get('ADMIN_PASSWORD_HASH', ''))
                if not info:
                    self.send_json(500, {'ok': False, 'error': 'Файл .env не настроен.'})
                    return
                nonce = secrets.token_hex(24)
                NONCES[nonce] = time.time() + 120
                self.send_json(200, {
                    'ok': True,
                    'nonce': nonce,
                    'salt': info['salt'],
                    'iterations': info['iterations']
                })
                return
            self.send_json(400, {'ok': False, 'error': 'Неизвестное действие'})
            return

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/admin/api/auth.php':
            self.handle_auth_post(parse_qs(parsed.query).get('action', [''])[0])
            return
        if parsed.path == '/admin/api/upload.php':
            self.handle_upload_post()
            return
        if parsed.path == '/admin/api/save-services.php':
            self.handle_save_services_post()
            return
        self.send_json(404, {'ok': False, 'error': 'Not found'})

    def read_json_body(self):
        length = int(self.headers.get('Content-Length', '0') or '0')
        raw = self.rfile.read(length) if length > 0 else b'{}'
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return {}

    def verify_nonce_and_proof(self, nonce, proof, stored_login, stored_hash):
        exp = NONCES.pop(nonce, 0)
        if not exp or exp < time.time():
            return False, 'Сессия запроса устарела. Попробуйте ещё раз.'
        expected = hmac.new(
            stored_hash.encode('utf-8'),
            f'{nonce}:{stored_login}'.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, proof.lower()):
            return False, 'Неверный логин или пароль.'
        return True, ''

    def handle_auth_post(self, action):
        env = load_env()
        stored_login = env.get('ADMIN_LOGIN', '')
        info = parse_pbkdf2(env.get('ADMIN_PASSWORD_HASH', ''))

        if action == 'login':
            body = self.read_json_body()
            login = str(body.get('login', '')).strip()
            nonce = str(body.get('nonce', ''))
            proof = str(body.get('proof', ''))
            if not info or not hmac.compare_digest(stored_login, login):
                NONCES.pop(nonce, None)
                self.send_json(401, {'ok': False, 'error': 'Неверный логин или пароль.'})
                return
            ok, err = self.verify_nonce_and_proof(nonce, proof, stored_login, info['hash'])
            if not ok:
                self.send_json(401, {'ok': False, 'error': err})
                return

            sid = secrets.token_hex(32)
            SESSIONS[sid] = {'login': stored_login, 'exp': time.time() + 12 * 3600}
            cookie = f'ict_session={sid}; Path=/; HttpOnly; SameSite=Strict'
            self.send_json(200, {'ok': True, 'login': stored_login}, [('Set-Cookie', cookie)])
            return

        if action == 'logout':
            cookie_hdr = self.headers.get('Cookie', '')
            if cookie_hdr:
                c = SimpleCookie()
                c.load(cookie_hdr)
                if 'ict_session' in c:
                    SESSIONS.pop(c['ict_session'].value, None)
            self.send_json(200, {'ok': True}, [('Set-Cookie', 'ict_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict')])
            return

        if action == 'change-credentials':
            sess = self.require_auth()
            if not sess:
                return
            body = self.read_json_body()
            nonce = str(body.get('nonce', ''))
            current_proof = str(body.get('currentProof', ''))
            new_login = str(body.get('newLogin', '')).strip()
            new_salt = str(body.get('newSalt', '')).strip()
            new_hash = str(body.get('newHash', '')).strip().lower()
            iterations = max(100000, int(body.get('iterations', 120000)))

            if not info:
                self.send_json(500, {'ok': False, 'error': 'Файл .env не настроен.'})
                return
            ok, err = self.verify_nonce_and_proof(nonce, current_proof, stored_login, info['hash'])
            if not ok:
                self.send_json(401, {'ok': False, 'error': 'Текущий пароль указан неверно.'})
                return
            if len(new_login) < 3 or not re.fullmatch(r'[a-f0-9]{32,64}', new_salt) or not re.fullmatch(r'[a-f0-9]{64}', new_hash):
                self.send_json(400, {'ok': False, 'error': 'Некорректные данные нового логина или хеша пароля.'})
                return

            encoded = f'pbkdf2_sha256${iterations}${new_salt}${new_hash}'
            save_env({
                'ADMIN_LOGIN': new_login,
                'ADMIN_PASSWORD_HASH': encoded,
                'ADMIN_SESSION_SECRET': env.get('ADMIN_SESSION_SECRET') or secrets.token_hex(32)
            })
            sess['login'] = new_login
            self.send_json(200, {'ok': True, 'login': new_login})
            return

        self.send_json(400, {'ok': False, 'error': 'Неизвестное действие'})

    def handle_upload_post(self):
        if not self.require_auth():
            return
        os.makedirs(IMAGES_DIR, exist_ok=True)
        ctype = self.headers.get('Content-Type', '')
        if 'multipart/form-data' not in ctype:
            self.send_json(400, {'ok': False, 'error': 'Ожидается multipart/form-data'})
            return

        length = int(self.headers.get('Content-Length', '0') or '0')
        body = self.rfile.read(length)
        header_bytes = f'Content-Type: {ctype}\r\nMIME-Version: 1.0\r\n\r\n'.encode('utf-8')
        msg = BytesParser(policy=email_default_policy).parsebytes(header_bytes + body)

        fields = {}
        file_bytes = None
        file_name = None
        for part in msg.iter_parts():
            name = part.get_param('name', header='content-disposition')
            if not name:
                continue
            filename = part.get_filename()
            if filename:
                file_bytes = part.get_payload(decode=True)
                file_name = filename
            else:
                fields[name] = part.get_content()

        saved_path = None
        if file_bytes is not None:
            raw_name = fields.get('filename') or file_name or 'photo'
            base = re.sub(r'[^a-zA-Z0-9_-]', '', os.path.splitext(raw_name)[0]) or f'photo-{int(time.time())}'
            fname = f'{base}.webp'
            dst = os.path.join(IMAGES_DIR, fname)
            with open(dst, 'wb') as out:
                out.write(file_bytes)
            saved_path = f'assets/images/{fname}'

        media_json = fields.get('mediaJson')
        if media_json:
            decoded = json.loads(media_json)
            with open(MEDIA_JSON_PATH, 'w', encoding='utf-8') as f:
                json.dump(decoded, f, ensure_ascii=False, indent=2)
                f.write('\n')

        self.send_json(200, {'ok': True, 'path': saved_path})

    def handle_save_services_post(self):
        if not self.require_auth():
            return
        decoded = self.read_json_body()
        if not isinstance(decoded, dict) or not isinstance(decoded.get('services'), list):
            self.send_json(400, {'ok': False, 'error': 'Некорректная структура services.json'})
            return
        with open(SERVICES_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(decoded, f, ensure_ascii=False, indent=2)
            f.write('\n')
        self.send_json(200, {'ok': True})


if __name__ == '__main__':
    os.chdir(ROOT_DIR)
    ensure_default_env()
    host = os.environ.get('ICT_HOST', '0.0.0.0')
    port = int(os.environ.get('ICT_PORT', '8080'))
    server = ThreadingHTTPServer((host, port), ICTHandler)
    print(f'ICT secure server running at http://127.0.0.1:{port} (LAN: http://{host}:{port})')
    server.serve_forever()

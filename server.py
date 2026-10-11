#!/usr/bin/env python3
"""Kids' book sharing site — one community, one server, one SQLite file.

Serves the JSON API and the static frontend using only the Python
standard library. Config via env vars: COMMUNITY_PASSCODE (books123),
COMMUNITY_NAME (Our Society), PORT (8000).
"""

import json
import os
import re
import secrets
import sqlite3
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data.db")
STATIC_DIR = os.path.join(BASE_DIR, "static")

COMMUNITY_PASSCODE = os.environ.get("COMMUNITY_PASSCODE", "books123")
COMMUNITY_NAME = os.environ.get("COMMUNITY_NAME", "Our Society")
PORT = int(os.environ.get("PORT", "8000"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    flat TEXT NOT NULL,
    phone TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions(
    token TEXT PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS books(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    age_range TEXT NOT NULL,
    condition TEXT NOT NULL,
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'available'
        CHECK(status IN ('available','requested','confirmed','collected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS requests(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    requester_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','confirmed','rejected','collected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- one active request per book ('collected' stays out so returned books
-- keep their history and can be requested again):
CREATE UNIQUE INDEX IF NOT EXISTS one_active_request
    ON requests(book_id) WHERE status IN ('pending','confirmed');
"""

STATIC_TYPES = {".html": "text/html", ".js": "application/javascript", ".css": "text/css"}
STATIC_NAME = re.compile(r"^[A-Za-z0-9._-]+$")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def profile_json(row):
    return {"id": row["id"], "name": row["name"], "flat": row["flat"], "phone": row["phone"]}


class RequestError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


class Handler(BaseHTTPRequestHandler):
    server_version = "KidsBookShare/1.0"

    # -- helpers ---------------------------------------------------------

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, UnicodeDecodeError):
            raise RequestError(400, "Invalid JSON body")
        if not isinstance(body, dict):
            raise RequestError(400, "Invalid JSON body")
        return body

    def send_json(self, code, obj):
        payload = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def auth_profile(self, conn):
        header = self.headers.get("Authorization") or ""
        match = re.match(r"^Bearer ([0-9a-f]{64})$", header)
        if not match:
            raise RequestError(401, "Not signed in")
        row = conn.execute(
            "SELECT p.id, p.name, p.flat, p.phone FROM sessions s"
            " JOIN profiles p ON p.id = s.profile_id WHERE s.token = ?",
            (match.group(1),),
        ).fetchone()
        if row is None:
            raise RequestError(401, "Not signed in")
        return row

    @staticmethod
    def required(body, *fields):
        values = {}
        for field in fields:
            value = body.get(field)
            if not isinstance(value, str) or not value.strip():
                raise RequestError(400, "Missing or empty field: %s" % field)
            values[field] = value.strip()
        return values

    # -- routing ---------------------------------------------------------

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/config":
            return self.guard(self.api_config)
        if path == "/api/me":
            return self.guard(self.api_me)
        if path == "/api/books":
            return self.guard(self.api_books_list)
        if path == "/api/my-requests":
            return self.guard(self.api_my_requests)
        return self.guard(lambda conn: self.serve_static(path))

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/join":
            return self.guard(self.api_join)
        if path == "/api/logout":
            return self.guard(self.api_logout)
        if path == "/api/books":
            return self.guard(self.api_books_create)
        match = re.match(r"^/api/books/(\d+)/(request|collected|returned)$", path)
        if match:
            book_id, action = int(match.group(1)), match.group(2)
            return self.guard(lambda conn: self.api_book_action(conn, book_id, action))
        match = re.match(r"^/api/requests/(\d+)/(confirm|reject)$", path)
        if match:
            request_id, action = int(match.group(1)), match.group(2)
            return self.guard(lambda conn: self.api_request_action(conn, request_id, action))
        self.send_json(404, {"error": "Not found"})

    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        match = re.match(r"^/api/books/(\d+)$", path)
        if match:
            return self.guard(lambda conn: self.api_book_delete(conn, int(match.group(1))))
        self.send_json(404, {"error": "Not found"})

    def guard(self, fn):
        conn = get_db()
        try:
            fn(conn)
        except RequestError as exc:
            conn.rollback()
            self.send_json(exc.code, {"error": exc.message})
        except (sqlite3.Error, OSError, ValueError):
            conn.rollback()
            self.send_json(500, {"error": "Internal server error"})
        finally:
            conn.close()

    # -- static ----------------------------------------------------------

    def serve_static(self, path):
        if path == "/":
            name = "index.html"
        elif path.startswith("/static/"):
            name = path[len("/static/"):]
            if not STATIC_NAME.match(name):
                return self.send_json(404, {"error": "Not found"})
        else:
            return self.send_json(404, {"error": "Not found"})
        ext = os.path.splitext(name)[1]
        if ext not in STATIC_TYPES:
            return self.send_json(404, {"error": "Not found"})
        full = os.path.join(STATIC_DIR, name)
        if not os.path.isfile(full):
            return self.send_json(404, {"error": "Not found"})
        with open(full, "rb") as handle:
            payload = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", STATIC_TYPES[ext])
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    # -- auth endpoints --------------------------------------------------

    def api_config(self, conn):
        self.send_json(200, {"community_name": COMMUNITY_NAME})

    def api_join(self, conn):
        body = self.required(self.read_json(), "name", "flat", "phone", "passcode")
        if body["passcode"] != COMMUNITY_PASSCODE:
            raise RequestError(403, "Incorrect community passcode")
        name_key = body["name"].lower() + "|" + body["flat"].lower()
        profile = conn.execute(
            "INSERT INTO profiles(name, flat, phone, name_key) VALUES (?, ?, ?, ?)"
            " ON CONFLICT(name_key) DO UPDATE SET phone=excluded.phone, name=excluded.name"
            " RETURNING id, name, flat, phone",
            (body["name"], body["flat"], body["phone"], name_key),
        ).fetchone()
        token = secrets.token_hex(32)
        conn.execute("INSERT INTO sessions(token, profile_id) VALUES (?, ?)", (token, profile["id"]))
        conn.commit()
        self.send_json(200, {"token": token, "profile": profile_json(profile)})

    def api_me(self, conn):
        profile = self.auth_profile(conn)
        self.send_json(200, {"profile": profile_json(profile)})

    def api_logout(self, conn):
        self.auth_profile(conn)
        token = self.headers.get("Authorization").split(None, 1)[1]
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        self.send_json(200, {"ok": True})

    # -- book endpoints --------------------------------------------------

    def api_books_list(self, conn):
        self.auth_profile(conn)
        rows = conn.execute(
            "SELECT b.id, b.title, b.author, b.age_range, b.condition, b.note,"
            " b.status, b.created_at,"
            " o.id AS owner_id, o.name AS owner_name, o.flat AS owner_flat,"
            " r.id AS request_id, r.status AS request_status,"
            " rp.id AS requester_id, rp.name AS requester_name,"
            " rp.flat AS requester_flat, rp.phone AS requester_phone"
            " FROM books b"
            " JOIN profiles o ON o.id = b.owner_id"
            " LEFT JOIN requests r ON r.id = ("
            "   SELECT r2.id FROM requests r2"
            "   WHERE r2.book_id = b.id AND r2.status IN ('pending','confirmed','collected')"
            "   ORDER BY r2.id DESC LIMIT 1)"
            " LEFT JOIN profiles rp ON rp.id = r.requester_id"
            " ORDER BY b.created_at DESC, b.id DESC"
        ).fetchall()
        expected = {"requested": "pending", "confirmed": "confirmed", "collected": "collected"}
        books = []
        for row in rows:
            active = None
            if row["request_id"] is not None and row["request_status"] == expected.get(row["status"]):
                show_phone = row["status"] in ("confirmed", "collected")
                active = {
                    "id": row["request_id"],
                    "requester": {
                        "id": row["requester_id"],
                        "name": row["requester_name"],
                        "flat": row["requester_flat"],
                        "phone": row["requester_phone"] if show_phone else None,
                    },
                }
            books.append({
                "id": row["id"],
                "title": row["title"],
                "author": row["author"],
                "age_range": row["age_range"],
                "condition": row["condition"],
                "note": row["note"],
                "status": row["status"],
                "owner": {"id": row["owner_id"], "name": row["owner_name"], "flat": row["owner_flat"]},
                "active_request": active,
                "created_at": row["created_at"],
            })
        self.send_json(200, {"books": books})

    def api_books_create(self, conn):
        profile = self.auth_profile(conn)
        raw = self.read_json()
        body = self.required(raw, "title", "author", "age_range", "condition")
        note = raw.get("note")
        note = note.strip() if isinstance(note, str) else ""
        conn.execute("BEGIN IMMEDIATE")
        book = conn.execute(
            "INSERT INTO books(owner_id, title, author, age_range, condition, note)"
            " VALUES (?, ?, ?, ?, ?, ?) RETURNING id, created_at",
            (profile["id"], body["title"], body["author"], body["age_range"], body["condition"], note),
        ).fetchone()
        conn.commit()
        self.send_json(201, {"book": {
            "id": book["id"],
            "title": body["title"],
            "author": body["author"],
            "age_range": body["age_range"],
            "condition": body["condition"],
            "note": note,
            "status": "available",
            "owner": {"id": profile["id"], "name": profile["name"], "flat": profile["flat"]},
            "active_request": None,
            "created_at": book["created_at"],
        }})

    def get_book(self, conn, book_id):
        book = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
        if book is None:
            raise RequestError(404, "Book not found")
        return book

    def api_book_delete(self, conn, book_id):
        profile = self.auth_profile(conn)
        conn.execute("BEGIN IMMEDIATE")
        book = self.get_book(conn, book_id)
        if book["owner_id"] != profile["id"]:
            raise RequestError(403, "Only the owner can delete this book")
        conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
        conn.commit()
        self.send_json(200, {"ok": True})

    def api_book_action(self, conn, book_id, action):
        profile = self.auth_profile(conn)
        conn.execute("BEGIN IMMEDIATE")
        book = self.get_book(conn, book_id)
        if action == "request":
            if book["owner_id"] == profile["id"]:
                raise RequestError(403, "You cannot request your own book")
            updated = conn.execute(
                "UPDATE books SET status='requested' WHERE id=? AND status='available'", (book_id,)
            )
            if updated.rowcount != 1:
                raise RequestError(409, "Book is not available")
            request = conn.execute(
                "INSERT INTO requests(book_id, requester_id, status) VALUES (?, ?, 'pending')"
                " RETURNING id",
                (book_id, profile["id"]),
            ).fetchone()
            conn.commit()
            return self.send_json(201, {"request": {
                "id": request["id"], "book_id": book_id, "status": "pending"}})
        if book["owner_id"] != profile["id"]:
            raise RequestError(403, "Only the owner can do this")
        if action == "collected":
            updated = conn.execute(
                "UPDATE books SET status='collected' WHERE id=? AND status='confirmed'", (book_id,)
            )
            if updated.rowcount != 1:
                raise RequestError(409, "Book is not confirmed")
            updated = conn.execute(
                "UPDATE requests SET status='collected'"
                " WHERE book_id=? AND status='confirmed'", (book_id,)
            )
            if updated.rowcount != 1:
                raise RequestError(409, "Book is not confirmed")
            conn.commit()
            return self.send_json(200, {"ok": True})
        if action == "returned":
            updated = conn.execute(
                "UPDATE books SET status='available' WHERE id=? AND status='collected'", (book_id,)
            )
            if updated.rowcount != 1:
                raise RequestError(409, "Book is not collected")
            conn.commit()
            return self.send_json(200, {"ok": True})

    def api_request_action(self, conn, request_id, action):
        profile = self.auth_profile(conn)
        conn.execute("BEGIN IMMEDIATE")
        request = conn.execute(
            "SELECT r.id, r.book_id, r.status, b.owner_id FROM requests r"
            " JOIN books b ON b.id = r.book_id WHERE r.id = ?",
            (request_id,),
        ).fetchone()
        if request is None:
            raise RequestError(404, "Request not found")
        if request["owner_id"] != profile["id"]:
            raise RequestError(403, "Only the owner can do this")
        updated = conn.execute(
            "UPDATE requests SET status=? WHERE id=? AND status='pending'",
            ("confirmed" if action == "confirm" else "rejected", request_id),
        )
        if updated.rowcount != 1:
            raise RequestError(409, "Request is not pending")
        updated = conn.execute(
            "UPDATE books SET status=? WHERE id=? AND status='requested'",
            ("confirmed" if action == "confirm" else "available", request["book_id"]),
        )
        if updated.rowcount != 1:
            raise RequestError(409, "Request is not pending")
        conn.commit()
        self.send_json(200, {"ok": True})

    def api_my_requests(self, conn):
        profile = self.auth_profile(conn)
        rows = conn.execute(
            "SELECT r.id, r.status, r.created_at,"
            " b.id AS book_id, b.title, b.author, b.age_range, b.condition, b.status AS book_status,"
            " o.name AS owner_name, o.flat AS owner_flat, o.phone AS owner_phone"
            " FROM requests r"
            " JOIN books b ON b.id = r.book_id"
            " JOIN profiles o ON o.id = b.owner_id"
            " WHERE r.requester_id = ?"
            " ORDER BY r.created_at DESC, r.id DESC",
            (profile["id"],),
        ).fetchall()
        requests = []
        for row in rows:
            show_phone = row["status"] in ("confirmed", "collected")
            requests.append({
                "id": row["id"],
                "status": row["status"],
                "book": {
                    "id": row["book_id"],
                    "title": row["title"],
                    "author": row["author"],
                    "age_range": row["age_range"],
                    "condition": row["condition"],
                    "status": row["book_status"],
                },
                "owner": {
                    "name": row["owner_name"],
                    "flat": row["owner_flat"],
                    "phone": row["owner_phone"] if show_phone else None,
                },
            })
        self.send_json(200, {"requests": requests})


def main():
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("Serving %s on http://localhost:%d (passcode: %s)" % (COMMUNITY_NAME, PORT, COMMUNITY_PASSCODE))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

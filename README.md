# kids-book-share
Simple website for parents in our society to share kids books: post available books, request, confirm and collect.

## Run

Requires Python 3.8+ and nothing else — no dependencies, no build step.

```sh
python3 server.py
```

Then open http://localhost:8000 in a browser.

## Configuration

All settings are environment variables; every one has a working default for local development.

| Variable | Default | Purpose |
|---|---|---|
| `COMMUNITY_PASSCODE` | `books123` | Shared passcode parents enter to join the site. Change it for your society. |
| `COMMUNITY_NAME` | `Our Society` | Community name shown in the site header. |
| `PORT` | `8000` | Port the server listens on. |

Example:

```sh
COMMUNITY_NAME="Sunny Residency" COMMUNITY_PASSCODE="sunny42" PORT=9000 python3 server.py
```

## How it works

- One `server.py` (Python standard library only) serves the JSON API and the static page.
- Data persists in a local SQLite file `data.db`, created on first run (gitignored).
- Parents join with their name, flat/unit, phone and the community passcode — no passwords.
- Book lifecycle: **Available → Requested → Confirmed → Collected → Available** (when returned). The requester sees the owner's contact details only after the owner confirms.

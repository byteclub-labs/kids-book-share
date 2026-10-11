# Spec — Community Kids' Book Share

## FEATURE SUMMARY

A very simple website for one residential society/community where parents post kids' books they are willing to lend, and other parents in the same community can browse the list, request a book, get the owner's pickup details after the owner confirms, and go collect it. The site is gated by a shared community passcode so only members of the society can join, uses lightweight profiles (name, flat/unit, phone) instead of real accounts, and tracks each book through a simple lifecycle: Available → Requested → Confirmed → Collected → back to Available when returned. One server, one data store, one community — no external services.

## USER STORIES

1. As a parent in the society, I want to enter the site with the community passcode and my name/flat/phone so that only neighbours can use it and no one needs to manage passwords.
2. As a parent, I want to post a book (title, author, age range, condition, optional note) so that other parents can see it is available to borrow.
3. As a parent, I want to browse a single list of all available books with the owner's flat shown so that I can quickly find something my kid would like.
4. As a parent, I want to filter/search the list by title or author so that I can find a specific book quickly (simple text filter is enough).
5. As a parent, I want to request an available book so that the owner knows I want to collect it.
6. As a book owner, I want to see pending requests on my books and confirm (or reject) them so that I control who borrows my book.
7. As a requesting parent, I want to see the owner's name, flat and phone once my request is confirmed so that I can arrange to go collect the book.
8. As a book owner, I want to mark a confirmed book as collected, and later mark it returned, so that everyone can see whether it is out or available again.
9. As a book owner, I want to remove my listing so that books I no longer offer stop appearing.
10. As a parent, I want to see the status of books I have requested (requested / confirmed / collected / rejected) so that I know where I stand.
11. As a returning visitor, I want the site to remember me on this device so that I don't re-enter my details every time.

## ACCEPTANCE CRITERIA

1. Visiting the site without a saved profile shows a join/profile form requiring: name, flat/unit number, phone number, and the community passcode. Submitting the correct passcode creates the profile and signs the parent in (stored server-side + session/local token). An incorrect passcode is rejected with a visible error and does not sign in.
2. The community passcode is configurable via an environment variable (e.g. `COMMUNITY_PASSCODE`) with a documented default for local development.
3. A signed-in parent sees a single book list as the home view; each book card/row shows: title, author, age range, condition, owner name + flat, and a status badge (Available / Requested / Confirmed / Collected).
4. A "Post a book" form accepts title (required), author (required), age range (required, e.g. 0–3, 4–6, 7–9, 10+ or free text), condition (required), and an optional note. On submit, the book appears in the list as Available.
5. Only signed-in parents can post a book or request a book.
6. Each Available book shows a "Request" button to signed-in parents other than the owner. Clicking it sets the book to Requested and records the requester's profile. The owner never sees a Request button on their own book.
7. A book can have only one active request: once Requested, the Request action is no longer offered to anyone until the request is rejected or the book becomes Available again.
8. The owner sees their own books with pending requests (in a "My books" section) and can Confirm or Reject each request. Confirm sets the book to Confirmed; Reject clears the request and returns the book to Available.
9. After Confirm, the requester sees the owner's name, flat and phone next to the book in their "My requests" view, plus a clear "confirmed — arrange collection" state. Contact details are hidden until the request is confirmed.
10. On a Confirmed book, the owner can mark it Collected (book shows Collected and is no longer requestable). On a Collected book, the owner can mark Returned (book becomes Available again).
11. The owner can delete any of their listings; deleted books disappear from all views.
12. A "My requests" view lists each book the signed-in parent has requested with its current status (Requested / Confirmed / Rejected / Collected).
13. All data (profiles, books, requests, statuses) persists server-side and survives a server restart (SQLite or JSON file — no external database or hosted service required).
14. The whole app runs locally with one command (e.g. `npm start` or `python server.py`) and opens in a browser; layout is usable on a phone-width viewport.
15. A short text filter on the list filters books by title or author substring.

## SCOPE

IN:
- Single community (one society per deployment), gated by a shared community passcode.
- Lightweight profiles: name, flat/unit, phone; session remembered on the device; no passwords, no email verification.
- Post, browse, simple title/author text filter.
- Request → owner Confirm/Reject → Collected → Returned lifecycle with contact reveal on confirm.
- Owner management of own listings (confirm/reject requests, mark collected/returned, delete).
- Minimal backend with file/SQLite persistence, runnable locally with one command.

OUT:
- Multiple communities/societies, community chooser, or admin panel.
- Real authentication (passwords, email, OAuth, SMS OTP).
- Book photos/uploads, payments, fines, due dates or automatic reminders.
- In-app messaging/chat, notifications (email/SMS/push), maps/delivery.
- Ratings, reviews, moderation, reporting.
- Production deployment, user account deletion/GDPR tooling.

## OPEN QUESTIONS

1. What is the society/community display name and the shared passcode to configure at deployment? (Non-blocking: defaults will be used and are configurable via environment variables.)
2. Are books lent-and-returned, or given away permanently? Assumed lent-and-returned per this spec; if give-away, the Collected status is terminal and "Returned" is dropped.

## SPEC IN GIT

BRANCH: `devin/1791733146-factory-kids-book-share`
FILE: `docs/specs/kids-book-share.md`
COMMIT: https://github.com/byteclub-labs/kids-book-share/commit/e3611c9

## STATUS

STATUS: COMPLETE

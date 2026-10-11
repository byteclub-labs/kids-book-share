# Spec: Kids Book Share — community book-sharing website

### FEATURE SUMMARY
A very simple website where parents within one housing society/community can share kids' books: a parent posts books they have available to give away, another parent in the same community requests a book, the owner confirms the request, and the book is collected in person. Single community per deployment, no accounts/passwords — identity is just a name + flat/unit number. Data is shared across all parents via a small server-side store so listings are genuinely collaborative (a purely client-side app would not let parents see each other's posts). Closest existing pattern: the factory's previous single-page app builds, upgraded here with the minimal shared backend used by the Octopus app (Express-style server + JSON file store + static single-page frontend) because cross-user sharing is the core feature.

### USER STORIES
1. As a parent, I want to post a book my kids no longer need (title, age group, condition) so that other parents in my society can see it is available.
2. As a parent, I want to browse all books currently available in my community so that I can find books for my kids.
3. As a parent, I want to search/filter the available books by title and age group so that I can quickly find relevant books.
4. As a parent, I want to request an available book so that the owner knows I want to collect it.
5. As a book owner, I want to see requests on my books and confirm one so that the requester can come collect it.
6. As a parent, I want to see who requested and who owns a reserved book (name + flat/unit) so that the two parties can coordinate pickup within the society.
7. As a book owner, I want to mark a book as collected after handover so that it stops appearing as available.
8. As a parent, I want to cancel my request or remove my listing so that the board stays accurate.
9. As a parent, I want the site to work on my phone so that I can post and request books without a computer.
10. As a parent, I want the site to require no sign-up or password so that using it is effortless.

### ACCEPTANCE CRITERIA
1. The home page lists every book with status `available`, showing book title, age group, condition, poster name, poster flat/unit, and date posted; the list is visible without any login.
2. An "Add a book" form accepts: parent name, flat/unit number, book title, age group (e.g. 0-3, 4-6, 7-9, 10+), condition (Like new / Good / Worn), and optional notes. Submitting it creates the book with status `available` and it appears in the list for all users.
3. Each available book shows a "Request" button; clicking it asks for requester name + flat/unit, then moves the book to status `requested` and records the request.
4. The owner of a `requested` book sees the request (requester name + flat/unit) and can click "Confirm" — the book moves to status `reserved` and is no longer shown as available for new requests.
5. The owner of a `reserved` book can click "Mark collected" — the book moves to status `collected` and is removed from the available list (a simple collected/archive view or count is acceptable but not required).
6. The requester of a `requested` or `reserved` book can cancel their request, returning the book to status `available`.
7. The owner can remove their own listing at any point before it is `collected`.
8. All state lives in a shared server-side store (e.g. a JSON file on the backend): a book posted by one parent is visible to every other parent after a page load/refresh, not just in their own browser.
9. Identity is entered as plain name + flat/unit per action (remembered in the browser for convenience); there is no sign-up, login, or password anywhere.
10. The UI is a single-page, responsive layout that is fully usable on a phone screen; it requires no build tooling knowledge to run (e.g. static page served by the backend).
11. The repo contains a README/run instructions such that the app can be started locally with a single command.

### SCOPE
IN:
- One community per deployment; everyone who opens the site shares the same book board.
- Book lifecycle: post → request → confirm/reserve → collected (plus cancel/remove).
- Name + flat/unit identity, no authentication.
- Server-side persistence (small backend + JSON file or equivalent simple store) so data is shared between parents.
- Search/filter by title text and age group on the available list.
- Mobile-friendly single-page UI.

OUT:
- User accounts, passwords, email verification, or any real authentication.
- Book photos/image uploads.
- Multi-community support (one deployment = one society).
- In-app chat/messaging; parents coordinate in person using the displayed name + flat/unit.
- Notifications (SMS/WhatsApp/email), reminders, or alerts.
- Book lending/return tracking, due dates, or fines — this is permanent sharing/giving away.
- Admin moderation, reporting, ratings.
- Production deployment/hosting (see OPEN QUESTIONS).
- Multiple copies of the same book (each listing is one physical book).

### OPEN QUESTIONS
1. Hosting: where should this run so all parents in the society can reach it? Default assumption: build it to run locally with one command (`node server.js` or similar); deployment is a later step for the user.
2. Contact details: is showing name + flat/unit enough for parents to coordinate pickup, or should an optional phone/WhatsApp field be collected and shown only to the two parties involved? Default assumption: name + flat/unit only, matching "keep it very simple".

### SPEC IN GIT
- `BRANCH: devin/1791733154-factory-book-sharing` (placeholder — filled with the real branch at commit time)
- `FILE: docs/specs/book-sharing.md`
- `COMMIT: <filled after push>`

### STATUS
`STATUS: COMPLETE`

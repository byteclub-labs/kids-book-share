const express = require('express');
const path = require('path');
const fs = require('fs');

// ─── Data directory ───────────────────────────────────────────────────────────
// Local dev: ./data  (relative to this file)
// Override:  set DATA_DIR in the environment
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');

const readData = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
const writeData = (file, data) =>
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));

const BOOKS_FILE = 'books.json';
const AGE_GROUPS = ['0-3', '4-6', '7-9', '10+'];
const CONDITIONS = ['Like new', 'Good', 'Worn'];

// Boot-seed the store so first run never fails on a missing file
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(path.join(DATA_DIR, BOOKS_FILE))) {
  writeData(BOOKS_FILE, []);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Identity is a plain name + flat per action (no auth). Matching is
// case-insensitive and ignores surrounding whitespace.
const samePerson = (nameA, flatA, nameB, flatB) =>
  String(nameA || '').trim().toLowerCase() === String(nameB || '').trim().toLowerCase() &&
  String(flatA || '').trim().toLowerCase() === String(flatB || '').trim().toLowerCase();

const findBook = (req, res) => {
  const books = readData(BOOKS_FILE);
  const book = books.find(b => b.id === parseInt(req.params.id));
  if (!book) res.status(404).json({ error: 'Book not found' });
  return { books, book };
};

const isOwner = (book, name, flat) => samePerson(book.ownerName, book.ownerFlat, name, flat);
const isRequester = (book, name, flat) => samePerson(book.requesterName, book.requesterFlat, name, flat);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── Books ────────────────────────────────────────────────────────────────────

app.get('/api/books', (req, res) => {
  try {
    const books = readData(BOOKS_FILE);
    res.json(books.slice().sort((a, b) => b.id - a.id)); // newest first
  } catch (e) { res.status(500).json({ error: 'Failed to read books' }); }
});

app.get('/api/books/:id', (req, res) => {
  try {
    const { book } = findBook(req, res);
    if (book) res.json(book);
  } catch (e) { res.status(500).json({ error: 'Failed to read book' }); }
});

app.post('/api/books', (req, res) => {
  try {
    const { title, ageGroup, condition, notes, ownerName, ownerFlat } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Book title is required' });
    if (!AGE_GROUPS.includes(ageGroup)) return res.status(400).json({ error: `Age group must be one of: ${AGE_GROUPS.join(', ')}` });
    if (!CONDITIONS.includes(condition)) return res.status(400).json({ error: `Condition must be one of: ${CONDITIONS.join(', ')}` });
    if (!ownerName || !String(ownerName).trim()) return res.status(400).json({ error: 'Your name is required' });
    if (!ownerFlat || !String(ownerFlat).trim()) return res.status(400).json({ error: 'Your flat/unit is required' });

    const books = readData(BOOKS_FILE);
    const newBook = {
      id: books.length > 0 ? Math.max(...books.map(b => b.id)) + 1 : 1,
      title: String(title).trim(),
      ageGroup,
      condition,
      notes: notes ? String(notes).trim() : '',
      ownerName: String(ownerName).trim(),
      ownerFlat: String(ownerFlat).trim(),
      status: 'available',
      requesterName: null,
      requesterFlat: null,
      createdAt: new Date().toISOString(),
      requestedAt: null,
      confirmedAt: null,
      collectedAt: null
    };
    books.push(newBook);
    writeData(BOOKS_FILE, books);
    res.json(newBook);
  } catch (e) {
    console.error('Error adding book:', e);
    res.status(500).json({ error: 'Failed to add book' });
  }
});

app.post('/api/books/:id/request', (req, res) => {
  try {
    const { requesterName, requesterFlat } = req.body || {};
    if (!requesterName || !String(requesterName).trim()) return res.status(400).json({ error: 'Your name is required' });
    if (!requesterFlat || !String(requesterFlat).trim()) return res.status(400).json({ error: 'Your flat/unit is required' });

    const { books, book } = findBook(req, res);
    if (!book) return;
    if (isOwner(book, requesterName, requesterFlat)) {
      return res.status(400).json({ error: 'You cannot request your own book' });
    }
    if (book.status !== 'available') {
      return res.status(409).json({ error: 'Book is no longer available' });
    }
    book.status = 'requested';
    book.requesterName = String(requesterName).trim();
    book.requesterFlat = String(requesterFlat).trim();
    book.requestedAt = new Date().toISOString();
    writeData(BOOKS_FILE, books);
    res.json(book);
  } catch (e) {
    console.error('Error requesting book:', e);
    res.status(500).json({ error: 'Failed to request book' });
  }
});

app.post('/api/books/:id/confirm', (req, res) => {
  try {
    const { ownerName, ownerFlat } = req.body || {};
    const { books, book } = findBook(req, res);
    if (!book) return;
    if (!isOwner(book, ownerName, ownerFlat)) {
      return res.status(403).json({ error: 'Only the owner can confirm this request' });
    }
    if (book.status !== 'requested') {
      return res.status(409).json({ error: 'Book has no pending request to confirm' });
    }
    book.status = 'reserved';
    book.confirmedAt = new Date().toISOString();
    writeData(BOOKS_FILE, books);
    res.json(book);
  } catch (e) {
    console.error('Error confirming book:', e);
    res.status(500).json({ error: 'Failed to confirm book' });
  }
});

app.post('/api/books/:id/collect', (req, res) => {
  try {
    const { ownerName, ownerFlat } = req.body || {};
    const { books, book } = findBook(req, res);
    if (!book) return;
    if (!isOwner(book, ownerName, ownerFlat)) {
      return res.status(403).json({ error: 'Only the owner can mark this book collected' });
    }
    if (book.status !== 'reserved') {
      return res.status(409).json({ error: 'Book is not reserved' });
    }
    book.status = 'collected';
    book.collectedAt = new Date().toISOString();
    writeData(BOOKS_FILE, books);
    res.json(book);
  } catch (e) {
    console.error('Error marking book collected:', e);
    res.status(500).json({ error: 'Failed to mark book collected' });
  }
});

app.post('/api/books/:id/cancel', (req, res) => {
  try {
    const { requesterName, requesterFlat } = req.body || {};
    const { books, book } = findBook(req, res);
    if (!book) return;
    if (book.status !== 'requested' && book.status !== 'reserved') {
      return res.status(409).json({ error: 'Book has no request to cancel' });
    }
    if (!isRequester(book, requesterName, requesterFlat)) {
      return res.status(403).json({ error: 'Only the requester can cancel this request' });
    }
    book.status = 'available';
    book.requesterName = null;
    book.requesterFlat = null;
    book.requestedAt = null;
    book.confirmedAt = null;
    writeData(BOOKS_FILE, books);
    res.json(book);
  } catch (e) {
    console.error('Error cancelling request:', e);
    res.status(500).json({ error: 'Failed to cancel request' });
  }
});

app.delete('/api/books/:id', (req, res) => {
  try {
    const { ownerName, ownerFlat } = req.body || {};
    const { books, book } = findBook(req, res);
    if (!book) return;
    if (!isOwner(book, ownerName, ownerFlat)) {
      return res.status(403).json({ error: 'Only the owner can remove this listing' });
    }
    if (book.status === 'collected') {
      return res.status(409).json({ error: 'Collected books cannot be removed' });
    }
    writeData(BOOKS_FILE, books.filter(b => b.id !== book.id));
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting book:', e);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

app.listen(PORT, () => console.log(`Kids Book Share running on http://localhost:${PORT}`));

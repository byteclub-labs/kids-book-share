// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  books: [],
  activeTab: 'available',
  filters: { title: '', ageGroup: '' },
};

const $ = (id) => document.getElementById(id);
const bookList = $('book-list');
const errorBanner = $('error-banner');
const identityName = $('identity-name');
const identityFlat = $('identity-flat');
const filtersRow = $('filters');

// ─── Identity (remembered typing, not a login) ────────────────────────────────
identityName.value = localStorage.getItem('kbs_name') || '';
identityFlat.value = localStorage.getItem('kbs_flat') || '';

const saveIdentity = () => {
  localStorage.setItem('kbs_name', identityName.value.trim());
  localStorage.setItem('kbs_flat', identityFlat.value.trim());
};
identityName.addEventListener('input', saveIdentity);
identityFlat.addEventListener('input', saveIdentity);

const identity = () => ({ name: identityName.value.trim(), flat: identityFlat.value.trim() });

const samePerson = (nameA, flatA, nameB, flatB) =>
  String(nameA || '').trim().toLowerCase() === String(nameB || '').trim().toLowerCase() &&
  String(flatA || '').trim().toLowerCase() === String(flatB || '').trim().toLowerCase();

const isOwner = (book) => samePerson(book.ownerName, book.ownerFlat, identity().name, identity().flat);
const isRequester = (book) => samePerson(book.requesterName, book.requesterFlat, identity().name, identity().flat);

// ─── API ──────────────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const showError = (msg) => {
  errorBanner.textContent = msg;
  errorBanner.hidden = !msg;
};

async function run(action) {
  try {
    showError('');
    await action();
    await loadBooks();
  } catch (e) {
    showError(e.message);
  }
}

async function loadBooks() {
  state.books = await apiFetch('/api/books');
  render();
}

// ─── Rendering ────────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '');

function visibleBooks() {
  if (state.activeTab === 'available') {
    const q = state.filters.title.toLowerCase();
    return state.books.filter(
      (b) =>
        b.status === 'available' &&
        b.title.toLowerCase().includes(q) &&
        (!state.filters.ageGroup || b.ageGroup === state.filters.ageGroup)
    );
  }
  if (state.activeTab === 'mylistings') {
    return state.books.filter((b) => isOwner(b) && b.status !== 'collected');
  }
  return state.books.filter((b) => isRequester(b) && b.status !== 'collected');
}

function cardActions(book) {
  const buttons = [];
  if (state.activeTab === 'available') {
    if (isOwner(book)) {
      buttons.push(`<button class="btn btn-danger" data-action="remove" data-id="${book.id}">Remove</button>`);
    } else {
      buttons.push(`<button class="btn btn-primary" data-action="request" data-id="${book.id}">Request</button>`);
    }
    return buttons.join('');
  }
  if (state.activeTab === 'mylistings') {
    if (book.status === 'requested') {
      buttons.push(`<button class="btn btn-primary" data-action="confirm" data-id="${book.id}">Confirm</button>`);
    }
    if (book.status === 'reserved') {
      buttons.push(`<button class="btn btn-primary" data-action="collect" data-id="${book.id}">Mark collected</button>`);
    }
    buttons.push(`<button class="btn btn-danger" data-action="remove" data-id="${book.id}">Remove</button>`);
    return buttons.join('');
  }
  // myrequests
  if (book.status === 'requested' || book.status === 'reserved') {
    buttons.push(`<button class="btn btn-secondary" data-action="cancel" data-id="${book.id}">Cancel request</button>`);
  }
  return buttons.join('');
}

function requestForm(book) {
  return `
    <div class="request-form" data-request-form="${book.id}" hidden>
      <input type="text" placeholder="Your name" value="${esc(identity().name)}" data-req-name>
      <input type="text" placeholder="Flat / unit" value="${esc(identity().flat)}" data-req-flat>
      <button class="btn btn-primary" data-action="request-submit" data-id="${book.id}">Send request</button>
    </div>`;
}

function bookCard(book) {
  const statusChip =
    book.status !== 'available'
      ? `<span class="chip status-${book.status}">${esc(book.status)}</span>`
      : '';
  const who =
    state.activeTab === 'mylistings' && book.requesterName
      ? `<div class="requester-info">Requested by ${esc(book.requesterName)} (${esc(book.requesterFlat)})</div>`
      : '';
  const owner =
    state.activeTab === 'myrequests'
      ? `<div class="book-meta">Owner: ${esc(book.ownerName)} (${esc(book.ownerFlat)})</div>`
      : `<div class="book-meta">Posted by ${esc(book.ownerName)} (${esc(book.ownerFlat)})</div>`;

  return `
    <div class="book-card">
      <h3>${esc(book.title)}</h3>
      <div class="chips">
        <span class="chip">${esc(book.ageGroup)}</span>
        <span class="chip">${esc(book.condition)}</span>
        ${statusChip}
      </div>
      ${owner}
      <div class="book-meta">Posted ${formatDate(book.createdAt)}</div>
      ${book.notes ? `<div class="book-notes">${esc(book.notes)}</div>` : ''}
      ${who}
      <div class="card-actions">${cardActions(book)}</div>
      ${requestForm(book)}
    </div>`;
}

const EMPTY_TEXT = {
  available: 'No books yet — be the first to add one.',
  mylistings: 'No listings yet — books you post will show here.',
  myrequests: 'No requests yet — request a book from the Available tab.',
};

function render() {
  filtersRow.style.display = state.activeTab === 'available' ? 'flex' : 'none';
  const books = visibleBooks();
  bookList.innerHTML = books.length
    ? books.map(bookCard).join('')
    : `<div class="empty-state">${EMPTY_TEXT[state.activeTab]}</div>`;
}

// ─── Actions ──────────────────────────────────────────────────────────────────
bookList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const { name, flat } = identity();

  switch (btn.dataset.action) {
    case 'request':
      bookList.querySelector(`[data-request-form="${id}"]`).hidden = false;
      btn.hidden = true;
      break;
    case 'request-submit': {
      const form = bookList.querySelector(`[data-request-form="${id}"]`);
      const reqName = form.querySelector('[data-req-name]').value;
      const reqFlat = form.querySelector('[data-req-flat]').value;
      run(() =>
        apiFetch(`/api/books/${id}/request`, {
          method: 'POST',
          body: JSON.stringify({ requesterName: reqName, requesterFlat: reqFlat }),
        })
      );
      break;
    }
    case 'confirm':
      run(() =>
        apiFetch(`/api/books/${id}/confirm`, {
          method: 'POST',
          body: JSON.stringify({ ownerName: name, ownerFlat: flat }),
        })
      );
      break;
    case 'collect':
      run(() =>
        apiFetch(`/api/books/${id}/collect`, {
          method: 'POST',
          body: JSON.stringify({ ownerName: name, ownerFlat: flat }),
        })
      );
      break;
    case 'cancel':
      run(() =>
        apiFetch(`/api/books/${id}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ requesterName: name, requesterFlat: flat }),
        })
      );
      break;
    case 'remove':
      if (confirm('Remove this listing?')) {
        run(() =>
          apiFetch(`/api/books/${id}`, {
            method: 'DELETE',
            body: JSON.stringify({ ownerName: name, ownerFlat: flat }),
          })
        );
      }
      break;
  }
});

// ─── Tabs & filters ───────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeTab = tab.dataset.tab;
    render();
  });
});

$('filter-title').addEventListener('input', (e) => {
  state.filters.title = e.target.value;
  render();
});
$('filter-age').addEventListener('change', (e) => {
  state.filters.ageGroup = e.target.value;
  render();
});

// ─── Add-book form ────────────────────────────────────────────────────────────
$('add-toggle').addEventListener('click', () => {
  const form = $('add-form');
  form.hidden = !form.hidden;
  if (!form.hidden) {
    $('add-owner-name').value = identity().name;
    $('add-owner-flat').value = identity().flat;
    $('add-title').focus();
  }
});

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    await apiFetch('/api/books', {
      method: 'POST',
      body: JSON.stringify({
        title: $('add-title').value,
        ageGroup: $('add-age-group').value,
        condition: $('add-condition').value,
        notes: $('add-notes').value,
        ownerName: $('add-owner-name').value,
        ownerFlat: $('add-owner-flat').value,
      }),
    });
    e.target.reset();
    $('add-form').hidden = true;
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
loadBooks().catch((e) => showError(e.message));

"use strict";

var state = {
  token: localStorage.getItem("token"),
  profile: JSON.parse(localStorage.getItem("profile") || "null"),
  books: [],
  tab: "all",
};

function $(id) { return document.getElementById(id); }

function el(tag, cls, text) {
  var node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path, opts) {
  opts = opts || {};
  var headers = { "Content-Type": "application/json" };
  if (state.token) headers["Authorization"] = "Bearer " + state.token;
  var res = await fetch(path, {
    method: opts.method || "GET",
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  var data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (res.status === 401 && path !== "/api/join") {
    signOutLocal();
    throw new Error((data && data.error) || "Not signed in");
  }
  if (!res.ok) throw new Error((data && data.error) || ("Error " + res.status));
  return data;
}

function showView(name) {
  $("join-view").hidden = name !== "join";
  $("app-view").hidden = name !== "app";
}

function signOutLocal() {
  state.token = null;
  state.profile = null;
  localStorage.removeItem("token");
  localStorage.removeItem("profile");
  showView("join");
}

async function loadConfig() {
  try {
    var data = await api("/api/config");
    $("community-name").textContent = data.community_name;
    $("join-community").textContent = data.community_name;
  } catch (e) { /* keep default title */ }
}

// ---------- join ----------

$("join-form").addEventListener("submit", async function (ev) {
  ev.preventDefault();
  $("join-error").hidden = true;
  try {
    var data = await api("/api/join", {
      method: "POST",
      body: {
        name: $("join-name").value,
        flat: $("join-flat").value,
        phone: $("join-phone").value,
        passcode: $("join-passcode").value,
      },
    });
    state.token = data.token;
    state.profile = data.profile;
    localStorage.setItem("token", data.token);
    localStorage.setItem("profile", JSON.stringify(data.profile));
    enterApp();
  } catch (e) {
    $("join-error").textContent = e.message;
    $("join-error").hidden = false;
  }
});

// ---------- rendering ----------

function badge(status) {
  return el("span", "badge " + status, status);
}

function bookCard(book) {
  var card = el("div", "card");
  var head = el("h2");
  head.appendChild(document.createTextNode(book.title + " "));
  head.appendChild(badge(book.status));
  card.appendChild(head);
  card.appendChild(el("p", "meta", "by " + book.author + " · ages " + book.age_range + " · " + book.condition));
  card.appendChild(el("p", "meta", "Owner: " + book.owner.name + " · flat " + book.owner.flat));
  if (book.note) card.appendChild(el("p", "note", book.note));

  var active = book.active_request;
  var mine = state.profile && book.owner.id === state.profile.id;

  if (mine && active) {
    card.appendChild(el("p", "meta",
      "Requested by: " + active.requester.name + " · flat " + active.requester.flat +
      (active.requester.phone ? " · " + active.requester.phone : "")));
  }

  var actions = el("div", "actions");
  if (book.status === "available" && !mine) {
    actions.appendChild(actionButton("Request", async function () {
      await api("/api/books/" + book.id + "/request", { method: "POST" });
      await refresh();
    }));
  }
  if (mine) {
    if (active && book.status === "requested") {
      actions.appendChild(actionButton("Confirm", async function () {
        await api("/api/requests/" + active.id + "/confirm", { method: "POST" });
        await refresh();
      }));
      actions.appendChild(actionButton("Reject", async function () {
        await api("/api/requests/" + active.id + "/reject", { method: "POST" });
        await refresh();
      }, "secondary"));
    }
    if (book.status === "confirmed") {
      actions.appendChild(actionButton("Mark collected", async function () {
        await api("/api/books/" + book.id + "/collected", { method: "POST" });
        await refresh();
      }));
    }
    if (book.status === "collected") {
      actions.appendChild(actionButton("Mark returned", async function () {
        await api("/api/books/" + book.id + "/returned", { method: "POST" });
        await refresh();
      }));
    }
    actions.appendChild(actionButton("Delete", async function () {
      if (!confirm("Remove this book listing?")) return;
      await api("/api/books/" + book.id, { method: "DELETE" });
      await refresh();
    }, "danger"));
  }
  card.appendChild(actions);
  return card;
}

function actionButton(label, onClick, cls) {
  var btn = el("button", "small" + (cls ? " " + cls : ""), label);
  btn.type = "button";
  btn.addEventListener("click", async function () {
    btn.disabled = true;
    try { await onClick(); } catch (e) { alert(e.message); }
    btn.disabled = false;
  });
  return btn;
}

function renderBooks() {
  var query = $("filter-input").value.trim().toLowerCase();
  var list = $("book-list");
  list.textContent = "";
  var shown = state.books.filter(function (book) {
    if (!query) return true;
    return book.title.toLowerCase().indexOf(query) >= 0 ||
           book.author.toLowerCase().indexOf(query) >= 0;
  });
  if (!shown.length) {
    list.appendChild(el("p", "empty", state.books.length ? "No books match the filter." : "No books posted yet."));
  }
  shown.forEach(function (book) { list.appendChild(bookCard(book)); });

  var mine = $("my-book-list");
  mine.textContent = "";
  var myBooks = state.books.filter(function (book) {
    return state.profile && book.owner.id === state.profile.id;
  });
  if (!myBooks.length) mine.appendChild(el("p", "empty", "You have not posted any books."));
  myBooks.forEach(function (book) { mine.appendChild(bookCard(book)); });
}

function renderMyRequests(requests) {
  var list = $("my-request-list");
  list.textContent = "";
  if (!requests.length) {
    list.appendChild(el("p", "empty", "You have not requested any books."));
    return;
  }
  requests.forEach(function (req) {
    var card = el("div", "card");
    var head = el("h2");
    head.appendChild(document.createTextNode(req.book.title + " "));
    head.appendChild(badge(req.status));
    card.appendChild(head);
    card.appendChild(el("p", "meta", "by " + req.book.author + " · ages " + req.book.age_range + " · " + req.book.condition));
    card.appendChild(el("p", "meta", "Owner: " + req.owner.name + " · flat " + req.owner.flat));
    if (req.status === "pending") {
      card.appendChild(el("p", "meta", "Waiting for the owner to confirm."));
    } else if (req.status === "rejected") {
      card.appendChild(el("p", "meta", "The owner rejected this request."));
    } else if (req.owner.phone) {
      var contact = el("p", "contact",
        (req.status === "confirmed" ? "Confirmed — arrange collection: " : "Collected — return to: ") +
        req.owner.name + ", flat " + req.owner.flat + ", phone " + req.owner.phone);
      card.appendChild(contact);
    }
    list.appendChild(card);
  });
}

// ---------- data ----------

async function refresh() {
  var data = await api("/api/books");
  state.books = data.books;
  renderBooks();
  if (state.tab === "requests") await loadMyRequests();
}

async function loadMyRequests() {
  var data = await api("/api/my-requests");
  renderMyRequests(data.requests);
}

function enterApp() {
  $("me-label").textContent = state.profile.name + " · flat " + state.profile.flat;
  showView("app");
  refresh().catch(function (e) { alert(e.message); });
}

// ---------- wiring ----------

$("filter-input").addEventListener("input", renderBooks);

$("post-form").addEventListener("submit", async function (ev) {
  ev.preventDefault();
  try {
    await api("/api/books", {
      method: "POST",
      body: {
        title: $("post-title").value,
        author: $("post-author").value,
        age_range: $("post-age").value,
        condition: $("post-condition").value,
        note: $("post-note").value,
      },
    });
    ev.target.reset();
    $("post-details").open = false;
    await refresh();
  } catch (e) {
    alert(e.message);
  }
});

document.querySelectorAll(".tab").forEach(function (tab) {
  tab.addEventListener("click", async function () {
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
    tab.classList.add("active");
    state.tab = tab.dataset.tab;
    $("tab-all").hidden = state.tab !== "all";
    $("tab-mine").hidden = state.tab !== "mine";
    $("tab-requests").hidden = state.tab !== "requests";
    if (state.tab === "requests") {
      try { await loadMyRequests(); } catch (e) { alert(e.message); }
    }
  });
});

$("sign-out").addEventListener("click", async function () {
  try { await api("/api/logout", { method: "POST" }); } catch (e) { /* ignore */ }
  signOutLocal();
});

// ---------- boot ----------

(async function () {
  await loadConfig();
  if (!state.token) return showView("join");
  try {
    var data = await api("/api/me");
    state.profile = data.profile;
    localStorage.setItem("profile", JSON.stringify(data.profile));
    enterApp();
  } catch (e) {
    showView("join");
  }
})();

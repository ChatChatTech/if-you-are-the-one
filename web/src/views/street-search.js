function getNodeId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.id || "";
}

export function createStreetSearch(config) {
  const {
    searchContainer,
    searchInput,
    resultsEl,
    getNodes,
    getCircleNodeIds,
    onSelectNode,
    renderSearchAvatar,
    renderSearchBarAvatar,
    esc,
  } = config;

  const filterBtns = searchContainer.querySelectorAll(".filter-option");
  let currentFilter = "everyone";
  let debounceTimer = null;
  let lastRenderKey = "";

  function showResults() {
    resultsEl.classList.add("visible");
    searchContainer.classList.add("results-open");
  }

  function hideResults() {
    resultsEl.classList.remove("visible");
    searchContainer.classList.remove("results-open");
  }

  function renderResults(raw, results) {
    const idsKey = results.map((n) => n.id).join("|");
    const nextKey = `${currentFilter}|${raw}|${idsKey}`;
    if (nextKey === lastRenderKey) return;
    lastRenderKey = nextKey;

    if (results.length === 0) {
      resultsEl.innerHTML = `<div class="search-no-results">No results found for "${esc(raw)}"</div>`;
      return;
    }

    resultsEl.innerHTML = results
      .map(
        (n) => `
          <div class="search-result-item" data-node-id="${n.id}">
            ${n.type === "person" ? renderSearchAvatar(n) : renderSearchBarAvatar(n)}
            <div class="search-result-info">
              <div class="search-result-name">${esc(n.name || "Unknown")}</div>
              <div class="search-result-bio">${esc(n.bio || n.description || "")}</div>
              ${
                n.tags && n.tags.length
                  ? `<div class="search-result-tags">${n.tags
                      .slice(0, 3)
                      .map((t) => `<span class="search-result-tag">${esc(t)}</span>`)
                      .join("")}</div>`
                  : ""
              }
            </div>
          </div>
        `
      )
      .join("");
  }

  function doSearch(raw) {
    const q = (raw || "").trim().toLowerCase();
    if (!q) {
      lastRenderKey = "";
      hideResults();
      return;
    }

    const nodes = getNodes();
    const circleIds = getCircleNodeIds();

    const pool = nodes.filter((n) => {
      if (n.type === "tag") return false;
      if (n.type !== "person" && n.type !== "bar") return false;
      if (currentFilter === "circle" && n.type === "person" && !circleIds.has(n.id)) {
        return false;
      }
      return true;
    });

    const results = pool
      .filter((n) => {
        const name = (n.name || "").toLowerCase();
        const bio = (n.bio || n.description || "").toLowerCase();
        const tags = (n.tags || []).join(" ").toLowerCase();
        return name.includes(q) || bio.includes(q) || tags.includes(q);
      })
      .slice(0, 12);

    renderResults(raw, results);
    showResults();
  }

  const filterHandlers = new Map();

  const onFilterClick = (btn) => () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    if (searchInput.value.trim()) doSearch(searchInput.value);
  };

  const onInput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(searchInput.value), 150);
  };

  const onFocus = () => {
    searchContainer.querySelector(".network-search-bar").classList.add("focused");
    if (searchInput.value.trim()) showResults();
  };

  const onBlur = () => {
    searchContainer.querySelector(".network-search-bar").classList.remove("focused");
    setTimeout(hideResults, 200);
  };

  const onDocClick = (e) => {
    if (!searchContainer.contains(e.target)) hideResults();
  };

  const onResultClick = (e) => {
    const item = e.target.closest(".search-result-item");
    if (!item) return;
    const nodeId = item.dataset.nodeId;
    if (!nodeId) return;
    onSelectNode(nodeId);
    searchInput.value = "";
    hideResults();
    lastRenderKey = "";
  };

  filterBtns.forEach((btn) => {
    const handler = onFilterClick(btn);
    filterHandlers.set(btn, handler);
    btn.addEventListener("click", handler);
  });
  searchInput.addEventListener("input", onInput);
  searchInput.addEventListener("focus", onFocus);
  searchInput.addEventListener("blur", onBlur);
  document.addEventListener("click", onDocClick);
  resultsEl.addEventListener("click", onResultClick);

  return () => {
    filterBtns.forEach((btn) => {
      const handler = filterHandlers.get(btn);
      if (handler) btn.removeEventListener("click", handler);
    });
    searchInput.removeEventListener("input", onInput);
    searchInput.removeEventListener("focus", onFocus);
    searchInput.removeEventListener("blur", onBlur);
    document.removeEventListener("click", onDocClick);
    resultsEl.removeEventListener("click", onResultClick);
    clearTimeout(debounceTimer);
  };
}

export function resolveCircleNodeIds(links, ownerId) {
  const ids = new Set();
  if (!ownerId) return ids;
  ids.add(ownerId);
  links.forEach((l) => {
    const sourceId = getNodeId(l.source);
    const targetId = getNodeId(l.target);
    if (sourceId === ownerId && targetId) ids.add(targetId);
    if (targetId === ownerId && sourceId) ids.add(sourceId);
  });
  return ids;
}

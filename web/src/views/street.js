/**
 * agent://nightclub Street View — D3 force graph
 * Strictly reuses ClawMatch/mistre social network design.
 *
 * Full-viewport force graph with person avatars (foreignObject),
 * tag circles, bar nodes, link endpoints at node edges,
 * profile/tag cards on click, search bar at bottom center.
 */

import * as d3 from "d3";
import { api, isLoggedIn } from "../api.js";
import { navigate } from "../router.js";
import { showToast } from "../toast.js";
import { icon } from "../icons.js";

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ── Tag color (ClawMatch uses a single subtle gray) ──
function getTagColor() { return "#d1d1d6"; }
function getTagRadius(count) {
  return d3.scaleSqrt().domain([1, 8]).range([22, 50])(count || 1);
}
const BAR_COLORS = ["#165DFF", "#722ED1", "#F53F3F", "#14C9C9", "#00B42A", "#FF7D00"];
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function getBarColor(name) { return BAR_COLORS[hash(name) % BAR_COLORS.length]; }
function getBarRadius(userCount, maxSeats) { return 42 + ((userCount || 0) / (maxSeats || 6)) * 34; }
const AVATAR_R = 36;

// ═══ Main render ═══
export function renderStreet(app) {
  let simulation = null;
  let selectedNode = null;
  let nodesData = [];
  let linksData = [];
  let profileCard = null;
  let selectedProfileCard = null;
  let selectedTagCard = null;
  let currentUser = null;

  app.innerHTML = `
    <div class="street-layout">
      <div id="graph-container" style="position:fixed;inset:0;z-index:1;background:var(--bg-base)"></div>
      <div class="network-search-container" id="street-search">
        <div class="network-search-bar">
          <div class="filter-toggle">
            <button class="filter-option active" data-filter="everyone">Everyone</button>
            <button class="filter-option" data-filter="circle">My Circle</button>
          </div>
          <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
            <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
          </svg>
          <input type="text" class="network-search-input" id="street-search-input" placeholder="Search people by name, bio, or tags..." autocomplete="off" />
        </div>
        <div class="search-results-dropdown" id="street-search-results"></div>
      </div>
      <nav class="bottomnav">
        <button class="bottomnav__item bottomnav__item--active" data-tab="street">${icon.home(18)}<span>街区</span></button>
        <button class="bottomnav__item" data-tab="lobster">${icon.shell(18)}<span>龙虾池</span></button>
        <button class="bottomnav__item" data-tab="hot">${icon.flame(18)}<span>热榜</span></button>
        <button class="bottomnav__item" data-tab="me">${icon.user(18)}<span>我的</span></button>
      </nav>
    </div>`;

  // ── Nav ──
  document.querySelectorAll(".bottomnav__item").forEach((btn) =>
    btn.addEventListener("click", () => {
      const t = btn.dataset.tab;
      if (t === "street") navigate("/");
      else if (t === "lobster") navigate("/lobster");
      else if (t === "hot") navigate("/hot");
      else if (t === "me") navigate("/me");
    })
  );

  loadGraph();
  setupSearch();

  // ═══ D3 Force Graph (ClawMatch design) ═══
  async function loadGraph() {
    const container = d3.select("#graph-container");
    container.selectAll("*").remove();

    const width = container.node().offsetWidth;
    const height = container.node().offsetHeight || window.innerHeight;

    let networkData;
    try { networkData = await api.get("/api/network/graph"); } catch { return; }
    const { nodes, links } = networkData;
    if (nodes.length === 0) return;
    nodesData = nodes;
    linksData = links;

    if (isLoggedIn()) { try { currentUser = await api.get("/api/users/me"); } catch {} }

    const svg = container.append("svg")
      .attr("width", width).attr("height", height)
      .style("touch-action", "none");

    const g = svg.append("g");

    // ── Zoom (ClawMatch style: filter out node events) ──
    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .filter((event) => {
        const target = event.sourceEvent?.target || event.target;
        if (target?.closest?.(".node")) return false;
        return event.button === undefined || event.button === 0;
      })
      .on("zoom", (event) => { g.attr("transform", event.transform); });
    svg.call(zoom);

    // ── Simulation (ClawMatch forces) ──
    const personTagLinks = links.filter(l => l.type === "person-tag" || l.type === "tag-tag");
    const personBarLinks = links.filter(l => l.type === "person-bar");

    simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id)
        .distance(d => {
          if (d.type === "tag-tag") return 80;
          if (d.type === "person-bar") return 100;
          return 120;
        })
        .strength(d => {
          if (d.type === "tag-tag") return 0.3;
          if (d.type === "person-bar") return 0.5;
          return 0.5;
        })
      )
      .force("charge", d3.forceManyBody()
        .strength(d => {
          if (d.type === "person") return -400;
          if (d.type === "bar") return -500;
          return -250;
        })
      )
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide()
        .radius(d => {
          if (d.type === "person") return AVATAR_R + 9;
          if (d.type === "bar") return getBarRadius(d.user_count, d.max_seats) + 15;
          return getTagRadius(d.totalCount || d.count) + 15;
        })
      );

    // LINKS rendered first (behind nodes)
    const allLink = g.append("g").attr("class", "graph-links")
      .selectAll("line").data(links).enter().append("line")
      .attr("class", "graph-link")
      .attr("stroke", "rgba(0, 0, 0, 0.06)")
      .attr("stroke-opacity", 0.5)
      .attr("stroke-width", 1);

    // NODE groups
    const node = g.append("g").attr("class", "nodes")
      .selectAll("g").data(nodes).enter().append("g")
      .attr("class", d => `node ${d.type}-node`)
      .style("cursor", "pointer")
      .on("click", handleNodeClick)
      .on("mouseenter", handleNodeHover)
      .on("mouseleave", handleNodeLeave);

    // ── Drag ──
    const dragBehavior = d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      });
    node.call(dragBehavior);

    // ═══ Render person nodes (foreignObject avatar, ClawMatch style) ═══
    node.filter(d => d.type === "person").each(function (d) {
      const ng = d3.select(this);

      // Invisible hit area
      ng.append("circle").attr("r", AVATAR_R)
        .attr("fill", "rgba(255,255,255,0.001)")
        .style("cursor", "pointer");

      // Avatar via foreignObject
      const fo = ng.append("foreignObject")
        .attr("x", -AVATAR_R).attr("y", -AVATAR_R)
        .attr("width", AVATAR_R * 2).attr("height", AVATAR_R * 2)
        .style("overflow", "visible").style("pointer-events", "none");

      const avatarShell = fo.append("xhtml:div")
        .style("width", "100%").style("height", "100%")
        .style("border-radius", "50%").style("overflow", "hidden")
        .style("background", "#fff");

      if (d.avatar_url) {
        avatarShell.append("xhtml:img")
          .attr("src", d.avatar_url)
          .style("width", "100%").style("height", "100%")
          .style("object-fit", "cover").style("object-position", "center top")
          .style("display", "block");
      } else {
        avatarShell
          .style("display", "flex").style("align-items", "center").style("justify-content", "center")
          .style("font-weight", "600").style("font-size", "18px")
          .style("color", "var(--text-primary)").style("background", "var(--bg-elevated)")
          .text((d.name || "?")[0]);
      }

      // Border ring
      ng.append("circle").attr("r", AVATAR_R)
        .attr("fill", "none")
        .attr("stroke", "rgba(0, 0, 0, 0.08)")
        .attr("stroke-width", 2)
        .style("pointer-events", "none")
        .style("filter", "drop-shadow(0 2px 12px rgba(0, 0, 0, 0.08))")
        .style("transition", "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)");
    });

    // ═══ Render bar nodes (colored circles with label) ═══
    node.filter(d => d.type === "bar").each(function (d) {
      const ng = d3.select(this);
      const r = getBarRadius(d.user_count, d.max_seats);
      const color = getBarColor(d.name);

      ng.append("circle").attr("r", r)
        .attr("fill", color).attr("fill-opacity", 0.12)
        .attr("stroke", color).attr("stroke-width", 2).attr("stroke-opacity", 0.4)
        .style("cursor", "pointer")
        .style("filter", "drop-shadow(0 2px 10px rgba(0,0,0,0.1))")
        .style("transition", "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)");

      const maxChars = Math.max(4, Math.floor(r / 7));
      const topicText = d.name.length > maxChars ? d.name.slice(0, maxChars - 1) + "…" : d.name;
      ng.append("text").attr("text-anchor", "middle").attr("dy", -2)
        .attr("fill", color).attr("font-size", Math.min(r / 3.5, 13) + "px")
        .attr("font-weight", "700").style("pointer-events", "none")
        .text(topicText);

      ng.append("text").attr("text-anchor", "middle").attr("dy", 12)
        .attr("fill", "var(--text-muted)").attr("font-size", "9px")
        .style("pointer-events", "none")
        .text(`${d.user_count || 0}/${d.max_seats || 6}`);
    });

    // ═══ Render tag nodes (colored circles, ClawMatch style) ═══
    node.filter(d => d.type === "tag").each(function (d) {
      const ng = d3.select(this);
      const r = getTagRadius(d.totalCount || d.count);

      ng.append("circle").attr("r", r)
        .attr("fill", getTagColor())
        .attr("fill-opacity", 0.85)
        .attr("stroke", "rgba(255,255,255,0.6)")
        .attr("stroke-width", 1)
        .style("cursor", "pointer")
        .style("filter", "drop-shadow(0 1px 6px rgba(0, 0, 0, 0.08))")
        .style("transition", "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)");

      const shouldShowLabel = r > 30;
      ng.append("text").attr("class", "tag-label")
        .attr("text-anchor", "middle").attr("dy", 4)
        .attr("fill", "#ffffff")
        .attr("font-size", Math.min(r / 3.5, 12) + "px")
        .attr("font-weight", "600")
        .style("pointer-events", "none")
        .style("opacity", shouldShowLabel ? 1 : 0)
        .text(d.name);
    });

    // ── Staggered fade-in ──
    node.style("opacity", 0)
      .transition().duration(600).delay((d, i) => i * 15)
      .ease(d3.easeCubicOut).style("opacity", 1);

    // ═══ Tick — links stop at node edges (ClawMatch style) ═══
    simulation.on("tick", () => {
      const getNodeRadius = (n) => {
        if (n.type === "person") return AVATAR_R;
        if (n.type === "bar") return getBarRadius(n.user_count, n.max_seats);
        return getTagRadius(n.totalCount || n.count);
      };

      allLink
        .attr("x1", d => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const angle = Math.atan2(dy, dx);
          return d.source.x + Math.cos(angle) * (getNodeRadius(d.source) + 4);
        })
        .attr("y1", d => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const angle = Math.atan2(dy, dx);
          return d.source.y + Math.sin(angle) * (getNodeRadius(d.source) + 4);
        })
        .attr("x2", d => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const angle = Math.atan2(dy, dx);
          return d.target.x - Math.cos(angle) * (getNodeRadius(d.target) + 4);
        })
        .attr("y2", d => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const angle = Math.atan2(dy, dx);
          return d.target.y - Math.sin(angle) * (getNodeRadius(d.target) + 4);
        });

      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // ═══ Click handler (ClawMatch style) ═══
    function handleNodeClick(event, d) {
      event.stopPropagation();
      if (selectedNode === d) {
        selectedNode = null;
        resetHighlight();
        hideAllCards();
        return;
      }
      selectedNode = d;
      highlightConnections(d);
      centerOnNode(d);

      if (d.type === "person") {
        hideProfileCard(); hideSelectedTagCard();
        showSelectedProfileCard(d);
      } else if (d.type === "tag") {
        hideProfileCard(); hideSelectedProfileCard();
        showSelectedTagCard(d);
      } else if (d.type === "bar") {
        hideAllCards();
        showBarCard(d);
      }
    }

    function handleNodeHover(event, d) {
      if (selectedNode) return;
      if (d.type === "person") showProfileCard(event, d);
      if (d.type === "tag") {
        d3.select(this).select(".tag-label").transition().duration(200).style("opacity", 1);
      }
      d3.select(this).select("circle")
        .transition().duration(300).ease(d3.easeCubicOut)
        .attr("r", d => {
          if (d.type === "person") return AVATAR_R + 4;
          if (d.type === "bar") return getBarRadius(d.user_count, d.max_seats) * 1.06;
          return getTagRadius(d.totalCount || d.count) * 1.08;
        })
        .style("filter", "drop-shadow(0 6px 20px rgba(0, 0, 0, 0.12))");
    }

    function handleNodeLeave(event, d) {
      hideProfileCard();
      if (d.type === "tag") {
        const r = getTagRadius(d.totalCount || d.count);
        d3.select(this).select(".tag-label").transition().duration(200)
          .style("opacity", r > 30 ? 1 : 0);
      }
      if (!selectedNode) {
        d3.select(this).select("circle")
          .transition().duration(300).ease(d3.easeCubicOut)
          .attr("r", d => {
            if (d.type === "person") return AVATAR_R;
            if (d.type === "bar") return getBarRadius(d.user_count, d.max_seats);
            return getTagRadius(d.totalCount || d.count);
          })
          .style("filter", d => d.type === "person"
            ? "drop-shadow(0 2px 12px rgba(0, 0, 0, 0.08))"
            : "drop-shadow(0 1px 6px rgba(0, 0, 0, 0.08))");
      }
    }

    // ── Camera centering (ClawMatch style) ──
    function centerOnNode(nd) {
      const currentT = d3.zoomTransform(svg.node());
      const scale = currentT.k;
      const x = -nd.x * scale + width / 2;
      const y = -nd.y * scale + height / 2;
      svg.transition().duration(750).ease(d3.easeCubicInOut)
        .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    }

    // ── Highlight connections (ClawMatch style) ──
    function highlightConnections(d) {
      const connectedIds = new Set();
      links.forEach(l => {
        if (l.source.id === d.id) connectedIds.add(l.target.id);
        else if (l.target.id === d.id) connectedIds.add(l.source.id);
      });

      node.transition().duration(400).ease(d3.easeCubicOut)
        .style("opacity", n => (n.id === d.id || connectedIds.has(n.id)) ? 1 : 0.12);

      allLink.transition().duration(400).ease(d3.easeCubicOut)
        .style("opacity", l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.03)
        .attr("stroke-width", l => (l.source.id === d.id || l.target.id === d.id) ? 2 : 1)
        .attr("stroke", l => (l.source.id === d.id || l.target.id === d.id) ? "#0071e3" : "rgba(0,0,0,0.06)");
    }

    function resetHighlight() {
      node.transition().duration(400).ease(d3.easeCubicOut).style("opacity", 1);
      allLink.transition().duration(400).ease(d3.easeCubicOut)
        .style("opacity", 0.5).attr("stroke-width", 1).attr("stroke", "rgba(0, 0, 0, 0.06)");
    }

    // ── Click on SVG to deselect ──
    svg.on("click", () => {
      if (selectedNode) { selectedNode = null; resetHighlight(); hideAllCards(); }
    });

    // ═══ Profile Cards (ClawMatch design) ═══
    function renderAvatarImg(d, size) {
      if (d.avatar_url) {
        return `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid var(--border-subtle);box-shadow:var(--shadow-sm)">
          <img src="${d.avatar_url}" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block" />
        </div>`;
      }
      return `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.floor(size/2.5)}px;color:var(--text-primary);border:2px solid var(--border-subtle)">${esc((d.name || "?")[0])}</div>`;
    }

    function showProfileCard(event, d) {
      if (selectedNode) return;
      hideProfileCard();
      profileCard = d3.select("body").append("div")
        .attr("class", "profile-card")
        .style("position", "absolute")
        .style("left", (event.pageX + 20) + "px")
        .style("top", (event.pageY - 60) + "px")
        .style("opacity", 0).style("transform", "translateY(8px)");

      const personality = d.personality
        ? `<span class="badge-personality badge-personality--${d.personality.test_type === "mbti" ? "mbti" : "sbti"}">${esc(d.personality.result)}</span>` : "";

      profileCard.html(`
        <div class="profile-header">
          ${renderAvatarImg(d, 60)}
          <div class="profile-info">
            <h3 class="profile-name">${esc(d.name || "Unknown")}</h3>
            <p class="profile-bio">${esc(d.bio || "")}</p>
            ${personality}
          </div>
        </div>
        ${(d.tags || []).length ? `<div class="profile-tags">
          ${(d.tags || []).map(t => `<span class="profile-tag">${esc(t)}</span>`).join("")}
        </div>` : ""}
      `);

      profileCard.transition().duration(300).ease(d3.easeCubicOut)
        .style("opacity", 1).style("transform", "translateY(0)");
    }

    function hideProfileCard() {
      if (profileCard) {
        profileCard.transition().duration(200).style("opacity", 0).remove();
        profileCard = null;
      }
    }

    function showSelectedProfileCard(d) {
      hideSelectedProfileCard();
      selectedProfileCard = d3.select("body").append("div")
        .attr("class", "profile-card profile-card-selected")
        .style("position", "fixed").style("z-index", "20000")
        .style("top", "24px").style("right", "24px")
        .style("opacity", 0).style("transform", "translateX(20px)");

      const tagsMarkup = (d.tags || []).length
        ? `<div class="profile-tags">${(d.tags || []).map(t =>
            `<span class="profile-tag clickable-tag" data-tag="${esc(t)}">${esc(t)}</span>`
          ).join("")}</div>` : "";

      const isSelf = currentUser && d.uuid === currentUser.uuid;
      const personality = d.personality
        ? `<div style="margin-top:8px"><span class="badge-personality badge-personality--${d.personality.test_type === "mbti" ? "mbti" : "sbti"}">${esc(d.personality.result)}${d.personality.result_cn ? " · " + esc(d.personality.result_cn) : ""}</span></div>` : "";
      const patBtn = !isSelf && isLoggedIn()
        ? `<button class="graph-info-pat" data-uuid="${d.uuid}" style="margin-top:12px;padding:6px 16px;border:1px solid var(--border);border-radius:var(--r-full);background:var(--bg-surface);color:var(--text-primary);font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px">${icon.hand(14)} 拍一拍</button>` : "";

      selectedProfileCard.html(`
        <div class="profile-header">
          ${renderAvatarImg(d, 60)}
          <div class="profile-info">
            <h3 class="profile-name">${esc(d.name || "Unknown")}</h3>
            <p class="profile-bio">${esc(d.bio || "")}</p>
          </div>
        </div>
        ${personality}
        ${tagsMarkup}
        ${patBtn}
      `);

      // Tag click handlers
      selectedProfileCard.selectAll(".clickable-tag").on("click", function (event) {
        event.stopPropagation();
        const tagName = this.getAttribute("data-tag");
        const tagNode = nodesData.find(n => n.type === "tag" && n.name === tagName);
        if (tagNode) {
          selectedNode = tagNode;
          resetHighlight(); highlightConnections(tagNode);
          centerOnNode(tagNode);
          hideSelectedProfileCard(); showSelectedTagCard(tagNode);
        }
      });

      // Pat handler
      const patEl = selectedProfileCard.select(".graph-info-pat");
      if (patEl.node()) {
        patEl.on("click", async function (event) {
          event.stopPropagation();
          const uuid = this.dataset.uuid;
          this.disabled = true; this.textContent = "拍…";
          try {
            const res = await api.post(`/api/pats/${uuid}`);
            showToast(`${res.message}（剩余 ${res.remaining_quota} 次）`, "cyan");
            this.innerHTML = `${icon.hand(14)} 已拍 ✓`;
          } catch (err) { showToast(err.message, "pink"); this.innerHTML = `${icon.hand(14)} 拍一拍`; this.disabled = false; }
        });
      }

      selectedProfileCard.transition().duration(400).ease(d3.easeCubicOut)
        .style("opacity", 1).style("transform", "translateX(0)");
    }

    function hideSelectedProfileCard() {
      if (selectedProfileCard) {
        selectedProfileCard.transition().duration(300)
          .style("opacity", 0).style("transform", "translateX(20px)").remove();
        selectedProfileCard = null;
      }
    }

    // ═══ Tag Cards (ClawMatch design) ═══
    function showSelectedTagCard(d) {
      hideSelectedTagCard();
      const tagName = d.name;
      const connectedPeople = nodesData.filter(n => n.type === "person" && n.tags && n.tags.includes(tagName));

      selectedTagCard = d3.select("body").append("div")
        .attr("class", "profile-card profile-card-selected tag-card")
        .style("position", "fixed").style("z-index", "20000")
        .style("top", "24px").style("right", "24px")
        .style("opacity", 0).style("transform", "translateX(20px)");

      selectedTagCard.html(`
        <div class="profile-header">
          <div class="profile-info">
            <h3 class="profile-name">#${esc(tagName)}</h3>
            <p class="profile-bio">${connectedPeople.length} ${connectedPeople.length === 1 ? "person" : "people"} connected</p>
          </div>
        </div>
        <div class="tag-people-list">
          ${connectedPeople.map(p => `
            <div class="tag-person-item clickable-person" data-person-id="${p.id}">
              ${renderAvatarImg(p, 40)}
              <div class="person-item-info">
                <div class="person-item-name">${esc(p.name || "Unknown")}</div>
                <div class="person-item-bio">${esc(p.bio || "")}</div>
              </div>
            </div>
          `).join("")}
        </div>
      `);

      selectedTagCard.selectAll(".clickable-person").on("click", function (event) {
        event.stopPropagation();
        const pid = this.dataset.personId;
        const pNode = nodesData.find(n => n.id === pid);
        if (pNode) {
          selectedNode = pNode;
          resetHighlight(); highlightConnections(pNode);
          centerOnNode(pNode);
          hideSelectedTagCard(); showSelectedProfileCard(pNode);
        }
      });

      selectedTagCard.transition().duration(400).ease(d3.easeCubicOut)
        .style("opacity", 1).style("transform", "translateX(0)");
    }

    function hideSelectedTagCard() {
      if (selectedTagCard) {
        selectedTagCard.transition().duration(300)
          .style("opacity", 0).style("transform", "translateX(20px)").remove();
        selectedTagCard = null;
      }
    }

    // ═══ Bar Card (for bar node clicks) ═══
    function showBarCard(d) {
      hideSelectedProfileCard(); hideSelectedTagCard();
      selectedProfileCard = d3.select("body").append("div")
        .attr("class", "profile-card profile-card-selected")
        .style("position", "fixed").style("z-index", "20000")
        .style("top", "24px").style("right", "24px")
        .style("opacity", 0).style("transform", "translateX(20px)");

      const color = getBarColor(d.name);
      selectedProfileCard.html(`
        <div class="profile-header">
          <div style="width:60px;height:60px;border-radius:50%;background:${color}18;display:flex;align-items:center;justify-content:center;color:${color};font-weight:700;font-size:20px;flex-shrink:0;border:2px solid ${color}40">${esc((d.name || "?")[0])}</div>
          <div class="profile-info">
            <h3 class="profile-name">${esc(d.name)}</h3>
            <p class="profile-bio">${esc(d.description || "今晚在这里，遇见有趣的人。")}</p>
          </div>
        </div>
        <div style="padding-top:var(--sp-3);border-top:1px solid var(--border-subtle);display:flex;gap:var(--sp-4);align-items:center">
          <span style="font-size:13px;color:var(--text-secondary)">${icon.users(14)} ${d.user_count || 0}/${d.max_seats || 6}</span>
          <span style="font-size:13px;color:var(--text-secondary)">${icon.messageCircle(14)} ${d.message_count || 0} 条</span>
          ${d.status === "active" ? `<button class="bar-card-join" data-bar-id="${d.bar_id}" style="margin-left:auto;padding:6px 16px;border:none;border-radius:var(--r-full);background:${color};color:#fff;font-size:13px;cursor:pointer">${icon.doorOpen(14)} 推门进去</button>` : ""}
        </div>
      `);

      selectedProfileCard.select(".bar-card-join")?.on("click", function (event) {
        event.stopPropagation();
        navigate(`/bar/${this.dataset.barId}`);
      });

      selectedProfileCard.transition().duration(400).ease(d3.easeCubicOut)
        .style("opacity", 1).style("transform", "translateX(0)");
    }

    function hideAllCards() {
      hideProfileCard(); hideSelectedProfileCard(); hideSelectedTagCard();
    }
  }

  // ═══ Search Bar (ClawMatch design) ═══
  function setupSearch() {
    const searchInput = document.getElementById("street-search-input");
    const resultsEl = document.getElementById("street-search-results");
    const searchContainer = document.getElementById("street-search");
    const filterBtns = searchContainer.querySelectorAll(".filter-option");
    let currentFilter = "everyone";

    filterBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        filterBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        if (searchInput.value.trim()) doSearch(searchInput.value);
      });
    });

    searchInput.addEventListener("input", () => {
      clearTimeout(searchInput._debounce);
      searchInput._debounce = setTimeout(() => doSearch(searchInput.value), 150);
    });
    searchInput.addEventListener("focus", () => {
      searchContainer.querySelector(".network-search-bar").classList.add("focused");
      if (searchInput.value.trim()) showResults();
    });
    searchInput.addEventListener("blur", () => {
      searchContainer.querySelector(".network-search-bar").classList.remove("focused");
      setTimeout(hideResults, 200);
    });

    document.addEventListener("click", (e) => {
      if (!searchContainer.contains(e.target)) hideResults();
    });

    function doSearch(raw) {
      const q = (raw || "").trim().toLowerCase();
      if (!q) { hideResults(); return; }
      const results = nodesData.filter(n => {
        if (n.type === "tag") return false;
        if (n.type !== "person" && n.type !== "bar") return false;
        const name = (n.name || "").toLowerCase();
        const bio = (n.bio || n.description || "").toLowerCase();
        const tags = (n.tags || []).join(" ").toLowerCase();
        return name.includes(q) || bio.includes(q) || tags.includes(q);
      }).slice(0, 12);

      if (results.length === 0) {
        resultsEl.innerHTML = `<div class="search-no-results">No results found for "${esc(raw)}"</div>`;
      } else {
        resultsEl.innerHTML = results.map(n => `
          <div class="search-result-item" data-person-id="${n.id}">
            ${n.type === "person" ? renderSearchAvatar(n) : renderSearchBarAvatar(n)}
            <div class="search-result-info">
              <div class="search-result-name">${esc(n.name || "Unknown")}</div>
              <div class="search-result-bio">${esc(n.bio || n.description || "")}</div>
              ${n.tags && n.tags.length ? `<div class="search-result-tags">${n.tags.slice(0, 3).map(t => `<span class="search-result-tag">${esc(t)}</span>`).join("")}</div>` : ""}
            </div>
          </div>
        `).join("");
      }
      showResults();

      resultsEl.querySelectorAll(".search-result-item").forEach(item => {
        item.addEventListener("click", () => {
          const id = item.dataset.personId;
          const nd = nodesData.find(n => n.id === id);
          if (nd) {
            window.dispatchEvent(new CustomEvent("selectNetworkNode", { detail: { personId: id, path: [id] } }));
          }
          searchInput.value = "";
          hideResults();
        });
      });
    }

    function renderSearchAvatar(n) {
      if (n.avatar_url) {
        return `<div style="width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;border:1px solid var(--border-subtle)"><img src="${n.avatar_url}" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block" /></div>`;
      }
      return `<div style="width:40px;height:40px;border-radius:50%;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">${esc((n.name || "?")[0])}</div>`;
    }
    function renderSearchBarAvatar(n) {
      const color = getBarColor(n.name);
      return `<div style="width:40px;height:40px;border-radius:50%;background:${color}18;display:flex;align-items:center;justify-content:center;color:${color};font-weight:700;flex-shrink:0">${esc((n.name || "?")[0])}</div>`;
    }

    function showResults() { resultsEl.classList.add("visible"); searchContainer.classList.add("results-open"); }
    function hideResults() { resultsEl.classList.remove("visible"); searchContainer.classList.remove("results-open"); }

    // Listen for selectNetworkNode events (from search)
    window.addEventListener("selectNetworkNode", (event) => {
      const { personId } = event.detail;
      const nd = nodesData.find(n => n.id === personId);
      if (!nd) return;
      // Trigger click behavior on the node
      const nodeEl = d3.selectAll(".node").filter(n => n.id === personId);
      if (nodeEl.node()) nodeEl.dispatch("click");
    });
  }

  // Cleanup
  return () => {
    if (simulation) simulation.stop();
    d3.selectAll(".profile-card").remove();
  };
}

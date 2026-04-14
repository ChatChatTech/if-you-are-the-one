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
import { createStreetSearch, resolveCircleNodeIds } from "./street-search.js";

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
const MOTION = {
  quick: 140,
  normal: 220,
  focus: 420,
  enter: 360,
};
const NODE_TOKENS = {
  ease: d3.easeCubicOut,
  hoverScale: {
    person: 1.1,
    bar: 1.06,
    tag: 1.08,
  },
  selectedScale: {
    person: 1.14,
    bar: 1.1,
    tag: 1.12,
  },
  shadow: {
    idle: "drop-shadow(0 1px 6px rgba(0, 0, 0, 0.07))",
    hover: "drop-shadow(0 4px 14px rgba(0, 0, 0, 0.14))",
    selected: "drop-shadow(0 6px 18px rgba(0, 0, 0, 0.16))",
  },
};

function getNodeRadius(node) {
  if (node.type === "person") return AVATAR_R;
  if (node.type === "bar") return getBarRadius(node.user_count, node.max_seats);
  return getTagRadius(node.totalCount || node.count);
}

function getScaledRadius(node, scale) {
  return getNodeRadius(node) * scale;
}

function optimizeAvatarUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("dicebear.com")) {
      if (!parsed.searchParams.has("size")) parsed.searchParams.set("size", "128");
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}

// ═══ Main render ═══
export function renderStreet(app) {
  document.body.classList.add("street-newsprint-active");

  let simulation = null;
  let selectedNode = null;
  let nodesData = [];
  let linksData = [];
  let profileCard = null;
  let selectedProfileCard = null;
  let selectedTagCard = null;
  let currentUser = null;
  let searchCleanup = null;

  app.innerHTML = `
    <div class="street-layout newsprint-page street-newsprint">
      <div class="street-layer street-layer--graph">
        <div id="graph-container" style="position:fixed;inset:0;z-index:1;background:var(--np-bg)"></div>
      </div>
      <div class="street-layer street-layer--info" id="street-info-layer"></div>
      <div class="street-layer street-layer--controls">
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
      </div>
    </div>`;

  const infoLayer = d3.select("#street-info-layer");

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
    if (searchCleanup) searchCleanup();
    searchCleanup = setupSearch();

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
      )
      .alphaDecay(0.04)
      .velocityDecay(0.45);

    let tickCounter = 0;

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

    // ═══ Render person nodes (optimized SVG avatar render path) ═══
    node.filter(d => d.type === "person").each(function (d) {
      const ng = d3.select(this);
      const clipId = `avatar-clip-${String(d.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

      // Invisible hit area
      ng.append("circle").attr("r", AVATAR_R)
        .attr("fill", "rgba(255,255,255,0.001)")
        .style("cursor", "pointer");

      if (d.avatar_url) {
        ng.append("clipPath")
          .attr("id", clipId)
          .append("circle")
          .attr("r", AVATAR_R)
          .attr("cx", 0)
          .attr("cy", 0);

        ng.append("image")
          .attr("href", optimizeAvatarUrl(d.avatar_url))
          .attr("x", -AVATAR_R)
          .attr("y", -AVATAR_R)
          .attr("width", AVATAR_R * 2)
          .attr("height", AVATAR_R * 2)
          .attr("clip-path", `url(#${clipId})`)
          .attr("preserveAspectRatio", "xMidYMid slice")
          .style("pointer-events", "none");
      } else {
        ng.append("circle")
          .attr("r", AVATAR_R)
          .attr("fill", "var(--bg-elevated)")
          .style("pointer-events", "none");

        ng.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", 6)
          .attr("font-size", "18px")
          .attr("font-weight", "600")
          .attr("fill", "var(--text-primary)")
          .style("pointer-events", "none")
          .text((d.name || "?")[0]);
      }

      // Border ring
      ng.append("circle").attr("class", "person-ring node-visual").attr("r", AVATAR_R)
        .attr("fill", "none")
        .attr("stroke", "rgba(0, 0, 0, 0.08)")
        .attr("stroke-width", 2)
        .style("pointer-events", "none")
        .style("filter", NODE_TOKENS.shadow.idle)
        .style("transition", "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)");
    });

    function applyGraphQuality(settled) {
      const effect = settled ? NODE_TOKENS.shadow.idle : "none";
      g.selectAll(".person-ring").style("filter", effect);
      if (settled) {
        g.selectAll(".bar-node .node-visual").style("filter", NODE_TOKENS.shadow.idle);
        g.selectAll(".tag-node .node-visual").style("filter", NODE_TOKENS.shadow.idle);
      } else {
        g.selectAll(".bar-node .node-visual").style("filter", "none");
        g.selectAll(".tag-node .node-visual").style("filter", "none");
      }
    }

    applyGraphQuality(false);

    // ═══ Render bar nodes (colored circles with label) ═══
    node.filter(d => d.type === "bar").each(function (d) {
      const ng = d3.select(this);
      const r = getBarRadius(d.user_count, d.max_seats);
      const color = getBarColor(d.name);

      ng.append("circle").attr("class", "node-visual").attr("r", r)
        .attr("fill", color).attr("fill-opacity", 0.12)
        .attr("stroke", color).attr("stroke-width", 2).attr("stroke-opacity", 0.4)
        .style("cursor", "pointer")
        .style("filter", NODE_TOKENS.shadow.idle)
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

      ng.append("circle").attr("class", "node-visual").attr("r", r)
        .attr("fill", getTagColor())
        .attr("fill-opacity", 0.85)
        .attr("stroke", "rgba(255,255,255,0.6)")
        .attr("stroke-width", 1)
        .style("cursor", "pointer")
        .style("filter", NODE_TOKENS.shadow.idle)
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
      .transition().duration(MOTION.enter).delay((d, i) => Math.min(i * 8, 220))
      .ease(d3.easeCubicOut).style("opacity", 1);

    // ═══ Tick — links stop at node edges (ClawMatch style) ═══
    simulation.on("tick", () => {
      tickCounter += 1;
      if (tickCounter % 2 !== 0) return;
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

      if (simulation.alpha() < 0.03) {
        applyGraphQuality(true);
        simulation.stop();
      }
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
      d3.select(this).select(".node-visual")
        .transition().duration(MOTION.normal).ease(NODE_TOKENS.ease)
        .attr("r", (n) => getScaledRadius(n, NODE_TOKENS.hoverScale[n.type] || 1.06))
        .style("filter", NODE_TOKENS.shadow.hover);
    }

    function handleNodeLeave(event, d) {
      hideProfileCard();
      if (d.type === "tag") {
        const r = getTagRadius(d.totalCount || d.count);
        d3.select(this).select(".tag-label").transition().duration(MOTION.quick)
          .style("opacity", r > 30 ? 1 : 0);
      }
      if (!selectedNode) {
        d3.select(this).select(".node-visual")
          .transition().duration(MOTION.normal).ease(NODE_TOKENS.ease)
          .attr("r", (n) => getNodeRadius(n))
          .style("filter", NODE_TOKENS.shadow.idle);
      }
    }

    // ── Camera centering (ClawMatch style) ──
    function centerOnNode(nd) {
      const currentT = d3.zoomTransform(svg.node());
      const scale = currentT.k;
      const x = -nd.x * scale + width / 2;
      const y = -nd.y * scale + height / 2;
      svg.transition().duration(MOTION.focus).ease(d3.easeCubicInOut)
        .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    }

    // ── Highlight connections (ClawMatch style) ──
    function highlightConnections(d) {
      const connectedIds = new Set();
      links.forEach(l => {
        if (l.source.id === d.id) connectedIds.add(l.target.id);
        else if (l.target.id === d.id) connectedIds.add(l.source.id);
      });

      node.transition().duration(MOTION.normal).ease(d3.easeCubicOut)
        .style("opacity", n => (n.id === d.id || connectedIds.has(n.id)) ? 1 : 0.12);

      node.select(".node-visual")
        .transition()
        .duration(MOTION.normal)
        .ease(NODE_TOKENS.ease)
        .attr("r", (n) => {
          if (n.id === d.id) return getScaledRadius(n, NODE_TOKENS.selectedScale[n.type] || 1.08);
          if (connectedIds.has(n.id)) return getScaledRadius(n, 1.03);
          return getNodeRadius(n);
        })
        .style("filter", (n) => {
          if (n.id === d.id) return NODE_TOKENS.shadow.selected;
          if (connectedIds.has(n.id)) return NODE_TOKENS.shadow.hover;
          return NODE_TOKENS.shadow.idle;
        });

      allLink.transition().duration(MOTION.normal).ease(d3.easeCubicOut)
        .style("opacity", l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.03)
        .attr("stroke-width", l => (l.source.id === d.id || l.target.id === d.id) ? 2 : 1)
        .attr("stroke", l => (l.source.id === d.id || l.target.id === d.id) ? "#0071e3" : "rgba(0,0,0,0.06)");
    }

    function resetHighlight() {
      node.transition().duration(MOTION.normal).ease(d3.easeCubicOut).style("opacity", 1);
      node.select(".node-visual")
        .transition()
        .duration(MOTION.normal)
        .ease(NODE_TOKENS.ease)
        .attr("r", (n) => getNodeRadius(n))
        .style("filter", NODE_TOKENS.shadow.idle);
      allLink.transition().duration(MOTION.normal).ease(d3.easeCubicOut)
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
      profileCard = infoLayer.append("div")
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

      profileCard.transition().duration(MOTION.normal).ease(d3.easeCubicOut)
        .style("opacity", 1).style("transform", "translateY(0)");
    }

    function hideProfileCard() {
      if (profileCard) {
        profileCard.transition().duration(MOTION.quick).style("opacity", 0).remove();
        profileCard = null;
      }
    }

    function showSelectedProfileCard(d) {
      hideSelectedProfileCard();
      selectedProfileCard = infoLayer.append("div")
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

      selectedProfileCard.transition().duration(MOTION.normal).ease(d3.easeCubicOut)
        .style("opacity", 1).style("transform", "translateX(0)");
    }

    function hideSelectedProfileCard() {
      if (selectedProfileCard) {
        selectedProfileCard.transition().duration(MOTION.quick)
          .style("opacity", 0).style("transform", "translateX(20px)").remove();
        selectedProfileCard = null;
      }
    }

    // ═══ Tag Cards (ClawMatch design) ═══
    function showSelectedTagCard(d) {
      hideSelectedTagCard();
      const tagName = d.name;
      const connectedPeople = nodesData.filter(n => n.type === "person" && n.tags && n.tags.includes(tagName));

      selectedTagCard = infoLayer.append("div")
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

      selectedTagCard.transition().duration(MOTION.normal).ease(d3.easeCubicOut)
        .style("opacity", 1).style("transform", "translateX(0)");
    }

    function hideSelectedTagCard() {
      if (selectedTagCard) {
        selectedTagCard.transition().duration(MOTION.quick)
          .style("opacity", 0).style("transform", "translateX(20px)").remove();
        selectedTagCard = null;
      }
    }

    // ═══ Bar Card (for bar node clicks) ═══
    function showBarCard(d) {
      hideSelectedProfileCard(); hideSelectedTagCard();
      selectedProfileCard = infoLayer.append("div")
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

      selectedProfileCard.transition().duration(MOTION.normal).ease(d3.easeCubicOut)
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
    const onSelectNode = (personId) => {
      const nd = nodesData.find((n) => n.id === personId);
      if (!nd) return;
      const nodeEl = d3.selectAll(".node").filter((n) => n.id === personId);
      if (nodeEl.node()) nodeEl.dispatch("click");
    };

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

    return createStreetSearch({
      searchContainer,
      searchInput,
      resultsEl,
      getNodes: () => nodesData,
      getCircleNodeIds: () => {
        const ownerId = currentUser?.uuid;
        return resolveCircleNodeIds(linksData, ownerId);
      },
      onSelectNode,
      renderSearchAvatar,
      renderSearchBarAvatar,
      esc,
    });
  }

  // Cleanup
  return () => {
    if (simulation) simulation.stop();
    if (searchCleanup) searchCleanup();
    infoLayer.selectAll(".profile-card").remove();
    document.body.classList.remove("street-newsprint-active");
  };
}

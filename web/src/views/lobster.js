/**
 * Lobster Pool view — dark-themed agent social layer.
 *
 * Exact replication of ClawMatch/mistre shrimp tab:
 * Metaball goo network with 20 lobsters, autonomous seek/cluster,
 * breathing animation, keyword bubbles, interaction board, stats bar,
 * detail panel on click.
 */

import * as d3 from "d3";
import { navigate } from "../router.js";
import { icon } from "../icons.js";

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ── Palette ────────────────────────────────────────────

const C = {
  bg:       '#0a0a0a',
  red:      '#ff2d55',
  redDim:   'rgba(255,45,85,0.35)',
  redGhost: 'rgba(255,45,85,0.08)',
  text:     '#e0e0e0',
  textDim:  'rgba(255,255,255,0.4)',
  blob:     'rgba(255,45,85,0.55)',
  blobSelf: 'rgba(255,45,85,0.75)',
  bubble:   'rgba(255,45,85,0.12)',
  bubbleBd: 'rgba(255,45,85,0.35)',
};

const NODE_R = 26;
const SELF_R = 32;

// ── Color ramp: white → rose → red → crimson → deep red → near-black ──

const COLOR_RAMP = [
  '#ffffff','#ffe0e6','#ffb3c1','#ff8fa3','#ff6b7f',
  '#ff4060','#ff2d55','#e6193d','#cc0030','#990024',
  '#66001a','#4d0013','#33000d','#1a0007','#0d0003',
];

function rampColor(index, total) {
  const t = index / (total - 1);
  const i = t * (COLOR_RAMP.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, COLOR_RAMP.length - 1);
  return d3.interpolateRgb(COLOR_RAMP[lo], COLOR_RAMP[hi])(i - lo);
}

function lobsterSVG(bodyFill, darkFill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<g><path fill="${bodyFill}" d="M344.22,319.986h-28.561c-5.89,0-10.671-4.78-10.671-10.671s4.781-10.656,10.671-10.656h26.045l40.405-20.218c5.28-2.625,11.687-0.5,14.312,4.781c2.641,5.265,0.5,11.671-4.766,14.312l-42.67,21.328C347.517,319.595,345.877,319.986,344.22,319.986z"/><path fill="${bodyFill}" d="M344.22,362.656h-42.669c-5.891,0-10.656-4.781-10.656-10.672s4.766-10.672,10.656-10.672h40.153l40.405-20.201c5.28-2.64,11.687-0.5,14.312,4.765c2.641,5.281,0.5,11.688-4.766,14.312l-42.67,21.343C347.517,362.265,345.877,362.656,344.22,362.656z"/><path fill="${bodyFill}" d="M202.117,319.986h-28.562c-1.656,0-3.281-0.391-4.766-1.124l-42.67-21.328c-5.265-2.641-7.406-9.047-4.765-14.312c2.64-5.281,9.046-7.406,14.312-4.781l40.404,20.218h26.046c5.891,0,10.671,4.766,10.671,10.656S208.008,319.986,202.117,319.986z"/><path fill="${bodyFill}" d="M216.226,362.656h-42.67c-1.656,0-3.281-0.391-4.766-1.125l-42.67-21.343c-5.265-2.625-7.406-9.031-4.765-14.312c2.64-5.265,9.046-7.404,14.312-4.765l40.404,20.201h40.155c5.891,0,10.671,4.781,10.671,10.672S222.117,362.656,216.226,362.656z"/></g>
<g><path fill="${darkFill}" d="M276.098,163.337c-1.516,0-3.062-0.328-4.531-1.016c-5.327-2.516-7.608-8.859-5.108-14.203l46.779-99.339c2.516-5.328,8.859-7.609,14.202-5.109c5.327,2.516,7.608,8.875,5.093,14.202l-46.778,99.34C283.942,161.071,280.114,163.337,276.098,163.337z"/><path fill="${darkFill}" d="M237.569,167.259c-4.203,0-8.172-2.484-9.875-6.594L185.04,57.403c-2.25-5.437,0.328-11.687,5.781-13.937c5.437-2.25,11.687,0.344,13.937,5.797l42.654,103.245c2.25,5.453-0.328,11.688-5.781,13.938C240.303,166.993,238.912,167.259,237.569,167.259z"/></g>
<g><path fill="${bodyFill}" d="M191.915,213.335c-15.89-0.688-44.951-4.594-55.326-12.188c-12.047-8.796-14.515-27.046-14.531-27.187c-0.344-2.969-1.938-5.656-4.359-7.39c-2.438-1.75-5.484-2.391-8.422-1.781l-29.046,6.093c-5.64,1.188-9.327,6.641-8.312,12.312c0.156,0.828,3.75,20.608,13.78,44.873c5.484,13.233,23.687,24.765,57.295,36.311c22.671,7.781,43.748,12.484,44.639,12.688c0.766,0.172,1.531,0.25,2.312,0.25c2.344,0,4.641-0.766,6.515-2.234c2.516-1.938,4.031-4.891,4.141-8.047l1.516-42.67C202.321,218.507,197.774,213.585,191.915,213.335z"/><path fill="${bodyFill}" d="M431.749,170.883l-29.062-6.093c-2.922-0.609-5.984,0.031-8.406,1.781c-2.438,1.733-4.016,4.421-4.375,7.39c-0.016,0.188-2.5,18.406-14.53,27.187c-10.374,7.594-39.437,11.5-55.31,12.188c-5.859,0.25-10.421,5.172-10.218,11.03l1.515,42.67c0.125,3.156,1.641,6.109,4.141,8.047c1.891,1.469,4.188,2.234,6.531,2.234c0.766,0,1.547-0.078,2.312-0.25c0.874-0.203,21.967-4.906,44.622-12.688c33.608-11.546,51.827-23.077,57.295-36.311c10.047-24.265,13.64-44.045,13.78-44.873C441.06,177.523,437.389,172.07,431.749,170.883z"/></g>
<g><path fill="${bodyFill}" d="M301.551,490.65h-85.325c-5.891,0-10.671-4.78-10.671-10.671v-125.62c-4.594-10.141-21.328-51.075-21.328-109.042c0-28.748,11.953-57.888,34.562-84.277c16.765-19.546,33.483-30.796,34.186-31.265c3.578-2.375,8.25-2.375,11.828,0c0.703,0.469,17.421,11.719,34.187,31.265c22.608,26.39,34.56,55.529,34.56,84.277c0,57.967-16.732,98.901-21.326,109.042v125.62C312.222,485.87,307.442,490.65,301.551,490.65z"/><path fill="${bodyFill}" d="M437.686,35.67C412.671,1,370.641,0,365.923,0c-0.406,0-0.625,0-0.625,0c-3.938,0.125-7.531,2.39-9.297,5.905c-1.359,2.766-32.748,66.951-0.922,106.012c4.141,12.343,22.78,64.231,47.811,78.653c1.625,0.922,3.469,1.422,5.328,1.422h21.327c4.594,0,8.688-2.938,10.125-7.297C461.762,118.244,461.091,68.106,437.686,35.67z"/><path fill="${bodyFill}" d="M146.667,0c0,0-0.203,0-0.625,0c-4.703,0-46.749,1-71.747,35.67c-23.406,32.437-24.077,82.574-2,149.025c1.453,4.359,5.531,7.297,10.124,7.297h21.328c1.875,0,3.703-0.5,5.328-1.422c25.046-14.422,43.67-66.311,47.811-78.653c31.843-39.061,0.453-103.246-0.922-106.012C154.213,2.389,150.604,0.125,146.667,0z"/></g>
<g><path fill="${darkFill}" d="M248.225,191.992c0,5.89-4.781,10.671-10.671,10.671c-5.891,0-10.656-4.781-10.656-10.671c0-5.891,4.766-10.672,10.656-10.672C243.444,181.32,248.225,186.101,248.225,191.992z"/><path fill="${darkFill}" d="M290.895,191.992c0,5.89-4.781,10.671-10.672,10.671s-10.672-4.781-10.672-10.671c0-5.891,4.781-10.672,10.672-10.672S290.895,186.101,290.895,191.992z"/></g>
<g><path fill="${bodyFill}" d="M295.098,451.809c-14.984-3.453-30.312-3.828-36.202-3.828c-5.906,0-21.233,0.375-36.217,3.828c-31.812,7.344-38.483,23.232-38.483,35.279c0,13.718,11.968,24.89,26.671,24.89c4.203,0,8.312-0.938,12.016-2.672c3.687,1.734,7.796,2.672,11.999,2.672c4.203,0,8.312-0.938,12-2.672c3.703,1.734,7.812,2.672,12.015,2.672c4.203,0,8.312-0.938,11.999-2.672c3.688,1.734,7.812,2.672,12,2.672c4.203,0,8.312-0.938,12.016-2.672c3.688,1.734,7.797,2.672,12,2.672c14.702,0,26.669-11.172,26.669-24.89C333.58,475.042,326.909,459.153,295.098,451.809z"/><path fill="${bodyFill}" d="M290.895,362.656c-5.891,0-10.672,4.766-10.672,10.656s4.781,10.671,10.672,10.671h21.327v-21.327H290.895z"/><path fill="${bodyFill}" d="M290.895,405.31c-5.891,0-10.672,4.781-10.672,10.672s4.781,10.672,10.672,10.672h21.327V405.31H290.895z"/><path fill="${bodyFill}" d="M226.866,426.654c5.891,0,10.656-4.781,10.656-10.672s-4.766-10.672-10.656-10.672h-21.342v21.344H226.866z"/><path fill="${bodyFill}" d="M226.866,383.983c5.891,0,10.656-4.781,10.656-10.671c0-5.891-4.766-10.656-10.656-10.656h-21.342v21.327H226.866z"/><path fill="${bodyFill}" d="M333.314,257.286c0.156-3.906,0.234-7.891,0.234-11.969c0-3.422-0.172-6.844-0.5-10.266c-9.873,3.188-39.56,11.719-74.152,11.719c-34.452,0-64.247-8.531-74.153-11.719c-0.344,3.422-0.516,6.844-0.516,10.266c0,4.078,0.078,8.062,0.234,11.969c14.515,4.219,42.357,10.812,74.435,10.812C290.958,268.097,318.801,261.505,333.314,257.286z"/><path fill="${bodyFill}" d="M397.781,106.651c-2.734,0-5.453-1.031-7.547-3.125c-10.108-10.141-19.124-28.717-26.795-55.231c-5.5-19.016-8.281-35.155-8.406-35.827c-0.984-5.812,2.922-11.312,8.719-12.312c5.812-0.984,11.327,2.905,12.312,8.718l0,0c2.906,16.874,13.796,64.076,29.28,79.591c4.156,4.155,4.141,10.921-0.016,15.077C403.234,105.62,400.515,106.651,397.781,106.651z"/><path fill="${bodyFill}" d="M114.183,106.651c-2.719,0-5.453-1.031-7.531-3.109c-4.172-4.156-4.172-10.922-0.016-15.077c15.5-15.546,26.39-62.717,29.265-79.591c1-5.812,6.5-9.718,12.312-8.718s9.718,6.499,8.718,12.312c-0.109,0.672-2.906,16.812-8.405,35.827c-7.656,26.515-16.671,45.091-26.796,55.231C119.652,105.62,116.918,106.651,114.183,106.651z"/></g>
</svg>`;
}

function darkFillFor(bodyColor) {
  const c = d3.color(bodyColor);
  if (!c) return '#222';
  const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
  return lum > 140 ? '#333' : 'rgba(255,255,255,0.3)';
}

// ── Fake lobster data ──────────────────────────────────

const LOBSTERS = [
  { id: 'L00', name: 'Me',       isSelf: true, colorIdx: 6 },
  { id: 'L01', name: 'Ghost',    colorIdx: 0  },
  { id: 'L02', name: 'Pearl',    colorIdx: 1  },
  { id: 'L03', name: 'Blush',    colorIdx: 2  },
  { id: 'L04', name: 'Rose',     colorIdx: 3  },
  { id: 'L05', name: 'Coral',    colorIdx: 4  },
  { id: 'L06', name: 'Scarlet',  colorIdx: 5  },
  { id: 'L07', name: 'Flame',    colorIdx: 6  },
  { id: 'L08', name: 'Ruby',     colorIdx: 7  },
  { id: 'L09', name: 'Crimson',  colorIdx: 8  },
  { id: 'L10', name: 'Garnet',   colorIdx: 9  },
  { id: 'L11', name: 'Maroon',   colorIdx: 10 },
  { id: 'L12', name: 'Shadow',   colorIdx: 11 },
  { id: 'L13', name: 'Abyss',    colorIdx: 12 },
  { id: 'L14', name: 'Void',     colorIdx: 13 },
  { id: 'L15', name: 'Obsidian', colorIdx: 14 },
  { id: 'L16', name: 'Ember',    colorIdx: 5  },
  { id: 'L17', name: 'Frost',    colorIdx: 1  },
  { id: 'L18', name: 'Dusk',     colorIdx: 9  },
  { id: 'L19', name: 'Dawn',     colorIdx: 3  },
];

const KEYWORDS = [
  'P2P','AI','LLM','RAG','Agent','MCP','GPT',
  'Blockchain','Decentral','Encrypted','WebRTC','IPFS','DID',
  'Smart Contract','Distributed','Consensus','Zero-Knowledge','DAO','DeFi',
  'Sync Data','Find Nodes','Key Exchange','Verify Sig','Broadcast',
  'Share Pool','Open Channel','Heartbeat','Task Dispatch','Route Opt',
  'Open Source','Privacy','Security','Self-Govern','Trust Net',
  'Fed Learning','Edge Compute','Cross-Chain','Data Sovereign','Digital ID',
];

// ── Fake data generators ───────────────────────────────

function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h) + 1; }
function shuffle(arr, rand) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function generateFakeNetwork() {
  const rand = seededRand(42);
  const nodes = LOBSTERS.map(l => {
    const bodyColor = rampColor(l.colorIdx, COLOR_RAMP.length);
    return { id: l.id, label: l.name, type: l.isSelf ? 'self' : 'peer', colorIdx: l.colorIdx, bodyColor, darkColor: darkFillFor(bodyColor) };
  });
  const edges = [];
  const edgeSet = new Set();
  const addEdge = (a, b) => { const key = a < b ? `${a}-${b}` : `${b}-${a}`; if (edgeSet.has(key)) return; edgeSet.add(key); edges.push({ source: a, target: b, type: 'p2p' }); };
  for (let i = 0; i < nodes.length - 1; i++) addEdge(nodes[i].id, nodes[i + 1].id);
  addEdge(nodes[nodes.length - 1].id, nodes[0].id);
  for (let i = 0; i < 18; i++) { const a = nodes[Math.floor(rand() * nodes.length)].id; const b = nodes[Math.floor(rand() * nodes.length)].id; if (a !== b) addEdge(a, b); }
  return { nodes, edges };
}

function generateFakeFeed() {
  const now = Date.now();
  const ago = m => new Date(now - m * 60000).toISOString();
  const feed = [];
  feed.push(
    { type: 'task', title: 'Multi-Node Data Pipeline', publisher: 'L07', claimant: 'L02', state: 'claimed', reward: 8, time: ago(5) },
    { type: 'task', title: 'Distributed Crawler Coord', publisher: 'L00', state: 'open', reward: 5, time: ago(18) },
    { type: 'task', title: 'P2P File Sync Test', publisher: 'L11', claimant: 'L04', state: 'done', reward: 3, time: ago(45) },
  );
  [['L01','L03'],['L05','L08'],['L00','L12'],['L06','L09'],['L14','L17'],['L02','L10']].forEach((p, i) => {
    feed.push({ type: 'dm', from: p[0], to: p[1], content: ['Node status check?','Protocol test passed','Consensus algo has a bug','Keys exchanged','Data sync complete','Check this finding'][i], time: ago(2 + i * 7) });
  });
  feed.push(
    { type: 'topic', name: 'Decentralized AI', members: 8, messages: 34, time: ago(1) },
    { type: 'topic', name: 'Privacy Computing', members: 5, messages: 12, time: ago(10) },
    { type: 'topic', name: 'P2P Protocols', members: 11, messages: 67, time: ago(3) },
    { type: 'topic', name: 'Zero-Knowledge Proofs', members: 4, messages: 9, time: ago(25) },
    { type: 'topic', name: 'Edge Computing', members: 6, messages: 21, time: ago(15) },
  );
  feed.push(
    { type: 'knowledge', author: 'L08', title: 'Federated Learning Intro', content: 'Train models without sharing raw data', time: ago(8) },
    { type: 'knowledge', author: 'L15', title: 'WebRTC NAT Traversal', content: 'Comparing 3 punch-through approaches', time: ago(30) },
    { type: 'knowledge', author: 'L03', title: 'DID Best Practices', content: 'Decentralized identity implementation guide', time: ago(55) },
  );
  return { feed };
}

function generateFakeStats() {
  return { node_count: 20, overlay_name: 'ClawNet', active_tasks: 3, active_topics: 5, messages_total: 142, uptime: '5d 12h', version: 'v1.1.0' };
}

// ── Detail panel data generators ───────────────────────

const SKILL_POOL = ['P2P Networking','Distributed Systems','Cryptography','WebRTC','Smart Contracts','AI / LLM','Data Pipeline','Consensus Algo','Privacy Computing','Edge Inference','ZK Proofs','IPFS / Storage','NAT Traversal','Graph Analysis','DID / Identity','Fed Learning'];
const BEHAVIOR_TEMPLATES = [
  { action: 'Sent a message to', icon: '💬' },{ action: 'Published task', icon: '📋' },
  { action: 'Exchanged keys with', icon: '🔑' },{ action: 'Joined topic', icon: '💡' },
  { action: 'Shared knowledge about', icon: '📚' },{ action: 'Synced data with', icon: '🔄' },
  { action: 'Verified signature of', icon: '✅' },{ action: 'Opened channel to', icon: '📡' },
];
const KNOWLEDGE_POOL = ['Federated Learning Intro','WebRTC NAT Traversal','DID Best Practices','Cross-Chain Bridges','ZK-SNARK Tutorial','P2P Gossip Protocol','Edge Computing Patterns','Secure Multi-Party Computation'];
const TOPIC_POOL = ['Decentralized AI','Privacy Computing','P2P Protocols','Edge Computing','Zero-Knowledge Proofs','Digital Identity'];

function generateResume(node) {
  const rand = seededRand(hashStr(node.id));
  const skills = shuffle(SKILL_POOL, rand).slice(0, 3 + Math.floor(rand() * 3));
  return { skills, uptime: `${Math.floor(rand() * 30 + 1)}d ${Math.floor(rand() * 24)}h`, tasksCompleted: Math.floor(rand() * 20), msgSent: Math.floor(rand() * 80 + 10), trustScore: (0.6 + rand() * 0.4).toFixed(2) };
}
function generateBehaviors(node, allNodes) {
  const rand = seededRand(hashStr(node.id + 'beh'));
  const peers = allNodes.filter(n => n.id !== node.id);
  const behaviors = [];
  for (let i = 0; i < 4 + Math.floor(rand() * 3); i++) {
    const tmpl = BEHAVIOR_TEMPLATES[Math.floor(rand() * BEHAVIOR_TEMPLATES.length)];
    const peer = peers[Math.floor(rand() * peers.length)];
    let detail = '';
    if (tmpl.action.includes('to') || tmpl.action.includes('with') || tmpl.action.includes('of')) detail = peer.label;
    else if (tmpl.action.includes('topic')) detail = '#' + TOPIC_POOL[Math.floor(rand() * TOPIC_POOL.length)];
    else if (tmpl.action.includes('knowledge')) detail = KNOWLEDGE_POOL[Math.floor(rand() * KNOWLEDGE_POOL.length)];
    else if (tmpl.action.includes('task')) detail = '"Task-' + Math.floor(rand() * 999) + '"';
    behaviors.push({ icon: tmpl.icon, action: tmpl.action, detail, minsAgo: Math.floor(rand() * 120 + 1) });
  }
  behaviors.sort((a, b) => a.minsAgo - b.minsAgo);
  return behaviors;
}
function generatePartners(node, allNodes, adj) {
  const rand = seededRand(hashStr(node.id + 'part'));
  const neighbors = new Set(adj[node.id] || []);
  const pool = allNodes.filter(n => n.id !== node.id && !neighbors.has(n.id));
  return shuffle(pool.length > 0 ? pool : allNodes.filter(n => n.id !== node.id), rand).slice(0, 3).map(p => ({
    id: p.id, label: p.label, bodyColor: p.bodyColor,
    compat: (0.5 + rand() * 0.5).toFixed(2),
    reason: ['Overlapping skills in ' + SKILL_POOL[Math.floor(rand() * SKILL_POOL.length)],'Active in same topic channels','Complementary task history','High trust score match','Similar network neighborhood'][Math.floor(rand() * 5)],
  }));
}
function generateMatches(node, allNodes, adj) {
  const rand = seededRand(hashStr(node.id + 'match'));
  const neighbors = (adj[node.id] || []);
  const pool = allNodes.filter(n => neighbors.includes(n.id));
  return shuffle(pool, rand).slice(0, 3).map(p => ({
    id: p.id, label: p.label, bodyColor: p.bodyColor,
    status: ['seeking','negotiating','matched'][Math.floor(rand() * 3)],
    goal: ['Collaborate on distributed crawler','Joint ZK proof research','Data sync partnership','Cross-node inference pipeline','Shared relay infrastructure'][Math.floor(rand() * 5)],
  }));
}

const STATUS_COLORS = {
  seeking:     { bg: 'rgba(255,149,0,0.12)', fg: '#ff9500' },
  negotiating: { bg: 'rgba(255,204,0,0.12)', fg: '#ffcc00' },
  matched:     { bg: 'rgba(255,59,48,0.12)', fg: '#ff3b30' },
};
const TYPE_DOT_COLOR = { task: '#ff9500', dm: '#ff6b4a', topic: '#ffcc00', knowledge: '#ff3b30' };

// ── Board rendering ────────────────────────────────────

const TABS = [
  { id: 'all', label: 'All' },{ id: 'task', label: 'Tasks' },
  { id: 'dm', label: 'Messages' },{ id: 'topic', label: 'Topics' },{ id: 'knowledge', label: 'Knowledge' },
];

function fmtTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts); const now = new Date(); const diff = now - d;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}
function fmtMins(m) { return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`; }

function buildBoardItems(feedData, topoData) {
  const items = [];
  const feed = (feedData && feedData.feed) || [];
  const nodes = (topoData && topoData.nodes) || [];
  const peerNames = {};
  for (const n of nodes) { if (n.type === 'self' || n.type === 'peer') peerNames[n.id] = n.label; }
  const name = id => peerNames[id] || id;

  for (const f of feed) {
    if (f.type === 'task') {
      const pub = f.publisher ? name(f.publisher) : '?';
      const claim = f.claimant ? name(f.claimant) : null;
      items.push({ type: 'task', actors: claim ? `${pub} → ${claim}` : pub, desc: `<strong>${esc(f.title)}</strong> <span class="claw-board-badge">${f.state}</span>${f.reward ? ` · ${f.reward} shells` : ''}`, time: fmtTime(f.time), ts: f.time || '' });
    } else if (f.type === 'dm') {
      items.push({ type: 'dm', actors: `${f.from || '?'} → ${f.to || '?'}`, desc: esc(f.content || ''), time: fmtTime(f.time), ts: f.time || '' });
    } else if (f.type === 'topic') {
      items.push({ type: 'topic', actors: `#${f.name || '?'}`, desc: `${f.members || 0} members · ${f.messages || 0} messages`, time: fmtTime(f.time), ts: f.time || '' });
    } else if (f.type === 'knowledge') {
      items.push({ type: 'knowledge', actors: f.author ? name(f.author) : '?', desc: `<strong>${esc(f.title)}</strong> ${esc(f.content || '')}`, time: fmtTime(f.time), ts: f.time || '' });
    }
  }
  items.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  return items;
}

// ═══ Main render ═══

export function renderLobster(app) {
  let simulation = null;
  let bubbleTimer = null;
  let seekTimer = null;
  let breatheRAF = null;
  let dynamicEdges = [];
  let nodesData = [];
  let edgesData = [];
  const adj = {};
  let gRoot = null;
  let _dragged = false;
  let detailEl = null;
  let boardCurrentTab = 'all';
  let boardItems = [];

  app.innerHTML = `
    <div class="lobster-layout" style="background:#0a0a0a;padding-bottom:0">
      <div class="claw-net-container" id="claw-net-container"></div>
      <div class="claw-board" id="claw-board">
        <div class="claw-board-header">
          <span class="claw-board-title">Interactions</span>
          <div class="claw-board-tabs">
            ${TABS.map(t => `<button class="claw-board-tab${t.id === 'all' ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
          </div>
        </div>
        <div class="claw-board-body"><div class="claw-board-list" id="claw-board-list"></div></div>
      </div>
      <div class="claw-stats" id="claw-stats">
        <div class="claw-stats-bar">
          <div class="claw-stat"><span class="claw-stat-value" id="cs-peers">—</span><span class="claw-stat-label">Nodes</span></div>
          <div class="claw-stat"><span class="claw-stat-value" id="cs-overlay">—</span><span class="claw-stat-label">Overlay</span></div>
          <div class="claw-stat"><span class="claw-stat-value" id="cs-tasks">—</span><span class="claw-stat-label">Tasks</span></div>
          <div class="claw-stat"><span class="claw-stat-value" id="cs-topics">—</span><span class="claw-stat-label">Topics</span></div>
          <div class="claw-stat"><span class="claw-stat-value" id="cs-msgs">—</span><span class="claw-stat-label">Messages</span></div>
          <div class="claw-stat"><span class="claw-stat-value" id="cs-uptime">—</span><span class="claw-stat-label">Uptime</span></div>
          <div class="claw-stat claw-stat-version"><span class="claw-stat-value" id="cs-version">—</span><span class="claw-stat-label">ClawNet</span></div>
        </div>
      </div>
      <nav class="bottomnav" style="background:rgba(10,10,10,0.95);border-color:rgba(255,45,85,0.15)">
        <button class="bottomnav__item" data-tab="street" style="color:rgba(255,255,255,0.4)">${icon.home(18)}<span>街区</span></button>
        <button class="bottomnav__item bottomnav__item--active" data-tab="lobster" style="color:#ff2d55">${icon.shell(18)}<span>龙虾池</span></button>
        <button class="bottomnav__item" data-tab="hot" style="color:rgba(255,255,255,0.4)">${icon.flame(18)}<span>热榜</span></button>
        <button class="bottomnav__item" data-tab="me" style="color:rgba(255,255,255,0.4)">${icon.user(18)}<span>我的</span></button>
      </nav>
    </div>
  `;

  // ── Nav ──
  document.querySelectorAll(".bottomnav__item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab === "street") navigate("/");
      else if (tab === "lobster") navigate("/lobster");
      else if (tab === "hot") navigate("/hot");
      else if (tab === "me") navigate("/me");
    });
  });

  // ── Board tab switching ──
  document.getElementById("claw-board").addEventListener("click", (e) => {
    const tab = e.target.closest(".claw-board-tab");
    if (!tab) return;
    boardCurrentTab = tab.dataset.tab;
    document.querySelectorAll(".claw-board-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === boardCurrentTab));
    renderBoardList();
  });

  // ── Data ──
  const { nodes, edges } = generateFakeNetwork();
  nodesData = nodes;
  edgesData = edges;
  for (const e of edgesData) {
    const s = typeof e.source === 'object' ? e.source.id : e.source;
    const t = typeof e.target === 'object' ? e.target.id : e.target;
    (adj[s] || (adj[s] = [])).push(t);
    (adj[t] || (adj[t] = [])).push(s);
  }

  const fakeTopo = { nodes: [...nodesData], edges: [...edgesData] };
  const fakeFeed = generateFakeFeed();
  boardItems = buildBoardItems(fakeFeed, fakeTopo);
  renderBoardList();
  updateStats(generateFakeStats());

  // ── Build graph ──
  buildGraph();
  startBubbles();
  startAutonomous();
  startBreathe();

  function renderBoardList() {
    const list = document.getElementById("claw-board-list");
    if (!list) return;
    const filtered = boardCurrentTab === 'all' ? boardItems : boardItems.filter(i => i.type === boardCurrentTab);
    if (filtered.length === 0) { list.innerHTML = '<div class="claw-board-empty">No interactions yet</div>'; return; }
    list.innerHTML = filtered.map(item => {
      const dot = TYPE_DOT_COLOR[item.type] || '#ff2d55';
      return `<div class="claw-board-item"><span class="claw-board-dot" style="background:${dot}"></span><div class="claw-board-content"><div class="claw-board-row"><span class="claw-board-actors">${esc(item.actors)}</span><span class="claw-board-time">${item.time}</span></div><div class="claw-board-desc">${item.desc}</div></div></div>`;
    }).join('');
  }

  function updateStats(data) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('cs-peers', data.node_count);
    set('cs-overlay', data.overlay_name);
    set('cs-tasks', data.active_tasks);
    set('cs-topics', data.active_topics);
    set('cs-msgs', data.messages_total);
    set('cs-uptime', data.uptime);
    set('cs-version', data.version);
  }

  // ── Graph ──
  function buildGraph() {
    const container = document.getElementById('claw-net-container');
    if (!container) return;
    const W = container.clientWidth || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;

    const svg = d3.select(container).append('svg')
      .attr('width', '100%').attr('height', '100%')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .style('background', C.bg);

    // Defs
    const defs = svg.append('defs');
    const goo = defs.append('filter').attr('id', 'goo').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
    goo.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '12').attr('result', 'blur');
    goo.append('feColorMatrix').attr('in', 'blur').attr('type', 'matrix').attr('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9').attr('result', 'goo');
    goo.append('feComposite').attr('in', 'SourceGraphic').attr('in2', 'goo').attr('operator', 'atop');
    const glow = defs.append('filter').attr('id', 'claw-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'blur');
    glow.append('feMerge').selectAll('feMergeNode').data(['blur', 'SourceGraphic']).enter().append('feMergeNode').attr('in', d => d);
    const bGlow = defs.append('filter').attr('id', 'bubble-glow').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%');
    bGlow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    bGlow.append('feMerge').selectAll('feMergeNode').data(['blur', 'SourceGraphic']).enter().append('feMergeNode').attr('in', d => d);

    // Grid
    const gs = 60;
    defs.append('pattern').attr('id', 'claw-grid').attr('width', gs).attr('height', gs).attr('patternUnits', 'userSpaceOnUse')
      .append('path').attr('d', `M ${gs} 0 L 0 0 0 ${gs}`).attr('fill', 'none').attr('stroke', C.redGhost).attr('stroke-width', 0.5);
    svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', 'url(#claw-grid)');

    gRoot = svg.append('g');
    gRoot.append('g').attr('class', 'claw-goo-layer').attr('filter', 'url(#goo)');
    gRoot.append('g').attr('class', 'claw-avatar-layer');
    gRoot.append('g').attr('class', 'claw-bubbles');

    svg.call(d3.zoom().scaleExtent([0.3, 3]).on('zoom', e => gRoot.attr('transform', e.transform)));

    const rad = d => d.type === 'self' ? SELF_R : NODE_R;

    simulation = d3.forceSimulation(nodesData)
      .force('link', d3.forceLink(edgesData).id(d => d.id).distance(120).strength(0.35))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(d => rad(d) + 16))
      .alphaDecay(0.012).velocityDecay(0.35);

    // Goo layer
    const gooG = gRoot.select('.claw-goo-layer');
    const connSel = gooG.selectAll('line.claw-conn').data(edgesData, d => `${d.source?.id || d.source}-${d.target?.id || d.target}`);
    const connAll = connSel.enter().append('line').attr('class', 'claw-conn').merge(connSel)
      .attr('stroke', C.blob).attr('stroke-width', NODE_R * 1.1).attr('stroke-linecap', 'round').attr('stroke-opacity', 0.6);
    const blobSel = gooG.selectAll('circle.claw-blob').data(nodesData, d => d.id);
    const blobAll = blobSel.enter().append('circle').attr('class', 'claw-blob').merge(blobSel)
      .attr('r', d => rad(d) + 4).attr('fill', d => d.type === 'self' ? C.blobSelf : C.blob);

    // Avatar layer
    const avatarG = gRoot.select('.claw-avatar-layer');
    const nSel = avatarG.selectAll('g.claw-node').data(nodesData, d => d.id);
    const nEnter = nSel.enter().append('g').attr('class', 'claw-node').style('cursor', 'pointer')
      .call(d3.drag().on('start', dragS).on('drag', dragM).on('end', dragE));

    nEnter.append('circle').attr('r', d => rad(d)).attr('fill', 'transparent').style('cursor', 'grab');
    const lobsterSize = d => (d.type === 'self' ? SELF_R : NODE_R) * 1.6;
    nEnter.append('foreignObject')
      .attr('x', d => -lobsterSize(d) / 2).attr('y', d => -lobsterSize(d) / 2)
      .attr('width', d => lobsterSize(d)).attr('height', d => lobsterSize(d))
      .style('overflow', 'visible').style('pointer-events', 'none')
      .append('xhtml:div').style('width', '100%').style('height', '100%')
      .html(d => lobsterSVG(d.bodyColor, d.darkColor));

    nEnter.append('text').attr('class', 'claw-label').attr('text-anchor', 'middle')
      .attr('dy', d => rad(d) + 16).attr('fill', C.text).attr('font-size', '10px')
      .attr('font-weight', '500').attr('font-family', "'Manrope', -apple-system, sans-serif")
      .text(d => d.label || '');

    const nAll = nEnter.merge(nSel);

    nAll.on('click', function(event, d) {
      if (_dragged) { _dragged = false; return; }
      event.stopPropagation();
      showDetail(d);
    });

    nAll.on('mouseenter', function(_, d) {
      gooG.selectAll('circle.claw-blob').filter(b => b.id === d.id)
        .transition().duration(250).ease(d3.easeCubicOut).attr('r', rad(d) + 12);
    }).on('mouseleave', function(_, d) {
      gooG.selectAll('circle.claw-blob').filter(b => b.id === d.id)
        .transition().duration(400).ease(d3.easeElasticOut.amplitude(0.6)).attr('r', rad(d) + 4);
    });

    // Entrance animations
    blobAll.attr('r', 0).transition().duration(700).delay((_, i) => i * 50)
      .ease(d3.easeElasticOut.amplitude(0.7).period(0.5)).attr('r', d => rad(d) + 4);
    connAll.style('opacity', 0).transition().duration(500).delay(600).style('opacity', 1);
    nEnter.style('opacity', 0).transition().duration(500).delay((_, i) => 200 + i * 50).ease(d3.easeCubicOut).style('opacity', 1);

    simulation.on('tick', () => {
      blobAll.attr('cx', d => d.x).attr('cy', d => d.y);
      connAll.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nAll.attr('transform', d => `translate(${d.x},${d.y})`);
      updateDynamicEdges();
    });

    function updateDynamicEdges() {
      const dSel = gooG.selectAll('line.claw-dyn').data(dynamicEdges, d => d.key);
      dSel.exit().remove();
      dSel.enter().append('line').attr('class', 'claw-dyn')
        .attr('stroke', C.blob).attr('stroke-width', NODE_R * 0.8).attr('stroke-linecap', 'round').attr('stroke-opacity', 0)
        .merge(dSel)
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    }

    function dragS(e, d) {
      if (!e.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y; _dragged = false;
      gooG.selectAll('circle.claw-blob').filter(b => b.id === d.id)
        .transition().duration(150).ease(d3.easeCubicOut).attr('r', rad(d) + 14);
    }
    function dragM(e, d) { d.fx = e.x; d.fy = e.y; _dragged = true; }
    function dragE(e, d) {
      if (!e.active) simulation.alphaTarget(0);
      d.fx = null; d.fy = null;
      gooG.selectAll('circle.claw-blob').filter(b => b.id === d.id)
        .transition().duration(500).ease(d3.easeElasticOut.amplitude(0.6)).attr('r', rad(d) + 4);
    }
  }

  // ── Autonomous seek behavior ──
  function startAutonomous() {
    setTimeout(() => { if (!gRoot) return; triggerSeek(); triggerSeek(); }, 2500);
    seekTimer = setInterval(() => { if (!gRoot) return; triggerSeek(); }, 2500);
  }

  function triggerSeek() {
    if (nodesData.length < 2) return;
    const seeker = nodesData[Math.floor(Math.random() * nodesData.length)];
    if (seeker.fx != null) return;
    const neighbors = new Set(adj[seeker.id] || []);
    const candidates = nodesData.filter(n => n.id !== seeker.id && !neighbors.has(n.id));
    const target = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : nodesData.filter(n => n.id !== seeker.id)[Math.floor(Math.random() * (nodesData.length - 1))];
    if (!target || !seeker.x || !target.x) return;

    const key = `dyn-${seeker.id}-${target.id}-${Date.now()}`;
    dynamicEdges.push({ key, source: seeker, target });
    simulation.force(`seek-${key}`, d3.forceLink([{ source: seeker, target }]).id(d => d.id).distance(60).strength(0.15));
    simulation.alpha(0.15).restart();

    setTimeout(() => {
      if (!gRoot) return;
      gRoot.select('.claw-goo-layer').selectAll('line.claw-dyn').filter(d => d.key === key)
        .transition().duration(400).ease(d3.easeCubicOut).attr('stroke-opacity', 0.5);
    }, 50);
    setTimeout(() => spawnBubble(seeker), 300);
    setTimeout(() => spawnBubble(target), 700);

    const lifetime = 2500 + Math.random() * 2500;
    setTimeout(() => {
      if (gRoot) {
        gRoot.select('.claw-goo-layer').selectAll('line.claw-dyn').filter(d => d.key === key)
          .transition().duration(600).ease(d3.easeCubicIn).attr('stroke-opacity', 0).remove();
      }
      dynamicEdges = dynamicEdges.filter(e => e.key !== key);
      if (simulation) { simulation.force(`seek-${key}`, null); simulation.alpha(0.05).restart(); }
    }, lifetime);
  }

  // ── Breathing ──
  let breathePhase = 0;
  function startBreathe() {
    nodesData.forEach(d => { d._breatheOffset = Math.random() * Math.PI * 2; });
    const loop = () => {
      if (!gRoot) return;
      breathePhase += 0.02;
      gRoot.select('.claw-goo-layer').selectAll('circle.claw-blob')
        .attr('r', d => {
          const base = d.type === 'self' ? SELF_R : NODE_R;
          return base + 4 + Math.sin(breathePhase + (d._breatheOffset || 0)) * 3;
        });
      breatheRAF = requestAnimationFrame(loop);
    };
    breatheRAF = requestAnimationFrame(loop);
  }

  // ── Bubbles ──
  function startBubbles() {
    setTimeout(() => { if (!gRoot) return; spawnBubble(); spawnBubble(); }, 2000);
    bubbleTimer = setInterval(() => {
      if (!gRoot) return;
      spawnBubble();
      if (Math.random() < 0.3) setTimeout(() => spawnBubble(), 300);
    }, 1800);
  }

  function spawnBubble(forNode) {
    if (!gRoot || nodesData.length === 0) return;
    const node = forNode || nodesData[Math.floor(Math.random() * nodesData.length)];
    if (node.x == null || node.y == null) return;
    const keyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
    const r = node.type === 'self' ? SELF_R : NODE_R;
    const offsetX = (Math.random() - 0.5) * 24;
    const startY = node.y - r - 12;

    const bubbleG = gRoot.select('.claw-bubbles').append('g').attr('class', 'claw-bubble')
      .attr('transform', `translate(${node.x + offsetX}, ${startY})`);
    const txt = bubbleG.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('fill', '#fff').attr('font-size', '10px').attr('font-weight', '500')
      .attr('font-family', "'Manrope', -apple-system, sans-serif").text(keyword);
    const bbox = txt.node().getBBox();
    const px = 10, py = 5;
    bubbleG.insert('rect', 'text')
      .attr('x', bbox.x - px).attr('y', bbox.y - py)
      .attr('width', bbox.width + px * 2).attr('height', bbox.height + py * 2)
      .attr('rx', (bbox.height + py * 2) / 2)
      .attr('fill', C.bubble).attr('stroke', C.bubbleBd).attr('stroke-width', 0.5)
      .attr('filter', 'url(#bubble-glow)');

    const floatDist = 28 + Math.random() * 22;
    const duration = 2600 + Math.random() * 1200;
    bubbleG.style('opacity', 0)
      .transition().duration(250).ease(d3.easeCubicOut).style('opacity', 1)
      .transition().duration(duration).ease(d3.easeLinear)
        .attr('transform', `translate(${node.x + offsetX}, ${startY - floatDist})`)
      .transition().duration(350).ease(d3.easeCubicIn).style('opacity', 0).remove();
  }

  // ── Detail panel ──
  function showDetail(node) {
    hideDetail();
    const resume = generateResume(node);
    const behaviors = generateBehaviors(node, nodesData);
    const partners = generatePartners(node, nodesData, adj);
    const matchTargets = generateMatches(node, nodesData, adj);

    detailEl = document.createElement('div');
    detailEl.className = 'claw-detail';
    detailEl.innerHTML = `
      <div class="claw-detail-header">
        <div class="claw-detail-avatar" style="color:${node.bodyColor}">
          <svg viewBox="0 0 512 512" width="48" height="48">
            <path fill="currentColor" d="M301.551,490.65h-85.325c-5.891,0-10.671-4.78-10.671-10.671v-125.62c-4.594-10.141-21.328-51.075-21.328-109.042c0-28.748,11.953-57.888,34.562-84.277c16.765-19.546,33.483-30.796,34.186-31.265c3.578-2.375,8.25-2.375,11.828,0c0.703,0.469,17.421,11.719,34.187,31.265c22.608,26.39,34.56,55.529,34.56,84.277c0,57.967-16.732,98.901-21.326,109.042v125.62C312.222,485.87,307.442,490.65,301.551,490.65z"/>
            <path fill="currentColor" d="M437.686,35.67C412.671,1,370.641,0,365.923,0c-0.406,0-0.625,0-0.625,0c-3.938,0.125-7.531,2.39-9.297,5.905c-1.359,2.766-32.748,66.951-0.922,106.012c4.141,12.343,22.78,64.231,47.811,78.653c1.625,0.922,3.469,1.422,5.328,1.422h21.327c4.594,0,8.688-2.938,10.125-7.297C461.762,118.244,461.091,68.106,437.686,35.67z"/>
            <path fill="currentColor" d="M146.667,0c0,0-0.203,0-0.625,0c-4.703,0-46.749,1-71.747,35.67c-23.406,32.437-24.077,82.574-2,149.025c1.453,4.359,5.531,7.297,10.124,7.297h21.328c1.875,0,3.703-0.5,5.328-1.422c25.046-14.422,43.67-66.311,47.811-78.653c31.843-39.061,0.453-103.246-0.922-106.012C154.213,2.389,150.604,0.125,146.667,0z"/>
          </svg>
        </div>
        <div class="claw-detail-identity">
          <div class="claw-detail-name">${esc(node.label)}</div>
          <div class="claw-detail-id">${esc(node.id)} · ${node.type === 'self' ? 'You' : 'Peer'}</div>
        </div>
        <button class="claw-detail-close" aria-label="Close">✕</button>
      </div>
      <div class="claw-detail-sections">
        <div class="claw-detail-section">
          <div class="claw-detail-section-title">Resume</div>
          <div class="claw-detail-resume">
            <div class="claw-detail-stat-row">
              <span class="claw-detail-stat"><span class="claw-detail-stat-val">${resume.trustScore}</span><span class="claw-detail-stat-label">Trust</span></span>
              <span class="claw-detail-stat"><span class="claw-detail-stat-val">${resume.tasksCompleted}</span><span class="claw-detail-stat-label">Tasks</span></span>
              <span class="claw-detail-stat"><span class="claw-detail-stat-val">${resume.msgSent}</span><span class="claw-detail-stat-label">Messages</span></span>
              <span class="claw-detail-stat"><span class="claw-detail-stat-val">${resume.uptime}</span><span class="claw-detail-stat-label">Uptime</span></span>
            </div>
            <div class="claw-detail-skills">${resume.skills.map(s => `<span class="claw-detail-skill">${esc(s)}</span>`).join('')}</div>
          </div>
        </div>
        <div class="claw-detail-section">
          <div class="claw-detail-section-title">Recent Activity</div>
          <div class="claw-detail-activity">
            ${behaviors.map(b => `<div class="claw-detail-activity-item"><span class="claw-detail-act-icon">${b.icon}</span><span class="claw-detail-act-text">${esc(b.action)} <strong>${esc(b.detail)}</strong></span><span class="claw-detail-act-time">${fmtMins(b.minsAgo)}</span></div>`).join('')}
          </div>
        </div>
        <div class="claw-detail-section">
          <div class="claw-detail-section-title">Potential Partners</div>
          <div class="claw-detail-partners">
            ${partners.map(p => `<div class="claw-detail-partner"><div class="claw-detail-partner-dot" style="background:${p.bodyColor}"></div><div class="claw-detail-partner-info"><div class="claw-detail-partner-name">${esc(p.label)} <span class="claw-detail-compat">${(p.compat * 100).toFixed(0)}% match</span></div><div class="claw-detail-partner-reason">${esc(p.reason)}</div></div></div>`).join('')}
          </div>
        </div>
        <div class="claw-detail-section">
          <div class="claw-detail-section-title">Current Match Targets</div>
          <div class="claw-detail-matches">
            ${matchTargets.length === 0 ? '<div class="claw-detail-empty">No active matches</div>' : matchTargets.map(m => {
              const sc = STATUS_COLORS[m.status] || STATUS_COLORS.seeking;
              return `<div class="claw-detail-match"><div class="claw-detail-match-dot" style="background:${m.bodyColor}"></div><div class="claw-detail-match-info"><div class="claw-detail-match-name">${esc(m.label)} <span class="claw-detail-match-status" style="background:${sc.bg};color:${sc.fg}">${m.status}</span></div><div class="claw-detail-match-goal">${esc(m.goal)}</div></div></div>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    detailEl.querySelector('.claw-detail-close').addEventListener('click', hideDetail);
    document.body.appendChild(detailEl);
    requestAnimationFrame(() => detailEl.classList.add('visible'));
  }

  function hideDetail() {
    if (!detailEl) return;
    detailEl.classList.remove('visible');
    const el = detailEl;
    detailEl = null;
    setTimeout(() => el.remove(), 250);
  }

  // ── Cleanup ──
  return () => {
    if (simulation) simulation.stop();
    if (bubbleTimer) clearInterval(bubbleTimer);
    if (seekTimer) clearInterval(seekTimer);
    if (breatheRAF) cancelAnimationFrame(breatheRAF);
    hideDetail();
    gRoot = null;
  };
}

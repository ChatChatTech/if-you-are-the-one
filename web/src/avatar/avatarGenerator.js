import {
  humationMetaData,
  getDefaultHumationParts,
  getHumationGroups,
  getHumationGroupOffset,
  getHumationPart,
} from './humationData.js';

const AVATAR_VIEWBOX = { x: 4, y: 6, width: 72, height: 116 };
const AVATAR_OPTION_PREVIEW_VIEWBOX = { x: 4, y: -6, width: 72, height: 108 };
export const AVATAR_ONLY_GROUP_IDS = ['1', '2', '4', '5'];
export const FIXED_AVATAR_COLORS = Object.freeze({
  head: '000000',
  body: 'FFFFFF',
  bottom: 'FFFFFF',
  skin: 'FFFFFF',
  stroke: '000000',
  background: 'FFFFFF',
});
export const AVATAR_COLOR_VALUE_OPTIONS = Object.freeze(['000000', 'FFFFFF']);
export const AVATAR_COLOR_FIELDS = Object.freeze([
  { id: 'head', label: '特征色', groupId: '1' },
  { id: 'body', label: '服装色', groupId: '2' },
]);

const AVATAR_GROUP_LABELS = {
  '1': '头部',
  '2': '身体',
  '4': '道具',
  '5': '眼镜',
};

const COLOR_TOKEN_MAP = {
  '#008000': 'head', '#008000ff': 'head', 'green': 'head',
  '#0000ff': 'body', '#0000ffff': 'body', 'blue': 'body',
  '#ffe100': 'body',
  '#ff0000': 'bottom', '#ff0000ff': 'bottom', 'red': 'bottom',
  '#808080': 'stroke', '#808080ff': 'stroke', 'gray': 'stroke', 'grey': 'stroke',
  'black': 'stroke', '#000000': 'stroke', '#000000ff': 'stroke',
  '#fefefe': 'skin', '#fefefeff': 'skin', 'white': 'skin',
  '#ffffff': 'skin', '#ffffffff': 'skin',
};

export function getAvatarGroups() {
  return getHumationGroups()
    .filter((group) => AVATAR_ONLY_GROUP_IDS.includes(group.groupId))
    .map((group) => ({
      ...group,
      displayName: AVATAR_GROUP_LABELS[group.groupId] || group.groupName,
    }));
}

export function getDefaultAvatarColors() {
  return { ...FIXED_AVATAR_COLORS };
}

export function getEditableAvatarColors() {
  return [...AVATAR_COLOR_FIELDS];
}

export function normalizeAvatarConfig(config) {
  const defaultParts = getDefaultHumationParts();
  const nextParts = {};
  const incomingParts = config?.parts || {};
  const incomingColors = config?.colors || {};
  const defaultColors = getDefaultAvatarColors();
  const colors = { ...defaultColors };

  humationMetaData.partsGroups.forEach((group) => {
    const requestedPart = incomingParts[group.groupId];
    nextParts[group.groupId] = group.parts.includes(requestedPart)
      ? requestedPart
      : defaultParts[group.groupId];
  });

  AVATAR_COLOR_FIELDS.forEach((field) => {
    const requestedColor = String(incomingColors[field.id] || '').toUpperCase();
    colors[field.id] = AVATAR_COLOR_VALUE_OPTIONS.includes(requestedColor)
      ? requestedColor
      : defaultColors[field.id];
  });

  Object.keys(defaultColors).forEach((colorKey) => {
    if (AVATAR_COLOR_FIELDS.some((field) => field.id === colorKey)) return;
    colors[colorKey] = defaultColors[colorKey];
  });

  return { version: config?.version || 'humation-1', parts: nextParts, colors };
}

export function getDefaultAvatarConfig() {
  return normalizeAvatarConfig({
    version: 'humation-1',
    parts: getDefaultHumationParts(),
    colors: getDefaultAvatarColors(),
  });
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function randomizeAvatarConfig(baseConfig) {
  const current = normalizeAvatarConfig(baseConfig || getDefaultAvatarConfig());
  const parts = { ...current.parts };
  getAvatarGroups().forEach((group) => {
    parts[group.groupId] = pickRandom(group.parts);
  });
  return normalizeAvatarConfig({ version: current.version, parts, colors: current.colors });
}

function applyColors(svgContent, colors) {
  if (!svgContent) return '';
  return svgContent.replace(/(fill|stroke)="([^"]+)"/gi, (match, attr, originalColor) => {
    const token = COLOR_TOKEN_MAP[originalColor.toLowerCase()];
    if (!token) return match;
    return `${attr}="#${colors[token]}"`;
  });
}

export function renderHumationAvatarSvg(config, options = {}) {
  const normalized = normalizeAvatarConfig(config);
  const includeGroupIds = options.includeGroupIds || AVATAR_ONLY_GROUP_IDS;
  const viewBox = options.viewBox || AVATAR_VIEWBOX;
  const showBackground = options.background !== false;
  const colors = normalized.colors;
  const svgParts = [];

  getHumationGroups().forEach((group) => {
    if (includeGroupIds && !includeGroupIds.includes(group.groupId)) return;
    if (group.groupHidden) return;
    const partId = normalized.parts[group.groupId];
    const partSvg = getHumationPart(group.groupId, partId);
    if (!partSvg) return;
    svgParts.push(
      `<g transform="translate(0, ${getHumationGroupOffset(group.groupId)})">${applyColors(partSvg, colors)}</g>`
    );
  });

  const backgroundRect = showBackground
    ? `<rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="${viewBox.height}" fill="#${colors.background}" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${backgroundRect}${svgParts.join('')}</svg>`;
}

export function avatarSvgToDataUrl(svgMarkup) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgMarkup)}`;
}

export function buildAvatarUrlFromConfig(config, options = {}) {
  return avatarSvgToDataUrl(renderHumationAvatarSvg(config, options));
}

export function buildAvatarOptionPreview(config, groupId, partId) {
  const normalized = normalizeAvatarConfig(config);
  return buildAvatarUrlFromConfig({
    ...normalized,
    parts: { ...normalized.parts, [groupId]: partId },
  }, { viewBox: AVATAR_OPTION_PREVIEW_VIEWBOX });
}

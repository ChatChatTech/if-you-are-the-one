import {
  buildAvatarOptionPreview,
  buildAvatarUrlFromConfig,
  getEditableAvatarColors,
  getAvatarGroups,
  getDefaultAvatarConfig,
  normalizeAvatarConfig,
  randomizeAvatarConfig,
} from './avatarGenerator.js';
import { icon } from '../icons.js';

const GROUP_COPY = {
  '1': '选择头部造型和发型轮廓',
  '2': '选择上半身服装款式',
  '4': '选择手持道具或配饰',
  '5': '选择眼镜样式',
};

function getOptionLabel(group, partId, index) {
  if (partId === '000') return `无${group.displayName}`;
  return `${group.displayName} ${String(index + 1).padStart(2, '0')}`;
}

function renderTabs(activeGroupId) {
  return getAvatarGroups().map((group) => {
    const isActive = group.groupId === activeGroupId;
    return `<button type="button" class="avatar-tab ${isActive ? 'is-active' : ''}" data-avatar-tab="${group.groupId}">${group.displayName}</button>`;
  }).join('');
}

function renderOptions(config, activeGroupId) {
  const group = getAvatarGroups().find((g) => g.groupId === activeGroupId) || getAvatarGroups()[0];
  const colorHtml = renderColorOptions(config, activeGroupId);
  const options = group.parts.map((partId, index) => {
    const previewUrl = buildAvatarOptionPreview(config, group.groupId, partId);
    const isSelected = config.parts[group.groupId] === partId;
    const label = getOptionLabel(group, partId, index);
    return `<button type="button" class="avatar-option-card ${isSelected ? 'is-active' : ''}" data-part-group="${group.groupId}" data-part-id="${partId}" title="${label}">
      <span class="avatar-option-preview-wrap"><img src="${previewUrl}" alt="${label}" class="avatar-option-preview"></span>
      <span class="avatar-option-label">${label}</span>
    </button>`;
  }).join('');

  return `<div class="avatar-tab-panel">
    <p class="avatar-tab-copy">${GROUP_COPY[group.groupId] || ''}</p>
    ${colorHtml}
    <div class="avatar-option-grid">${options}</div>
  </div>`;
}

function renderColorOptions(config, activeGroupId) {
  const rows = getEditableAvatarColors()
    .filter((field) => field.groupId === activeGroupId)
    .map((field) => {
      const currentValue = config.colors[field.id];
      return `<div class="avatar-color-row">
        <span class="avatar-color-label">${field.label}</span>
        <div class="avatar-color-toggle">
          ${['000000', 'FFFFFF'].map((value) => {
            const isActive = currentValue === value;
            const cls = value === '000000' ? 'is-black' : 'is-white';
            const label = value === '000000' ? '黑' : '白';
            return `<button type="button" class="avatar-color-chip ${isActive ? 'is-active' : ''} ${cls}" data-avatar-color-field="${field.id}" data-avatar-color-value="${value}">${label}</button>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');
  return rows ? `<div class="avatar-color-panel">${rows}</div>` : '';
}

function renderEditorMarkup(config, activeGroupId, isExpanded) {
  const previewUrl = buildAvatarUrlFromConfig(config);
  const controlCard = isExpanded ? `
    <div class="avatar-control-card">
      <div class="avatar-tab-bar">${renderTabs(activeGroupId)}</div>
      ${renderOptions(config, activeGroupId)}
    </div>` : '';

  return `
    <div class="avatar-editor-shell">
      <div class="avatar-preview-row">
        <span class="avatar-circle"><img src="${previewUrl}" alt="Avatar" class="avatar-circle-image"></span>
        <div class="avatar-preview-actions">
          <button type="button" class="btn-neon btn-neon--ghost btn-sm" data-avatar-action="randomize">${icon.dice5(14)} 随机</button>
          <button type="button" class="btn-neon btn-neon--ghost btn-sm" data-avatar-action="reset">${icon.undo(14)} 重置</button>
          <button type="button" class="btn-neon btn-neon--ghost btn-sm" data-avatar-action="toggle-details">${isExpanded ? '收起' : icon.pencil(14) + ' 编辑'}</button>
        </div>
      </div>
      ${controlCard}
    </div>`;
}

export function createAvatarEditor(container, initialConfig) {
  let config = normalizeAvatarConfig(initialConfig || getDefaultAvatarConfig());
  let activeGroupId = getAvatarGroups()[0]?.groupId || '1';
  let isExpanded = false;

  function render() {
    container.innerHTML = renderEditorMarkup(config, activeGroupId, isExpanded);
  }

  function setConfig(nextConfig) {
    config = normalizeAvatarConfig(nextConfig || getDefaultAvatarConfig());
    render();
  }

  function getConfig() {
    return normalizeAvatarConfig(config);
  }

  function getPayload() {
    const normalized = normalizeAvatarConfig(config);
    return { avatar_config: normalized, avatar_url: buildAvatarUrlFromConfig(normalized) };
  }

  container.addEventListener('click', (event) => {
    const action = event.target.closest('[data-avatar-action]');
    if (action) {
      const a = action.dataset.avatarAction;
      if (a === 'randomize') config = randomizeAvatarConfig(config);
      else if (a === 'reset') config = getDefaultAvatarConfig();
      else if (a === 'toggle-details') isExpanded = !isExpanded;
      render();
      return;
    }
    const tab = event.target.closest('[data-avatar-tab]');
    if (tab) {
      activeGroupId = tab.dataset.avatarTab;
      isExpanded = true;
      render();
      return;
    }
    const color = event.target.closest('[data-avatar-color-field]');
    if (color) {
      config = normalizeAvatarConfig({
        ...config,
        colors: { ...config.colors, [color.dataset.avatarColorField]: color.dataset.avatarColorValue },
      });
      isExpanded = true;
      render();
      return;
    }
    const option = event.target.closest('[data-part-group][data-part-id]');
    if (option) {
      config = normalizeAvatarConfig({
        ...config,
        parts: { ...config.parts, [option.dataset.partGroup]: option.dataset.partId },
      });
      activeGroupId = option.dataset.partGroup;
      isExpanded = true;
      render();
    }
  });

  render();
  return { getConfig, getPayload, setConfig };
}

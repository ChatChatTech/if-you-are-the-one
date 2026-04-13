import metaDataJson from './data/MetaData.json';
import svgDataJson from './data/SvgData.json';

export const humationMetaData = metaDataJson;

const svgList = svgDataJson;

function extractSvgContent(fullSvg) {
  if (!fullSvg) return '';
  return fullSvg
    .replace(/<\?xml[^?]*\?>/gi, '')
    .replace(/<svg[^>]*>/gi, '')
    .replace(/<\/svg>/gi, '')
    .trim();
}

function buildSvgMap() {
  const map = {};
  let currentIndex = 0;
  for (const group of humationMetaData.partsGroups) {
    map[group.groupId] = {};
    for (const partId of group.parts) {
      if (currentIndex < svgList.length) {
        map[group.groupId][partId] = extractSvgContent(svgList[currentIndex]);
        currentIndex += 1;
      }
    }
  }
  return map;
}

export const humationSvgMap = buildSvgMap();

export function getHumationGroups() {
  return [...humationMetaData.partsGroups].sort((a, b) => a.groupOrder - b.groupOrder);
}

export function getDefaultHumationParts() {
  const defaultParts = {};
  humationMetaData.partsGroups.forEach((group) => {
    if (group.parts.length > 0) {
      defaultParts[group.groupId] = group.parts[0];
    }
  });
  return defaultParts;
}

export function getHumationPart(groupId, partId) {
  return humationSvgMap[groupId]?.[partId] || '';
}

export function getHumationGroupOffset(groupId) {
  const group = humationMetaData.partsGroups.find((item) => item.groupId === groupId);
  return group ? group.groupOffset : 0;
}

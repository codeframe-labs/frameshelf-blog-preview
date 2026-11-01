import {initialLayout, movePanel, dockPanelToSide, setRatio, getLayoutRects, isValidLayout} from './layout.mjs';
import {icon, hydrateIcons} from './icons.mjs';
import { mountBlogPreview, showPreviewState } from './blog.mjs';

const $ = selector => document.querySelector(selector);
const ids = ['video', 'transcript', 'writer'];
const names = {video: '영상', transcript: '대본', writer: '글쓰기'};
const board = $('#board');
const panels = Object.fromEntries(ids.map(id => [id, $(`#panel-${id}`)]));
const splitterNodes = new Map();
const currentKey = 'frameshelf-blog-preview:current-layout:v1';
const defaultKey = 'frameshelf-blog-preview:default-layout:v1';
let layout = structuredClone(initialLayout);
let hidden = [];
let geometry;
let interaction = null;
let moveSource = null;
let statusTimer;
let saveTimer;
let playing = false;
let elapsed = 118;
let muted = false;

function readLayout(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (!isValidLayout(value?.tree) || !Array.isArray(value.hidden)) return null;
    return {tree: value.tree, hidden: value.hidden.filter(id => id === 'transcript' || id === 'writer')};
  } catch { return null; }
}

function notify(message) {
  clearTimeout(statusTimer);
  $('#status').textContent = message;
  $('#status').hidden = false;
  statusTimer = setTimeout(() => { $('#status').hidden = true; }, 2600);
}

function persist(custom = true) {
  try { localStorage.setItem(currentKey, JSON.stringify({tree: layout, hidden})); }
  catch { notify('배치를 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.'); }
  parent.postMessage({type: 'frameshelf:changed', custom}, location.origin);
}

function place(element, rect) {
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

function render() {
  const mobile = board.clientWidth <= 760;
  if (mobile) {
    geometry = {panels: {}, splits: []};
    let y = 0;
    for (const id of ids) {
      if (hidden.includes(id)) continue;
      const height = id === 'video' ? 235 : id === 'transcript' ? 280 : Math.max(760, board.clientHeight);
      geometry.panels[id] = {x: 0, y, width: board.clientWidth, height};
      y += height + 7;
    }
  } else {
    geometry = getLayoutRects(layout, board.clientWidth, board.clientHeight, hidden);
  }
  for (const id of ids) {
    const rect = geometry.panels[id];
    panels[id].hidden = !rect;
    panels[id].toggleAttribute('data-top-edge', Boolean(rect && rect.y === 0));
    if (rect) place(panels[id], rect);
  }
  for (const id of ['transcript', 'writer']) {
    $(`#toggle-${id}`).classList.toggle('active', !hidden.includes(id));
    $(`#toggle-${id}`).setAttribute('aria-pressed', String(!hidden.includes(id)));
  }
  const activePaths = new Set();
  for (const split of geometry.splits) {
    const key = split.path.join('.') || 'root';
    activePaths.add(key);
    let element = splitterNodes.get(key);
    if (!element) {
      element = document.createElement('button');
      element.type = 'button';
      element.className = 'splitter';
      element.setAttribute('role', 'separator');
      element.setAttribute('aria-valuemin', '15');
      element.setAttribute('aria-valuemax', '85');
      $('#splitters').append(element);
      splitterNodes.set(key, element);
      element.addEventListener('pointerdown', event => startResize(event, element));
      element.addEventListener('keydown', event => {
        const data = element.split;
        const negative = data.axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
        const positive = data.axis === 'x' ? 'ArrowRight' : 'ArrowDown';
        if (event.key !== negative && event.key !== positive) return;
        event.preventDefault();
        layout = setRatio(layout, data.path, data.ratio + (event.key === positive ? .025 : -.025));
        render();
        persist();
      });
    }
    element.split = split;
    element.dataset.axis = split.axis;
    element.setAttribute('aria-orientation', split.axis === 'x' ? 'vertical' : 'horizontal');
    element.setAttribute('aria-label', split.axis === 'x' ? '좌우 패널 크기 조절' : '상하 패널 크기 조절');
    element.setAttribute('aria-valuenow', String(Math.round(split.ratio * 100)));
    place(element, split);
  }
  for (const [key, element] of splitterNodes) {
    if (!activePaths.has(key)) { element.remove(); splitterNodes.delete(key); }
  }
}

function preset(name, save = true) {
  layout = structuredClone(initialLayout);
  hidden = [];
  if (name === 'writer-left') {
    layout = {axis: 'x', ratio: .36, children: [{id: 'writer'}, {axis: 'y', ratio: .66, children: [{id: 'video'}, {id: 'transcript'}]}]};
  } else if (name === 'transcript-bottom') {
    layout = {axis: 'y', ratio: .7, children: [{axis: 'x', ratio: .62, children: [{id: 'video'}, {id: 'writer'}]}, {id: 'transcript'}]};
  } else if (name === 'current') {
    const value = readLayout(currentKey) || readLayout(defaultKey);
    if (value) { layout = value.tree; hidden = value.hidden; }
  }
  render();
  if (save) persist(false);
}

function togglePanel(id) {
  hidden = hidden.includes(id) ? hidden.filter(value => value !== id) : [...hidden, id];
  render();
  persist();
}

function startResize(event, element) {
  if (event.button !== 0 || interaction) return;
  event.preventDefault();
  interaction = {kind: 'resize', pointerId: event.pointerId, element, split: element.split, x: event.clientX, y: event.clientY, previous: layout};
  element.focus({preventScroll: true});
  element.setPointerCapture(event.pointerId);
  element.classList.add('resizing');
  document.body.classList.add('resizing');
}

function updateDrop(event) {
  const bounds = board.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top + board.scrollTop;
  interaction.drop = null;
  $('#drop-preview').hidden = true;
  const edgeWidth = Math.min(32, board.clientWidth * .06);
  const withinBoard = y >= 0 && y <= board.clientHeight && x >= 0 && x <= board.clientWidth;
  if (withinBoard && (x <= edgeWidth || x >= board.clientWidth - edgeWidth)) {
    const side = x <= edgeWidth ? 'left' : 'right';
    interaction.drop = {scope: 'workspace', side};
    const candidate = dockPanelToSide(layout, interaction.source, side);
    const preview = getLayoutRects(candidate, board.clientWidth, board.clientHeight, hidden);
    place($('#drop-preview'), preview.panels[interaction.source]);
    $('#drop-preview span').textContent = `${names[interaction.source]} · ${side === 'left' ? '왼쪽' : '오른쪽'} 전체 높이`;
    $('#drop-preview').hidden = false;
    return;
  }
  for (const [id, rect] of Object.entries(geometry.panels)) {
    if (id === interaction.source || x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) continue;
    const distances = {left: (x - rect.x) / rect.width, right: (rect.x + rect.width - x) / rect.width, top: (y - rect.y) / rect.height, bottom: (rect.y + rect.height - y) / rect.height};
    const nearest = Object.keys(distances).reduce((a, b) => distances[a] < distances[b] ? a : b);
    const edge = distances[nearest] < .27 ? nearest : 'center';
    interaction.drop = {id, edge};
    const target = {...rect};
    if (edge === 'left' || edge === 'right') { target.width /= 2; if (edge === 'right') target.x += target.width; }
    if (edge === 'top' || edge === 'bottom') { target.height /= 2; if (edge === 'bottom') target.y += target.height; }
    place($('#drop-preview'), target);
    const directions = {left: '왼쪽 분할', right: '오른쪽 분할', top: '위쪽 분할', bottom: '아래쪽 분할', center: '위치 교환'};
    $('#drop-preview span').textContent = `${names[interaction.source]} · ${directions[edge]}`;
    $('#drop-preview').hidden = false;
    break;
  }
}

for (const header of document.querySelectorAll('[data-drag]')) {
  header.addEventListener('pointerdown', event => {
    if (event.button !== 0 || interaction || event.target.closest('button,select,a')) return;
    event.preventDefault();
    interaction = {kind: 'move', source: header.dataset.drag, pointerId: event.pointerId, element: header, x: event.clientX, y: event.clientY, moving: false, previousFocus: document.activeElement};
    header.setPointerCapture(event.pointerId);
  });
}

document.addEventListener('pointermove', event => {
  if (!interaction || event.pointerId !== interaction.pointerId) return;
  if (interaction.kind === 'resize') {
    const {split} = interaction;
    const delta = split.axis === 'x' ? event.clientX - interaction.x : event.clientY - interaction.y;
    const length = split.axis === 'x' ? split.parent.width : split.parent.height;
    layout = setRatio(interaction.previous, split.path, split.ratio + delta / Math.max(1, length - 7));
    render();
    return;
  }
  if (!interaction.moving && Math.hypot(event.clientX - interaction.x, event.clientY - interaction.y) < 5) return;
  interaction.moving = true;
  document.body.classList.add('dragging');
  panels[interaction.source].dataset.moving = 'true';
  updateDrop(event);
});

function finishInteraction(cancelled = false) {
  if (!interaction) return;
  const active = interaction;
  interaction = null;
  if (active.element.hasPointerCapture(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
  document.body.classList.remove('dragging', 'resizing');
  active.element.classList.remove('resizing');
  $('#drop-preview').hidden = true;
  if (active.source) delete panels[active.source].dataset.moving;
  if (active.kind === 'resize') {
    if (cancelled) layout = active.previous;
    render();
    if (!cancelled) persist();
  } else if (!cancelled && active.drop) {
    layout = active.drop.scope === 'workspace'
      ? dockPanelToSide(layout, active.source, active.drop.side)
      : movePanel(layout, active.source, active.drop.id, active.drop.edge);
    render();
    persist();
    active.element.focus({preventScroll: true});
  } else if (cancelled && active.previousFocus instanceof HTMLElement) {
    active.previousFocus.focus({preventScroll: true});
  }
}
document.addEventListener('pointerup', () => finishInteraction());
document.addEventListener('pointercancel', () => finishInteraction(true));
addEventListener('blur', () => finishInteraction(true));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && interaction) { event.preventDefault(); event.stopPropagation(); finishInteraction(true); }
}, true);

document.querySelectorAll('[data-hide]').forEach(button => button.addEventListener('click', () => togglePanel(button.dataset.hide)));
$('#toggle-transcript').addEventListener('click', () => matchMedia('(max-width:760px)').matches ? panels.transcript.scrollIntoView({block:'start',behavior:'smooth'}) : togglePanel('transcript'));
$('#focus-video').addEventListener('click', () => panels.video.scrollIntoView({block:'start',behavior:'smooth'}));
$('#toggle-writer').addEventListener('click', () => matchMedia('(max-width:760px)').matches ? panels.writer.scrollIntoView({block:'start',behavior:'smooth'}) : togglePanel('writer'));

function updateMoveOptions() {
  const workspace = $('#move-target').value === 'workspace';
  for (const option of $('#move-edge').options) {
    option.disabled = workspace && !['left', 'right'].includes(option.value);
  }
  if ($('#move-edge').selectedOptions[0]?.disabled) $('#move-edge').value = 'left';
}
$('#move-target').addEventListener('change', updateMoveOptions);

document.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
  moveSource = button.dataset.move;
  $('#move-title').textContent = `${names[moveSource]} 패널 이동`;
  for (const option of $('#move-target').options) {
    option.disabled = option.value === moveSource || hidden.includes(option.value);
  }
  const target = [...$('#move-target').options].find(option => !option.disabled);
  if (!target) {
    notify('대본이나 글쓰기를 연 뒤 패널을 옮기세요.');
    return;
  }
  $('#move-target').value = target.value;
  $('#move-edge').value = 'left';
  updateMoveOptions();
  $('#move-dialog').returnValue = '';
  $('#move-dialog').showModal();
}));
$('#move-dialog').addEventListener('close', () => {
  if ($('#move-dialog').returnValue !== 'move' || !moveSource) return;
  layout = $('#move-target').value === 'workspace'
    ? dockPanelToSide(layout, moveSource, $('#move-edge').value)
    : movePanel(layout, moveSource, $('#move-target').value, $('#move-edge').value);
  render();
  persist();
  $(`[data-drag="${moveSource}"]`).focus({preventScroll: true});
});

function closeLayoutMenu() {
  $('#layout-popover').hidden = true;
  $('#layout-trigger').setAttribute('aria-expanded', 'false');
}
$('#layout-trigger').addEventListener('click', () => {
  const open = $('#layout-popover').hidden;
  $('#layout-popover').hidden = !open;
  $('#layout-trigger').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', event => {
  if (!event.target.closest('.layout-menu')) closeLayoutMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#layout-popover').hidden) {
    closeLayoutMenu();
    $('#layout-trigger').focus();
  }
});

$('#save-default').addEventListener('click', () => {
  try { localStorage.setItem(defaultKey, JSON.stringify({tree: layout, hidden})); notify('현재 위치와 분할을 기본 배치로 저장했습니다.'); }
  catch { notify('기본 배치를 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.'); }
  closeLayoutMenu();
});
$('#apply-default').addEventListener('click', () => {
  const value = readLayout(defaultKey);
  layout = value ? value.tree : structuredClone(initialLayout);
  hidden = value ? value.hidden : [];
  render();
  persist();
  closeLayoutMenu();
  notify(value ? '저장한 기본 배치를 적용했습니다.' : '처음 배치를 적용했습니다.');
});
addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent) return;
  if (event.data?.type === 'frameshelf:layout') preset(event.data.preset);
  if (event.data?.type === 'frameshelf:state') showPreviewState(event.data.state);
});

function formatTime(seconds) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function seekTo(seconds, scroll = false) {
  elapsed = Math.min(1199, Math.max(0, Number(seconds)));
  $('#elapsed').textContent = formatTime(elapsed);
  $('#seek').value = elapsed;
  const cues = [...document.querySelectorAll('.cue')];
  const current = cues.filter(cue => Number(cue.dataset.time) <= elapsed).at(-1) || cues[0];
  cues.forEach(cue => cue.classList.toggle('active', cue === current));
  if (scroll) current.scrollIntoView({block: 'center', behavior: 'instant'});
}
function togglePlayback() {
  playing = !playing;
  $('#play').innerHTML = icon(playing ? 'pause' : 'play');
  $('#play').setAttribute('aria-label', playing ? '일시정지' : '재생');
  $('#center-play').innerHTML = icon(playing ? 'pause' : 'play');
}
$('#play').addEventListener('click', togglePlayback);
$('#center-play').addEventListener('click', togglePlayback);
$('#back10').addEventListener('click', () => seekTo(elapsed - 10, true));
$('#forward10').addEventListener('click', () => seekTo(elapsed + 10, true));
$('#seek').addEventListener('input', event => seekTo(event.target.value));
document.querySelectorAll('.cue').forEach(cue => cue.addEventListener('click', () => seekTo(cue.dataset.time)));
$('#mute').addEventListener('click', () => { muted = !muted; $('#mute').innerHTML = icon(muted ? 'muted' : 'volume'); });
$('#captions').addEventListener('click', () => { $('.video-caption').hidden = !$('.video-caption').hidden; $('#captions').setAttribute('aria-pressed', String(!$('.video-caption').hidden)); });
$('#follow').addEventListener('click', () => { const on = $('#follow').getAttribute('aria-pressed') !== 'true'; $('#follow').setAttribute('aria-pressed', String(on)); $('#follow').classList.toggle('active', on); });
const playbackTimer = setInterval(() => { if (playing) seekTo(elapsed + parseFloat($('#speed').value)); }, 1000);

mountBlogPreview();
$('#fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#workspace').requestFullscreen(); }
  catch { notify('전체 미리보기에서 전체 화면을 열어 주세요.'); }
});
hydrateIcons();
preset(new URLSearchParams(location.search).get('layout') || 'current');
showPreviewState(new URLSearchParams(location.search).get('state') || 'writing');
seekTo(elapsed);
requestAnimationFrame(() => { const cue = $('.cue.active'); $('#transcript-scroll').scrollTop = Math.max(0, cue.offsetTop - 80); });
let headerIntroTimer = setTimeout(() => $('#workspace').removeAttribute('data-controls-intro'), 2500);
$('#workspace').addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch' && !matchMedia('(max-width:760px)').matches) return;
  clearTimeout(headerIntroTimer);
  $('#workspace').setAttribute('data-controls-intro','');
  headerIntroTimer = setTimeout(() => $('#workspace').removeAttribute('data-controls-intro'),2500);
},true);
board.addEventListener('scroll', () => {
  if (!matchMedia('(max-width:760px)').matches) return;
  for (const id of ids) {
    const rect = geometry?.panels[id];
    panels[id].toggleAttribute('data-top-edge', Boolean(rect && Math.abs(rect.y - board.scrollTop) < 3));
  }
},{passive:true});
const playbackControls = $('.video-controls');
let playbackBarHeight = -1;
const observer = new ResizeObserver(entries => {
  if (entries.some(entry => entry.target === board)) render();
  const controlsEntry = entries.find(entry => entry.target === playbackControls);
  if (!controlsEntry) return;
  const height = Math.ceil(controlsEntry.borderBoxSize?.[0]?.blockSize ?? playbackControls.offsetHeight);
  if (height === playbackBarHeight) return;
  playbackBarHeight = height;
  panels.video.style.setProperty('--playback-bar-height', `${height}px`);
});
observer.observe(board);
observer.observe(playbackControls);
addEventListener('pagehide', () => { observer.disconnect(); clearTimeout(headerIntroTimer); $('#workspace').removeAttribute('data-controls-intro'); clearInterval(playbackTimer); clearTimeout(saveTimer); clearTimeout(statusTimer); });

import { icon } from './icons.mjs';
import { createState, selectPost, updateDraft, newDraft, getCurrent, addTag, removeTag, listPosts, simulatedPublish, serializeState } from './model.mjs';

const $ = selector => document.querySelector(selector);
const storageKey = 'frameshelf-blog-preview:documents:v1';
let state;
try { state = createState(localStorage.getItem(storageKey)); }
catch { state = createState(); }
let tab = 'drafts';
let saveTimer;
let mounted = false;

function safeBody(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const output = document.createElement('div');
  const allowed = new Set(['p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code']);
  function append(nodes, parent) {
    for (const node of nodes) {
      if (node.nodeType === 3) parent.append(document.createTextNode(node.textContent));
      else if (node.nodeType === 1 && !['SCRIPT', 'STYLE', 'IFRAME', 'SVG', 'OBJECT', 'TEMPLATE'].includes(node.tagName)) {
        const tag = node.tagName.toLowerCase();
        const target = allowed.has(tag) ? document.createElement(tag) : parent;
        if (target !== parent) parent.append(target);
        append(node.childNodes, target);
      }
    }
  }
  append(template.content.childNodes, output);
  return output.innerHTML;
}

function status(text) {
  $('#draft-state').replaceChildren();
  $('#draft-state').append(document.createElement('i'), document.createTextNode(text));
}

function persist() {
  try { localStorage.setItem(storageKey, serializeState(state)); status('자동 저장됨'); }
  catch { status('저장 실패'); }
}

function capture() {
  clearTimeout(saveTimer);
  const current = getCurrent(state);
  const next = {
    ...current,
    title: $('#note-title').innerText.trim(),
    body: safeBody($('#note-body').innerHTML),
    category: $('#post-category').value,
  };
  if (next.title !== current.title || next.body !== current.body || next.category !== current.category) {
    updateDraft(state, next);
    persist();
  }
}

function renderTags() {
  const current = getCurrent(state);
  const container = $('#post-tags');
  container.replaceChildren();
  for (const tag of current.tags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.append(document.createTextNode(`#${tag}`));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `${tag} 태그 삭제`);
    remove.innerHTML = icon('close');
    remove.addEventListener('click', () => {
      capture();
      removeTag(getCurrent(state), tag);
      updateDraft(state, getCurrent(state));
      persist();
      renderTags();
    });
    chip.append(remove);
    container.append(chip);
  }
  const suggestions = [...new Set([...state.posts, ...state.drafts].flatMap(post => post.tags))];
  $('#tag-options').replaceChildren(...suggestions.map(tag => {
    const option = document.createElement('option');
    option.value = tag;
    return option;
  }));
  $('#tag-input').placeholder = current.tags.length ? '+ 태그 추가' : '태그 추가';
}

function renderEditor() {
  const current = getCurrent(state);
  $('#note-title').textContent = current.title;
  $('#note-body').innerHTML = safeBody(current.body);
  $('#post-category').value = current.category;
  const published = state.posts.some(post => post.id === current.id);
  $('#post-origin').textContent = published ? '기존 글 · 이어서 작성' : '새 글';
  $('#publish').firstChild.textContent = published ? '게시 갱신 ' : '게시 ';
  renderTags();
  status('자동 저장됨');
}

function dateLabel(value) {
  if (!value) return '방금';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '방금' : `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')}`;
}

function renderList() {
  const currentTag = $('#tag-filter').value;
  const tags = [...new Set([...state.posts, ...state.drafts].flatMap(post => post.tags))].sort((a,b) => a.localeCompare(b,'ko'));
  const options = [new Option('모든 태그', ''), ...tags.map(tag => new Option(`#${tag}`, tag))];
  $('#tag-filter').replaceChildren(...options);
  $('#tag-filter').value = tags.includes(currentTag) ? currentTag : '';
  $('#draft-count').textContent = listPosts(state, 'drafts').length;
  $('#published-count').textContent = state.posts.length;
  for (const button of document.querySelectorAll('[data-post-tab]')) {
    const active = button.dataset.postTab === tab;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  const results = $('#post-results');
  results.setAttribute('aria-labelledby', tab === 'drafts' ? 'draft-tab' : 'published-tab');
  results.replaceChildren();
  const posts = listPosts(state, tab, $('#post-search').value, $('#tag-filter').value);
  for (const post of posts) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'post-row';
    const symbol = document.createElement('span');
    symbol.className = 'post-symbol';
    symbol.innerHTML = icon(tab === 'drafts' ? 'edit' : 'transcript');
    const text = document.createElement('span');
    text.className = 'post-row-content';
    const title = document.createElement('strong');
    title.textContent = post.title || '제목 없는 글';
    const meta = document.createElement('span');
    meta.className = 'post-row-meta';
    meta.textContent = `${post.category} · ${dateLabel(post.updatedAt || post.publishedAt)}`;
    const tagLine = document.createElement('span');
    tagLine.className = 'post-row-tags';
    tagLine.textContent = post.tags.map(tag => `#${tag}`).join('  ');
    text.append(title, meta, tagLine);
    const arrow = document.createElement('span');
    arrow.className = 'post-row-arrow';
    arrow.innerHTML = icon('chevron');
    button.append(symbol, text, arrow);
    button.addEventListener('click', () => {
      capture();
      selectPost(state, post.id);
      renderEditor();
      persist();
      $('#post-picker').close();
      focusWriter();
    });
    results.append(button);
  }
  if (!posts.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-posts';
    empty.textContent = '조건에 맞는 글이 없습니다.';
    results.append(empty);
  }
}

function focusWriter() {
  if (matchMedia('(max-width:760px)').matches) $('#panel-writer').scrollIntoView({block:'start',behavior:'instant'});
}

function openPicker(nextTab = tab) {
  capture();
  tab = nextTab;
  $('#post-search').value = '';
  $('#tag-filter').value = '';
  renderList();
  if (!$('#post-picker').open) $('#post-picker').showModal();
}

export function showPreviewState(name) {
  if (!mounted) return;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  if (name === 'new') {
    capture();
    newDraft(state, `draft-${crypto.randomUUID()}`);
    renderEditor();
    persist();
    focusWriter();
  } else if (name === 'existing' || name === 'posts') openPicker('posts');
  else if (name === 'drafts') openPicker('drafts');
  else if (name === 'tags') {
    focusWriter();
    $('#tag-input').focus({preventScroll:false});
  } else focusWriter();
}

export function mountBlogPreview() {
  mounted = true;
  renderEditor();
  $('#select-post').addEventListener('click', () => openPicker());
  $('#close-picker').addEventListener('click', () => $('#post-picker').close());
  $('#create-post').addEventListener('click', () => { $('#post-picker').close(); showPreviewState('new'); });
  for (const button of document.querySelectorAll('[data-post-tab]')) {
    button.addEventListener('click', () => { tab = button.dataset.postTab; renderList(); });
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      tab = tab === 'drafts' ? 'posts' : 'drafts';
      renderList();
      document.querySelector(`[data-post-tab="${tab}"]`).focus();
    });
  }
  $('#post-search').addEventListener('input', renderList);
  $('#tag-filter').addEventListener('change', renderList);
  $('#tag-input').addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    capture();
    const current = getCurrent(state);
    if (!addTag(current, event.currentTarget.value)) return;
    updateDraft(state, current);
    event.currentTarget.value = '';
    renderTags();
    persist();
  });
  $('#tag-input').addEventListener('change', event => {
    capture();
    if (addTag(getCurrent(state), event.currentTarget.value)) {
      updateDraft(state, getCurrent(state));
      event.currentTarget.value = '';
      renderTags();
      persist();
    }
  });
  for (const editable of [$('#note-title'),$('#note-body')]) {
    editable.addEventListener('paste', event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || ''); });
    editable.addEventListener('input', () => { status('저장 중'); clearTimeout(saveTimer); saveTimer = setTimeout(capture,350); });
  }
  $('#post-category').addEventListener('change', capture);
  for (const button of document.querySelectorAll('[data-format]')) {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => { document.execCommand(button.dataset.format); capture(); });
  }
  $('#block-format').addEventListener('change', event => { $('#note-body').focus(); document.execCommand('formatBlock',false,event.target.value); capture(); });
  $('#publish').addEventListener('click', () => {
    capture();
    const current = getCurrent(state);
    $('#publication-title').textContent = current.title || '제목 없는 글';
    $('#publication-category').textContent = current.category;
    $('#publication-tags').textContent = current.tags.map(tag => `#${tag}`).join('  ');
    $('#publication-body').innerHTML = safeBody(current.body);
    $('#publish-dialog').showModal();
  });
  $('#close-publish').addEventListener('click', () => $('#publish-dialog').close());
  $('#simulate-publish').addEventListener('click', () => {
    simulatedPublish(state);
    persist();
    renderEditor();
    $('#publish-dialog').close();
    const toast = $('#status');
    toast.textContent = '게시 시연 완료 · 실제 블로그에 공개하지 않았습니다.';
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; },3000);
  });
  addEventListener('pagehide', () => { clearTimeout(saveTimer); capture(); });
}

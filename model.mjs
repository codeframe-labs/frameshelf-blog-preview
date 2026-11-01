export const seedPosts = [
  {
    id: 'post-motion',
    title: '자연스러운 움직임을 만드는 시간',
    body: '<p>같은 거리를 움직여도 속도의 변화에 따라 인상이 달라진다. 시작과 끝의 속도를 낮추자 카드의 이동이 부드러워졌다.</p><h2>오늘 확인한 차이</h2><p>위치보다 먼저 시간을 조절했다. 다음 실습에서는 이동 거리와 재생 시간을 함께 기록하려 한다.</p>',
    category: '모션 디자인',
    tags: ['모션', '키프레임', '이징'],
    publishedAt: '2026-10-29T09:00:00.000Z',
  },
  {
    id: 'post-grid',
    title: '그리드로 화면의 간격 정리하기',
    body: '<p>화면의 열을 먼저 정하니 카드 너비를 결정하기 쉬웠다. 카드 사이의 간격은 24px로 맞췄다.</p><h2>작은 화면에서 확인하기</h2><p>화면이 좁아질 때 열 수를 줄였다. 제목이 두 줄이 되어도 카드의 시작 위치는 같게 유지했다.</p>',
    category: '개발 노트',
    tags: ['CSS', '그리드', '레이아웃'],
    publishedAt: '2026-10-25T09:00:00.000Z',
  },
  {
    id: 'post-notes',
    title: '강의를 듣고 남기는 한 문장',
    body: '<p>강의를 마친 뒤 기억나는 내용을 한 문장으로 적었다. 설명이 길어지는 부분은 영상을 다시 보며 확인했다.</p><p>이번 기록에는 실습 결과와 다음에 시도할 내용을 함께 남겼다. 다음 학습은 이 기록에서 시작한다.</p>',
    category: '학습 기록',
    tags: ['학습', '기록'],
    publishedAt: '2026-10-21T09:00:00.000Z',
  },
  {
    id: 'post-web',
    title: '버튼의 상태를 살펴본 실습',
    body: '<p>버튼을 마우스와 키보드로 각각 조작했다. 키보드 초점이 있는 위치를 확인할 수 있어야 다음 동작을 선택하기 쉽다.</p><p>누를 수 없는 상태에서는 색과 조작 여부를 함께 확인했다. 화면의 모양과 실제 동작을 나란히 기록했다.</p>',
    category: '개발 노트',
    tags: ['웹', '접근성', 'UI'],
    publishedAt: '2026-10-17T09:00:00.000Z',
  },
];

export const seedDrafts = [
  {
    id: 'draft-motion',
    title: '키프레임과 움직임의 원리',
    body: '<p>키프레임은 움직임의 시작과 끝을 정한다. 두 지점 사이의 시간을 바꾸며 속도가 주는 인상을 비교했다.</p><h2>오늘의 실습</h2><p>카드를 오른쪽으로 이동한 뒤 이징을 적용했다. 시작과 끝의 속도를 낮추자 움직임이 부드러워졌다.</p><blockquote>위치가 같아도 시간을 나누는 방법에 따라 움직임은 달라진다.</blockquote><p>다음 실습에서는 같은 움직임을 세 가지 속도로 비교하려 한다.</p>',
    category: '학습 기록',
    tags: ['모션', '키프레임'],
    publishedAt: '',
    updatedAt: '2026-11-01T01:20:00.000Z',
    dirty: true,
  },
  {
    id: 'draft-grid',
    title: '간격을 일정하게 맞추는 연습',
    body: '<p>제목과 본문 사이의 간격을 기록했다. 다음에는 화면 너비를 바꾸며 같은 간격을 유지하는지 확인하려 한다.</p>',
    category: '개발 노트',
    tags: ['레이아웃', '실습'],
    publishedAt: '',
    updatedAt: '2026-10-31T05:30:00.000Z',
    dirty: true,
  },
];

export function normalizeTag(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
  return Array.from(normalized).slice(0, 30).join('');
}

function cloneArticle(article) {
  return {
    id: article.id,
    title: article.title,
    body: article.body,
    category: article.category,
    tags: article.tags.slice(),
    publishedAt: article.publishedAt || '',
    ...(typeof article.dirty === 'boolean' ? { dirty: article.dirty } : {}),
    ...(typeof article.updatedAt === 'string' ? { updatedAt: article.updatedAt } : {}),
  };
}

function validArticle(article) {
  return article && typeof article === 'object'
    && typeof article.id === 'string' && article.id.length > 0
    && typeof article.title === 'string' && typeof article.body === 'string'
    && typeof article.category === 'string' && Array.isArray(article.tags)
    && article.tags.every(tag => typeof tag === 'string')
    && (article.publishedAt === undefined || typeof article.publishedAt === 'string');
}

export function createState(saved) {
  let source = saved;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  const valid = source && Array.isArray(source.posts) && Array.isArray(source.drafts)
    && source.posts.every(validArticle) && source.drafts.every(validArticle);
  const state = {
    posts: (valid ? source.posts : seedPosts).map(cloneArticle),
    drafts: (valid ? source.drafts : seedDrafts).map(cloneArticle),
    selectedId: valid && typeof source.selectedId === 'string' ? source.selectedId : 'draft-motion',
  };
  if (!state.drafts.some(draft => draft.id === state.selectedId)) {
    const selectedPost = state.posts.find(post => post.id === state.selectedId);
    if (selectedPost) selectPost(state, selectedPost.id);
    else if (state.drafts.length) state.selectedId = state.drafts[0].id;
    else newDraft(state, 'draft-new');
  }
  return state;
}

export function getCurrent(state) {
  return state.drafts.find(draft => draft.id === state.selectedId) || null;
}

export function selectPost(state, id) {
  let draft = state.drafts.find(item => item.id === id);
  if (!draft) {
    const post = state.posts.find(item => item.id === id);
    if (!post) return null;
    draft = { ...cloneArticle(post), dirty: false };
    state.drafts.push(draft);
  }
  state.selectedId = id;
  return draft;
}

export function updateDraft(state, draft) {
  if (!validArticle(draft)) return null;
  const next = { ...cloneArticle(draft), dirty: true, updatedAt: new Date().toISOString() };
  const index = state.drafts.findIndex(item => item.id === next.id);
  if (index < 0) state.drafts.unshift(next);
  else state.drafts[index] = next;
  state.selectedId = next.id;
  return next;
}

export function newDraft(state, id = `draft-${crypto.randomUUID()}`) {
  const existing = state.drafts.find(draft => draft.id === id);
  if (existing) return selectPost(state, id);
  const draft = {
    id,
    title: '키프레임과 움직임의 원리',
    body: '<p><br></p>',
    category: '학습 기록',
    tags: [],
    publishedAt: '',
  };
  return updateDraft(state, draft);
}

export function addTag(draft, value) {
  const tag = normalizeTag(value);
  if (!tag || draft.tags.length >= 8) return false;
  if (draft.tags.some(item => item.toLowerCase() === tag.toLowerCase())) return false;
  draft.tags.push(tag);
  return true;
}

export function removeTag(draft, tag) {
  const normalized = normalizeTag(tag).toLowerCase();
  draft.tags = draft.tags.filter(item => item.toLowerCase() !== normalized);
}

export function listPosts(state, tab, query = '', tag = '') {
  const articles = tab === 'drafts' ? state.drafts.filter(draft => draft.dirty !== false) : state.posts;
  const search = String(query).trim().toLowerCase();
  const tagFilter = normalizeTag(tag).toLowerCase();
  return articles.filter(article => {
    const matchesQuery = !search || `${article.title} ${article.tags.join(' ')}`.toLowerCase().includes(search);
    const matchesTag = !tagFilter || article.tags.some(item => item.toLowerCase() === tagFilter);
    return matchesQuery && matchesTag;
  });
}

export function simulatedPublish(state) {
  const draft = getCurrent(state);
  if (!draft) return null;
  const publishedAt = new Date().toISOString();
  const published = cloneArticle({ ...draft, publishedAt });
  delete published.dirty;
  const index = state.posts.findIndex(post => post.id === draft.id);
  if (index < 0) state.posts.unshift(published);
  else state.posts[index] = published;
  draft.publishedAt = publishedAt;
  draft.updatedAt = publishedAt;
  draft.dirty = false;
  return published;
}

export function serializeState(state) {
  return JSON.stringify({
    posts: state.posts.map(cloneArticle),
    drafts: state.drafts.map(cloneArticle),
    selectedId: state.selectedId,
  });
}

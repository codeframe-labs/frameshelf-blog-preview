import assert from 'node:assert/strict';

let model;
try {
  model = await import('./model.mjs');
} catch (error) {
  assert.fail(`State module must load: ${error.code || error.message}`);
}

const {
  seedPosts, seedDrafts, createState, selectPost, updateDraft, newDraft,
  getCurrent, normalizeTag, addTag, removeTag, listPosts, simulatedPublish,
  serializeState,
} = model;

const state = createState();
assert.equal(state.posts.length, 4, 'Seed published articles must be available');
assert.equal(state.drafts.length, 2, 'Seed drafts must be available');
assert.equal(getCurrent(state).id, 'draft-motion', 'Initial lecture draft must be selected');
assert.ok(state.posts !== seedPosts, 'State must own its published array');
assert.ok(state.drafts !== seedDrafts, 'State must own its draft array');

const publishedTitle = state.posts[0].title;
const publishedTag = state.posts[0].tags[0];
const draft = selectPost(state, state.posts[0].id);
draft.title = '수정한 글';
draft.tags[0] = '수정한 태그';
assert.equal(state.posts[0].title, publishedTitle, 'Editing a published article must preserve published title');
assert.equal(state.posts[0].tags[0], publishedTag, 'Editing tags must preserve published tags');
updateDraft(state, draft);
assert.equal(getCurrent(state).dirty, true, 'Saving edits must mark a draft as pending');
assert.ok(Number.isFinite(Date.parse(getCurrent(state).updatedAt)), 'Saving must record a valid timestamp');

assert.equal(normalizeTag('  ##  Motion   Design  '), 'Motion Design', 'Tag whitespace and leading hashes must normalize');
assert.equal(normalizeTag('가'.repeat(31)).length, 30, 'Tag length must be bounded');
const fresh = newDraft(state, 'draft-check');
assert.equal(fresh.category, '학습 기록', 'New drafts must use the default category');
assert.equal(addTag(fresh, '  #React  '), true, 'Adding a normalized tag must succeed');
assert.equal(addTag(fresh, 'react'), false, 'Case variants must not duplicate tags');
assert.equal(addTag(fresh, '   '), false, 'Empty tags must be rejected');
for (let index = 0; index < 7; index += 1) addTag(fresh, `tag-${index}`);
assert.equal(addTag(fresh, 'overflow'), false, 'Drafts must reject a ninth tag');
removeTag(fresh, 'REACT');
assert.equal(fresh.tags.length, 7, 'Removal must use the same case-insensitive contract');
fresh.title = '태그 검색 예시';
fresh.body = '<p>본문 예시</p>';
updateDraft(state, fresh);
assert.equal(listPosts(state, 'drafts', '검색', 'tag-0').length, 1, 'Title query and exact tag must combine');
assert.equal(listPosts(state, 'drafts', '', 'tag').length, 0, 'Tag filters must match a whole tag');
assert.equal(listPosts(state, 'posts', '수정한 글', '').length, 0, 'Published search must exclude unsaved edits');

const published = simulatedPublish(state);
assert.equal(published.id, 'draft-check', 'Mock publication must keep a stable article id');
assert.equal(state.posts.length, 5, 'A new publication must add one article');
assert.equal(getCurrent(state).dirty, false, 'Published drafts must remain editable without a pending marker');
assert.equal(listPosts(state, 'drafts', '태그 검색 예시', '').length, 0, 'Pending lists must exclude published drafts');
simulatedPublish(state);
assert.equal(state.posts.length, 5, 'Publishing the same draft twice must update instead of duplicate');
getCurrent(state).body = '<p>다음 수정</p>';
assert.equal(published.body, '<p>본문 예시</p>', 'Published articles must not share editable objects');

const restored = createState(serializeState(state));
assert.equal(restored.selectedId, 'draft-check', 'Restore must retain selection');
assert.equal(getCurrent(restored).body, '<p>다음 수정</p>', 'Restore must retain draft content');
restored.posts[0].tags.push('복원');
assert.equal(state.posts[0].tags.includes('복원'), false, 'Restored tags must not share arrays');
assert.equal(createState('{bad json').posts.length, 4, 'Broken storage must fall back to examples');
assert.equal(createState({ posts: null, drafts: [] }).posts.length, 4, 'Invalid stored shapes must fall back safely');
assert.equal(selectPost(state, 'missing'), null, 'Unknown selection must fail without creating a draft');

console.log('model.check: passed');

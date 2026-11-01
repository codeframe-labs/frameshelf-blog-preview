const panel = document.querySelector('#review-panel');
const toggle = document.querySelector('#review-toggle');
const frame = document.querySelector('#preview-frame');
const narrow = matchMedia('(max-width:900px)');
let selected = new URLSearchParams(location.search).get('state') || 'writing';
const states = new Set(['writing','new','existing','tags','drafts','posts']);
if (!states.has(selected)) selected = 'writing';
frame.src = `workspace.html?state=${selected}`;
function setOpen(open) {
  panel.dataset.open = String(open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? '시안 조작 닫기' : '시안 조작 열기');
  panel.inert = narrow.matches && !open;
}
function select(name) {
  selected = name;
  document.querySelectorAll('[data-state]').forEach(button => {
    if (button.dataset.state === name) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  document.querySelector('#full-preview').href = `workspace.html?state=${name}`;
  history.replaceState(null,'',`?state=${name}`);
}
for (const button of document.querySelectorAll('[data-state]')) button.addEventListener('click', () => {
  select(button.dataset.state);
  frame.contentWindow.postMessage({type:'frameshelf:state',state:selected},location.origin);
  if (narrow.matches) { setOpen(false); toggle.focus(); }
});
toggle.addEventListener('click', () => setOpen(panel.dataset.open !== 'true'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && panel.dataset.open === 'true') { setOpen(false); toggle.focus(); }
});
narrow.addEventListener('change', () => setOpen(false));
select(selected);
setOpen(false);

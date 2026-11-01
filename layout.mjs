const panelIds = ['video', 'transcript', 'writer'];
const minimumRatio = .15;
const maximumRatio = .85;
const gap = 7;

export const initialLayout = {
  axis: 'x',
  ratio: .62,
  children: [
    {id: 'video'},
    {
      axis: 'y',
      ratio: .44,
      children: [{id: 'transcript'}, {id: 'writer'}],
    },
  ],
};

export function isValidLayout(tree) {
  const pending = [tree];
  const visited = new Set();
  const leaves = new Set();

  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object' || visited.has(node)) return false;
    visited.add(node);
    if (visited.size > 5) return false;

    if (Object.hasOwn(node, 'id')) {
      if (!panelIds.includes(node.id) || leaves.has(node.id) || node.children) return false;
      leaves.add(node.id);
      continue;
    }

    if (!['x', 'y'].includes(node.axis)
      || !Number.isFinite(node.ratio)
      || node.ratio < minimumRatio
      || node.ratio > maximumRatio
      || !Array.isArray(node.children)
      || node.children.length !== 2) return false;
    pending.push(...node.children);
  }

  return leaves.size === panelIds.length;
}

// Returning null removes a leaf and collapses its former split.
function transformLeaves(node, transform) {
  if (node.id) return transform(node);
  const first = transformLeaves(node.children[0], transform);
  const second = transformLeaves(node.children[1], transform);
  if (!first) return second;
  if (!second) return first;
  if (first === node.children[0] && second === node.children[1]) return node;
  return {...node, children: [first, second]};
}

export function movePanel(tree, sourceId, targetId, edge) {
  if (!isValidLayout(tree)
    || sourceId === targetId
    || !panelIds.includes(sourceId)
    || !panelIds.includes(targetId)
    || !['left', 'right', 'top', 'bottom', 'center'].includes(edge)) return tree;

  if (edge === 'center') {
    return transformLeaves(tree, leaf => {
      if (leaf.id === sourceId) return {id: targetId};
      if (leaf.id === targetId) return {id: sourceId};
      return leaf;
    });
  }

  const remaining = transformLeaves(tree, leaf => leaf.id === sourceId ? null : leaf);
  return transformLeaves(remaining, leaf => {
    if (leaf.id !== targetId) return leaf;
    const source = {id: sourceId};
    const sourceFirst = edge === 'left' || edge === 'top';
    return {
      axis: edge === 'left' || edge === 'right' ? 'x' : 'y',
      ratio: .5,
      children: sourceFirst ? [source, leaf] : [leaf, source],
    };
  });
}

export function dockPanelToSide(tree, sourceId, side) {
  if (!isValidLayout(tree)
    || !panelIds.includes(sourceId)
    || !['left', 'right'].includes(side)) return tree;

  const remaining = transformLeaves(tree, leaf => leaf.id === sourceId ? null : leaf);
  const source = {id: sourceId};
  return {
    axis: 'x',
    ratio: .5,
    children: side === 'left' ? [source, remaining] : [remaining, source],
  };
}

export function setRatio(tree, path, ratio) {
  if (!isValidLayout(tree)
    || !Array.isArray(path)
    || path.length > 2
    || Array.from(path).some(index => index !== 0 && index !== 1)
    || !Number.isFinite(ratio)) return tree;

  const boundedRatio = Math.max(minimumRatio, Math.min(maximumRatio, ratio));
  function resize(node, depth) {
    if (node.id) return node;
    if (depth === path.length) {
      return node.ratio === boundedRatio ? node : {...node, ratio: boundedRatio};
    }
    const index = path[depth];
    const child = resize(node.children[index], depth + 1);
    if (child === node.children[index]) return node;
    const children = [...node.children];
    children[index] = child;
    return {...node, children};
  }
  return resize(tree, 0);
}

export function getLayoutRects(tree, width, height, hiddenIds = []) {
  const result = {panels: {}, splits: []};
  if (!isValidLayout(tree)
    || !Number.isFinite(width) || width < 0
    || !Number.isFinite(height) || height < 0) return result;

  const hidden = new Set(Array.isArray(hiddenIds) ? hiddenIds : []);
  const visibleCounts = new Map();
  function countVisible(node) {
    const count = node.id
      ? Number(!hidden.has(node.id))
      : countVisible(node.children[0]) + countVisible(node.children[1]);
    visibleCounts.set(node, count);
    return count;
  }
  countVisible(tree);

  function place(node, bounds, path) {
    if (!visibleCounts.get(node)) return;
    if (node.id) {
      result.panels[node.id] = bounds;
      return;
    }

    const [first, second] = node.children;
    if (!visibleCounts.get(first)) return place(second, bounds, [...path, 1]);
    if (!visibleCounts.get(second)) return place(first, bounds, [...path, 0]);

    const horizontal = node.axis === 'x';
    const dimension = horizontal ? bounds.width : bounds.height;
    const dividerSize = Math.min(gap, dimension);
    const available = dimension - dividerSize;
    const firstSize = available * node.ratio;
    const secondSize = available - firstSize;
    const firstBounds = {...bounds};
    const secondBounds = {...bounds};
    const divider = {...bounds};

    if (horizontal) {
      firstBounds.width = firstSize;
      secondBounds.x += firstSize + dividerSize;
      secondBounds.width = secondSize;
      divider.x += firstSize;
      divider.width = dividerSize;
    } else {
      firstBounds.height = firstSize;
      secondBounds.y += firstSize + dividerSize;
      secondBounds.height = secondSize;
      divider.y += firstSize;
      divider.height = dividerSize;
    }

    result.splits.push({path, axis: node.axis, ratio: node.ratio, ...divider, parent: {...bounds}});
    place(first, firstBounds, [...path, 0]);
    place(second, secondBounds, [...path, 1]);
  }
  place(tree, {x: 0, y: 0, width, height}, []);
  return result;
}

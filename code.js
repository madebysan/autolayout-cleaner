// AutoLayout Cleaner — Figma Plugin
// Scans for redundant wrapper frames in autolayout hierarchies and flattens them.
// A wrapper is redundant if it adds no visual properties, no padding, and
// (for multi-child wrappers) matches the parent's layout direction, gap, and wrap.

figma.showUI(__html__, { width: 320, height: 420, themeColors: true });

// ============================================================================
// REDUNDANCY CHECK
// ============================================================================

// Returns true if a paint array has at least one visible paint
function hasVisiblePaints(paints) {
  if (!paints || paints === figma.mixed) return false;
  for (var i = 0; i < paints.length; i++) {
    if (paints[i].visible !== false) return true;
  }
  return false;
}

// Returns true if an effects array has at least one visible effect
function hasVisibleEffects(effects) {
  if (!effects) return false;
  for (var i = 0; i < effects.length; i++) {
    if (effects[i].visible !== false) return true;
  }
  return false;
}

// Returns true if the node has any corner radius > 0
function hasCornerRadius(node) {
  if (node.cornerRadius !== undefined && node.cornerRadius !== figma.mixed && node.cornerRadius > 0) {
    return true;
  }
  // Check individual corners when mixed
  if (node.cornerRadius === figma.mixed) {
    if ((node.topLeftRadius || 0) > 0) return true;
    if ((node.topRightRadius || 0) > 0) return true;
    if ((node.bottomLeftRadius || 0) > 0) return true;
    if ((node.bottomRightRadius || 0) > 0) return true;
  }
  return false;
}

// Returns true if the frame has any padding > 0
function hasPadding(node) {
  return (node.paddingTop || 0) > 0 ||
         (node.paddingRight || 0) > 0 ||
         (node.paddingBottom || 0) > 0 ||
         (node.paddingLeft || 0) > 0;
}

// Core check: is this frame a redundant wrapper?
function isRedundant(frame, parent) {
  // Only FRAME nodes can be redundant wrappers
  if (frame.type !== 'FRAME') return false;

  // Parent must allow structural changes (insertChild/remove)
  // INSTANCE: read-only hierarchy, can't reparent children
  // COMPONENT_SET: children must be COMPONENTs, not FRAMEs
  // FRAME and COMPONENT parents are fine — we can rearrange their children
  if (parent.type === 'INSTANCE' || parent.type === 'COMPONENT_SET') return false;

  // Both must have autolayout
  if (!frame.layoutMode || frame.layoutMode === 'NONE') return false;
  if (!parent.layoutMode || parent.layoutMode === 'NONE') return false;

  // Must have at least 1 child (empty frames aren't "wrappers")
  if (!frame.children || frame.children.length === 0) return false;

  // No visible fills, strokes, effects
  if (hasVisiblePaints(frame.fills)) return false;
  if (hasVisiblePaints(frame.strokes)) return false;
  if (hasVisibleEffects(frame.effects)) return false;

  // No corner radius
  if (hasCornerRadius(frame)) return false;

  // No padding
  if (hasPadding(frame)) return false;

  // Clipping: skip if frame clips but parent doesn't
  if (frame.clipsContent && !parent.clipsContent) return false;

  // Opacity and blend mode must be default
  if (frame.opacity !== 1) return false;
  var blend = frame.blendMode || 'PASS_THROUGH';
  if (blend !== 'NORMAL' && blend !== 'PASS_THROUGH') return false;

  // Min/max constraints mean the wrapper is providing sizing boundaries
  if (frame.minWidth && frame.minWidth > 0) return false;
  if (frame.maxWidth && frame.maxWidth < Infinity) return false;
  if (frame.minHeight && frame.minHeight > 0) return false;
  if (frame.maxHeight && frame.maxHeight < Infinity) return false;

  // ---- SINGLE CHILD ----
  // With one child, direction is irrelevant (nothing to arrange H or V).
  // Alignment is compared in PHYSICAL terms (horizontal/vertical) since
  // wrapper and parent may have different directions (swapping axes).
  // If the wrapper HUGs on an axis, alignment on that axis is meaningless —
  // you can't center something in a container that exactly matches its size.
  if (frame.children.length === 1) {
    var fIsVert = frame.layoutMode === 'VERTICAL';
    var pIsVert = parent.layoutMode === 'VERTICAL';
    var fPrimary = frame.primaryAxisAlignItems || 'MIN';
    var fCounter = frame.counterAxisAlignItems || 'MIN';
    var pPrimary = parent.primaryAxisAlignItems || 'MIN';
    var pCounter = parent.counterAxisAlignItems || 'MIN';

    // SPACE_BETWEEN degrades to MIN with a single child
    if (fPrimary === 'SPACE_BETWEEN') fPrimary = 'MIN';
    if (fCounter === 'SPACE_BETWEEN') fCounter = 'MIN';
    if (pPrimary === 'SPACE_BETWEEN') pPrimary = 'MIN';
    if (pCounter === 'SPACE_BETWEEN') pCounter = 'MIN';

    // Convert to physical alignment (horizontal, vertical)
    var wrapHoriz = fIsVert ? fCounter : fPrimary;
    var wrapVert  = fIsVert ? fPrimary : fCounter;
    var parHoriz  = pIsVert ? pCounter : pPrimary;
    var parVert   = pIsVert ? pPrimary : pCounter;

    // Skip alignment check on axes where wrapper hugs (no room to position)
    var hugsH = frame.layoutSizingHorizontal === 'HUG';
    var hugsV = frame.layoutSizingVertical === 'HUG';

    if (!hugsH && wrapHoriz !== parHoriz) return false;
    if (!hugsV && wrapVert !== parVert) return false;

    return true;
  }

  // ---- MULTIPLE CHILDREN ----
  // Only redundant if parent has matching layout properties
  var primaryAlign = frame.primaryAxisAlignItems || 'MIN';
  var counterAlign = frame.counterAxisAlignItems || 'MIN';
  var parentPrimaryAlign = parent.primaryAxisAlignItems || 'MIN';
  var parentCounterAlign = parent.counterAxisAlignItems || 'MIN';

  if (frame.layoutMode !== parent.layoutMode) return false;
  if (frame.itemSpacing !== parent.itemSpacing) return false;

  // Check wrap mode (may not exist on older API versions)
  var frameWrap = frame.layoutWrap || 'NO_WRAP';
  var parentWrap = parent.layoutWrap || 'NO_WRAP';
  if (frameWrap !== parentWrap) return false;

  // Alignment must also match for multi-child
  if (primaryAlign !== parentPrimaryAlign) return false;
  if (counterAlign !== parentCounterAlign) return false;

  return true;
}

// ============================================================================
// TREE TRAVERSAL — Bottom-up (post-order DFS)
// ============================================================================

function getDepth(node) {
  var depth = 0;
  var current = node;
  while (current.parent) {
    depth++;
    current = current.parent;
  }
  return depth;
}

async function scanTree(node, results, scannedIds) {
  // When we hit an INSTANCE, we can't reparent inside it directly —
  // but we CAN follow it to its main component and clean that instead.
  // All instances auto-update when the source component changes.
  if (node.type === 'INSTANCE') {
    try {
      var mainComp = await node.getMainComponentAsync();
      if (mainComp && !scannedIds[mainComp.id]) {
        scannedIds[mainComp.id] = true;
        await scanTree(mainComp, results, scannedIds);
      }
    } catch (e) {
      // Main component not accessible (remote library, deleted, etc.) — skip
    }
    return;
  }

  // Recurse into children first (bottom-up)
  // We recurse into COMPONENT and COMPONENT_SET — their internal
  // frames can be cleaned since we can modify a component's structure
  if (node.children) {
    var kids = [];
    for (var i = 0; i < node.children.length; i++) {
      kids.push(node.children[i]);
    }
    for (var j = 0; j < kids.length; j++) {
      await scanTree(kids[j], results, scannedIds);
    }
  }

  // Now check this node
  if (node.type === 'FRAME' && node.parent) {
    if (isRedundant(node, node.parent)) {
      results.push({
        id: node.id,
        name: node.name,
        parentName: node.parent.name,
        childCount: node.children.length,
        depth: getDepth(node)
      });
    }
  }
}

// ============================================================================
// FLATTEN EXECUTION
// ============================================================================

var lastScanResults = [];
var lastScanRootIds = [];

// Count all layers (nodes) in a subtree
function countLayers(node) {
  var count = 1; // the node itself
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) {
      count += countLayers(node.children[i]);
    }
  }
  return count;
}

// Count total layers across stored roots
async function countAllLayers(rootIds) {
  var total = 0;
  for (var i = 0; i < rootIds.length; i++) {
    var node = await figma.getNodeByIdAsync(rootIds[i]);
    if (node) total += countLayers(node);
  }
  return total;
}

async function flatten(scanResults) {
  // Sort by depth descending so we process deepest wrappers first
  scanResults.sort(function(a, b) { return b.depth - a.depth; });

  var removed = 0;
  var reparented = 0;

  for (var i = 0; i < scanResults.length; i++) {
    var entry = scanResults[i];

    // Re-fetch node — it may have been removed if its parent was also redundant
    var node = await figma.getNodeByIdAsync(entry.id);
    if (!node) continue;
    if (!node.parent) continue;

    var parent = node.parent;

    // Find the wrapper's index in the parent's children
    var insertIndex = -1;
    for (var k = 0; k < parent.children.length; k++) {
      if (parent.children[k].id === node.id) {
        insertIndex = k;
        break;
      }
    }
    if (insertIndex === -1) continue;

    // Collect children before reparenting (array will change as we move them)
    var children = [];
    for (var c = 0; c < node.children.length; c++) {
      children.push(node.children[c]);
    }

    // Capture the wrapper's sizing — this is its role in the grandparent's layout
    var wrapperHSizing = node.layoutSizingHorizontal;
    var wrapperVSizing = node.layoutSizingVertical;
    var isSingleChild = children.length === 1;

    // Reparent each child to the grandparent at the correct position
    // Wrapped in try-catch: if the node is inside a remote component we
    // followed during scan, insertChild/remove will throw
    try {
      for (var m = 0; m < children.length; m++) {
        var child = children[m];

        // Single child: inherit the wrapper's sizing (child is taking the wrapper's
        // place in the grandparent, so it needs the wrapper's sizing role)
        // Multi child: keep own sizing (layout context is equivalent — same direction,
        // gap, wrap, and alignment were verified in isRedundant)
        var hSizing = isSingleChild ? wrapperHSizing : child.layoutSizingHorizontal;
        var vSizing = isSingleChild ? wrapperVSizing : child.layoutSizingVertical;

        parent.insertChild(insertIndex + m, child);

        // Apply sizing after reparent (Figma may reset it)
        if (hSizing) child.layoutSizingHorizontal = hSizing;
        if (vSizing) child.layoutSizingVertical = vSizing;

        reparented++;
      }

      // Delete the now-empty wrapper
      node.remove();
      removed++;
    } catch (e) {
      // Node is in a read-only context (remote library component) — skip
    }
  }

  return { removed: removed, reparented: reparented };
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

figma.ui.onmessage = async function(msg) {

  // SCAN
  if (msg.type === 'SCAN') {
    var roots = [];

    if (msg.scope === 'page') {
      // Scan entire current page
      var pageChildren = figma.currentPage.children;
      for (var i = 0; i < pageChildren.length; i++) {
        roots.push(pageChildren[i]);
      }
    } else {
      // Scan selection
      var selection = figma.currentPage.selection;
      if (!selection || selection.length === 0) {
        figma.ui.postMessage({ type: 'SCAN_ERROR', error: 'no-selection' });
        return;
      }
      for (var j = 0; j < selection.length; j++) {
        roots.push(selection[j]);
      }
    }

    // Check if any roots have autolayout
    var hasAutolayout = false;
    for (var r = 0; r < roots.length; r++) {
      if (roots[r].layoutMode && roots[r].layoutMode !== 'NONE') {
        hasAutolayout = true;
        break;
      }
      // Also check children
      if (roots[r].children) {
        for (var ch = 0; ch < roots[r].children.length; ch++) {
          if (roots[r].children[ch].layoutMode && roots[r].children[ch].layoutMode !== 'NONE') {
            hasAutolayout = true;
            break;
          }
        }
        if (hasAutolayout) break;
      }
    }

    var results = [];
    var scannedIds = {};
    for (var s = 0; s < roots.length; s++) {
      await scanTree(roots[s], results, scannedIds);
    }

    lastScanResults = results;

    // Store root IDs for layer counting during clean
    lastScanRootIds = [];
    for (var ri = 0; ri < roots.length; ri++) {
      lastScanRootIds.push(roots[ri].id);
    }

    figma.ui.postMessage({
      type: 'SCAN_RESULTS',
      results: results,
      hasAutolayout: hasAutolayout
    });
  }

  // CLEAN
  else if (msg.type === 'CLEAN') {
    if (lastScanResults.length === 0) {
      figma.ui.postMessage({ type: 'CLEAN_DONE', removed: 0, reparented: 0, layersBefore: 0, layersAfter: 0 });
      return;
    }

    var layersBefore = await countAllLayers(lastScanRootIds);

    var outcome = await flatten(lastScanResults);
    lastScanResults = [];

    var layersAfter = await countAllLayers(lastScanRootIds);

    figma.ui.postMessage({
      type: 'CLEAN_DONE',
      removed: outcome.removed,
      reparented: outcome.reparented,
      layersBefore: layersBefore,
      layersAfter: layersAfter
    });
  }
};

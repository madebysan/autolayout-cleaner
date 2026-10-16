# What counts as redundant

The full rule set Auto Layout Cleaner uses. The short version is the [README](../README.md).

A frame is flagged for removal when **all** of these are true:

- Type is `FRAME` (never touches instances, components, or component sets)
- Parent is also not an instance/component/component set
- Both the frame and its parent have auto layout enabled
- No visible fills, strokes, effects, or corner radius
- No padding on any side
- No clipping that the parent doesn't already have
- Opacity is 1, blend mode is normal/pass-through
- Has at least 1 child
- Visible, not absolutely positioned, and none of its children are absolutely positioned
- No prototype interactions or export settings
- **Single child:** a fixed-size wrapper only counts when the child already matches its size
- **Multiple children:** only redundant if the parent has the same layout direction, gap, wrap mode (and row gap when wrapping) and alignment, and the wrapper hugs its children along the parent's main axis

export interface SelectionRectangle {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface SelectionCommentPosition {
  left: number;
  top: number;
}

export function getSelectionAnchorRect(rectangles: readonly SelectionRectangle[]): SelectionRectangle | null {
  for (let index = rectangles.length - 1; index >= 0; index -= 1) {
    const rectangle = rectangles[index];
    if (rectangle && (rectangle.width > 0 || rectangle.height > 0)) return rectangle;
  }
  return null;
}

export function positionSelectionCommentButton(
  anchor: SelectionRectangle,
  surface: SelectionRectangle,
  viewport: SelectionRectangle,
  controlWidth = 30,
  gap = 7,
  controlHeight = 30,
): SelectionCommentPosition | null {
  if (anchor.width <= 0 && anchor.height <= 0) return null;

  const visibleLeft = Math.max(surface.left, viewport.left);
  const visibleRight = Math.min(surface.right, viewport.right);
  const visibleTop = Math.max(surface.top, viewport.top);
  const visibleBottom = Math.min(surface.bottom, viewport.bottom);
  if (visibleRight - visibleLeft < controlWidth + 8 || visibleBottom - visibleTop < controlHeight + 8) return null;

  const anchorIsVisible = anchor.right > visibleLeft
    && anchor.left < visibleRight
    && anchor.bottom > visibleTop
    && anchor.top < visibleBottom;
  if (!anchorIsVisible) return null;

  const minimumLeft = visibleLeft + 4;
  const maximumLeft = visibleRight - controlWidth - 4;
  const preferredLeft = anchor.right + gap;
  const left = Math.min(maximumLeft, Math.max(minimumLeft, preferredLeft));

  const minimumTop = visibleTop + 4;
  const maximumTop = visibleBottom - controlHeight - 4;
  const preferredTop = anchor.top + (anchor.height - controlHeight) / 2;
  const top = Math.min(maximumTop, Math.max(minimumTop, preferredTop));
  return { left, top };
}

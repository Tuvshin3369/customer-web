/**
 * Supabase storage URLs: full image at `.../object/.../folder/file.jpg`,
 * thumbnail sibling at `.../folder/thumbs/file.jpg`.
 */

export function deriveProductThumbnailUrl(fullUrl: string): string | null {
  const trimmed = fullUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return null;
  }
  try {
    const u = new URL(trimmed);
    let path = u.pathname;
    if (path.endsWith('/')) path = path.slice(0, -1);
    if (!path) return null;
    // Already a thumb path (.../thumbs/<file>)
    if (/\/thumbs\/[^/]+$/i.test(path)) {
      return null;
    }
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash < 0) return null;
    const dir = path.slice(0, lastSlash + 1);
    const file = path.slice(lastSlash + 1);
    if (!file) return null;
    u.pathname = `${dir}thumbs/${file}`;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * When mapping API rows: skip placeholders and URLs that cannot use a thumb sibling.
 */
export function productThumbnailUrlForPrimary(
  primaryImageUrl: string,
  placeholderUrl: string,
): string | undefined {
  const t = primaryImageUrl.trim();
  if (!t || t === placeholderUrl.trim() || t.startsWith('data:')) return undefined;
  const thumb = deriveProductThumbnailUrl(t);
  if (!thumb || thumb === t) return undefined;
  return thumb;
}

/** Props for list/grid `<img>` — try thumb first, then full image if thumb 404s. */
export function productListImageProps(
  imageUrl: string,
  thumbnailUrl?: string,
): { src: string; fallbackSrc?: string } {
  if (thumbnailUrl && thumbnailUrl.trim() !== '' && thumbnailUrl !== imageUrl) {
    return { src: thumbnailUrl, fallbackSrc: imageUrl };
  }
  return { src: imageUrl };
}

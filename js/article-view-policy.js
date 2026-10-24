export function shouldSkipPublicArticleView({
  isPublicArticlePage,
  isPreviewRequest,
  hasAdminMarker,
  isAdmin,
}) {
  return !isPublicArticlePage || isPreviewRequest || hasAdminMarker || isAdmin;
}

export const CATEGORY_DESCRIPTIONS = Object.freeze({
  'Anime News': 'Breaking news, seasonal announcements, studio updates, and production insights.',
  'Reviews': 'Critical analyses, spoiler-free breakdowns, and in-depth episodic reviews.',
  'Rankings': 'Community top tier lists, best-of-season countdowns, and iconic character rankings.',
  'Guides': 'Watch orders, beginner roadmaps, lore explanations, and manga reading companions.',
  'Recommendations': 'Handpicked anime recommendations curated by genre, mood, and storytelling caliber.',
  'Manga': 'Manga chapter discussions, adaptations comparison, and light novel spotlights.',
  'Seasonal Anime': 'Previews, schedules, and essential guides for current and upcoming anime seasons.'
});

export function getCategoryDescription(category) {
  return CATEGORY_DESCRIPTIONS[category] ||
    `Explore published editorial coverage, analysis, and stories in ${category}.`;
}

export function getCategoryMetadata(category) {
  const description = getCategoryDescription(category);
  return {
    title: `${category} — Animoro`,
    description: `${description} Discover the latest Animoro stories in ${category}.`,
    heading: category,
  };
}

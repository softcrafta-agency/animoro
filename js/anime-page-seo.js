import { getAnimePath } from './anime-url.js';

const SITE_ORIGIN = 'https://animoro.in';
const ANIME_LIST_URL = `${SITE_ORIGIN}/anime-list`;
const ANIME_LIST_NAME = 'Anime List: Explore Anime Series & Genres';
const ANIME_LIST_DESCRIPTION = "Explore anime by title, genre, format, airing status, popularity, and available ratings. Browse Animoro's catalogue and open a series for its available details.";

export function createAnimeListStructuredData(entries = []) {
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${ANIME_LIST_URL}#page`,
      name: ANIME_LIST_NAME,
      description: ANIME_LIST_DESCRIPTION,
      url: ANIME_LIST_URL,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Anime List', item: ANIME_LIST_URL },
      ],
    },
  ];
  const visibleEntries = Array.isArray(entries)
    ? entries.filter(entry => entry && typeof entry === 'object')
    : [];

  if (visibleEntries.length) {
    graph[0].mainEntity = { '@id': `${ANIME_LIST_URL}#anime-results` };
    graph.push({
      '@type': 'ItemList',
      '@id': `${ANIME_LIST_URL}#anime-results`,
      name: 'Anime Series',
      numberOfItems: visibleEntries.length,
      itemListElement: visibleEntries.map((anime, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: typeof anime.title === 'string' && anime.title.trim()
          ? anime.title.trim()
          : 'Untitled anime',
        url: new URL(getAnimePath(anime), SITE_ORIGIN).toString(),
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

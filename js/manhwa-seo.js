const SITE_ORIGIN = 'https://www.animoro.in';
const MANHWA_URL = `${SITE_ORIGIN}/manhwa`;
const FEATURED_URL = `${MANHWA_URL}/the-greatest-estate-developer`;
const SITE_REFERENCE = { '@id': `${SITE_ORIGIN}/#website` };
const PUBLISHER_REFERENCE = { '@id': `${SITE_ORIGIN}/#organization` };

export function createManhwaStructuredData(featured = null) {
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${MANHWA_URL}#page`,
      name: 'Discover Comics & Webcomics | Animoro',
      description: 'Discover comic and webcomic recommendations from around the world, browse genres, and explore country of origin.',
      url: MANHWA_URL,
      isPartOf: SITE_REFERENCE,
      publisher: PUBLISHER_REFERENCE,
      mainEntity: { '@id': `${MANHWA_URL}#featured` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Comics & Webcomics', item: MANHWA_URL },
      ],
    },
  ];

  if (featured?.isConfirmedManhwa) {
    graph.push({
      '@type': 'ItemList',
      '@id': `${MANHWA_URL}#featured`,
      name: 'Featured Comic Recommendation',
      numberOfItems: 1,
      itemListElement: [{
        '@type': 'ListItem',
        position: 1,
        item: {
          '@type': 'ComicSeries',
          '@id': `${FEATURED_URL}#series`,
          name: featured.title,
          description: featured.synopsis || undefined,
          genre: featured.genres,
          image: featured.coverImage || undefined,
          url: FEATURED_URL,
          sameAs: featured.siteUrl || undefined,
          countryOfOrigin: featured.countryName
            ? { '@type': 'Country', name: featured.countryName }
            : undefined,
          additionalProperty: featured.contentType ? {
            '@type': 'PropertyValue',
            name: 'Content type',
            value: featured.contentType,
          } : undefined,
          creator: [...featured.authors, ...featured.artists].map(name => ({
            '@type': 'Person',
            name,
          })),
        },
      }],
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

export function createManhwaDetailStructuredData(manhwa) {
  const canonicalUrl = `${MANHWA_URL}/${encodeURIComponent(manhwa.slug)}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ComicSeries',
        '@id': `${canonicalUrl}#series`,
        name: manhwa.title,
        description: manhwa.synopsis || undefined,
        genre: manhwa.genres,
        image: manhwa.coverImage || undefined,
        url: canonicalUrl,
        sameAs: manhwa.siteUrl || undefined,
        countryOfOrigin: manhwa.countryName
          ? { '@type': 'Country', name: manhwa.countryName }
          : undefined,
        inLanguage: manhwa.originalLanguage || undefined,
        alternateName: manhwa.originalTitle || undefined,
        additionalProperty: manhwa.contentType ? {
          '@type': 'PropertyValue',
          name: 'Content type',
          value: manhwa.contentType,
        } : undefined,
        ...(manhwa.releaseYear ? {
          datePublished: String(manhwa.releaseYear),
        } : {}),
        creator: [...manhwa.authors, ...manhwa.artists].map(name => ({
          '@type': 'Person',
          name,
        })),
        publisher: PUBLISHER_REFERENCE,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Comics & Webcomics', item: MANHWA_URL },
          { '@type': 'ListItem', position: 3, name: manhwa.title, item: canonicalUrl },
        ],
      },
    ],
  };
}

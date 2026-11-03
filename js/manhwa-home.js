import { getManhwaFeatured } from './manhwa-service.js';
import { renderFeaturedManhwa, renderMessage, renderLoading } from './manhwa-renderer.js';

async function loadManhwaSpotlight() {
  const container = document.getElementById('homeFeaturedManhwa');
  if (!container) return;
  renderLoading(container, 'Loading featured manhwa');

  try {
    const { item } = await getManhwaFeatured();
    renderFeaturedManhwa(container, item, { linkToDetails: true });
  } catch (error) {
    console.warn('Could not load the featured manhwa recommendation.', error);
    renderMessage(container, 'Manhwa recommendations are temporarily unavailable. Please try again.', loadManhwaSpotlight);
  }
}

loadManhwaSpotlight();

import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db, isConfigured } from './firebase-init.js';

const CATEGORIES_COLLECTION = 'categories';
// Import the former editor-only defaults once; dropdowns read stored categories only.
const LEGACY_ARTICLE_CATEGORIES = [
  'Anime News',
  'Reviews',
  'Rankings',
  'Guides',
  'Recommendations',
  'Manga',
  'Seasonal Anime',
];

export function createCategorySlug(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function getCategoryCollection() {
  if (!db || !isConfigured) {
    throw new Error('Firebase is not configured. Category data is unavailable.');
  }
  return collection(db, CATEGORIES_COLLECTION);
}

export async function getRegisteredCategories() {
  const snapshot = await getDocs(getCategoryCollection());
  return snapshot.docs.map(categoryDoc => {
    const data = categoryDoc.data();
    if (typeof data.name !== 'string' || !data.name.trim()) {
      throw new Error(`Category ${categoryDoc.id} is missing a valid name.`);
    }
    if (typeof data.slug !== 'string' || !data.slug.trim()) {
      throw new Error(`Category "${data.name}" is missing a valid slug.`);
    }

    return {
      id: categoryDoc.id,
      name: data.name.trim(),
      slug: data.slug,
      description: typeof data.description === 'string' ? data.description : '',
      createdAt: data.createdAt || null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function ensureLegacyArticleCategories() {
  const categories = getCategoryCollection();
  const snapshot = await getDocs(categories);
  const registeredSlugs = new Set(
    snapshot.docs
      .map(categoryDoc => categoryDoc.data().slug)
      .filter(slug => typeof slug === 'string')
  );
  const existingIds = new Set(snapshot.docs.map(categoryDoc => categoryDoc.id));

  for (const name of LEGACY_ARTICLE_CATEGORIES) {
    const slug = createCategorySlug(name);
    if (registeredSlugs.has(slug)) continue;

    const id = `legacy-${slug}`;
    if (existingIds.has(id)) {
      throw new Error(`Cannot register legacy category "${name}" because document "${id}" is already in use.`);
    }
    await setDoc(doc(categories, id), {
      name,
      slug,
      description: '',
      createdAt: serverTimestamp(),
    });
    registeredSlugs.add(slug);
    existingIds.add(id);
  }
}

export async function createRegisteredCategory(name, description) {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 100) {
    throw new Error('Category name must be between 1 and 100 characters.');
  }

  const slug = createCategorySlug(normalizedName);
  const categories = getCategoryCollection();
  const existing = await getDocs(query(categories, where('slug', '==', slug)));
  if (!existing.empty) {
    throw new Error(`A category with the slug "${slug}" is already registered.`);
  }

  return addDoc(categories, {
    name: normalizedName,
    slug,
    description: description.trim(),
    createdAt: serverTimestamp(),
  });
}

const IMAGE_FIELDS = {
  posts: ['coverImage', 'content'],
  upcomingAnime: ['poster', 'coverImage', 'image'],
  anime: ['poster', 'coverImage', 'image'],
};

export async function findImageReferences(firestore, imageUrl) {
  const collectionNames = Object.keys(IMAGE_FIELDS);
  const snapshots = await Promise.all(collectionNames.map((name) =>
    firestore.collection(name).select(...IMAGE_FIELDS[name]).get()
  ));

  return snapshots.flatMap((snapshot, collectionIndex) => snapshot.docs.flatMap((document) => {
    const data = document.data();
    const fields = IMAGE_FIELDS[collectionNames[collectionIndex]];
    return fields.some((field) => {
      const value = data[field];
      return typeof value === 'string' && (value === imageUrl || (field === 'content' && value.includes(imageUrl)));
    }) ? [`${collectionNames[collectionIndex]}/${document.id}`] : [];
  }));
}

import { db } from "../firebase/config";
import { addDoc, collection, serverTimestamp, doc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { removeProductImage } from "./storage";

// Saves a product document to Firestore under `products` collection
export async function saveProduct({ name, price, imagePath, imageUrl, ...rest }) {
  const doc = {
    name,
    price,
    imagePath: imagePath || null,
    imageUrl: imageUrl || null,
    createdAt: serverTimestamp(),
    ...rest,
  };
  return addDoc(collection(db, "products"), doc);
}

// Updates a product document in Firestore
export async function updateProduct(id, data) {
  const ref = doc(db, "products", id);
  return updateDoc(ref, { ...data, updatedAt: new Date() });
}

// Deletes a product and tries to remove its image from storage
export async function deleteProduct(id) {
  const ref = doc(db, "products", id);
  let imagePath = null;
  let imagePaths = [];
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      imagePath = data?.imagePath || null;
      imagePaths = Array.isArray(data?.imagePaths) ? data.imagePaths.filter(Boolean) : [];
    }
  } catch (_) {}
  await deleteDoc(ref);
  // Remove all images if present
  try {
    for (const p of imagePaths) {
      try { await removeProductImage(p); } catch (_) {}
    }
    if (imagePath && !imagePaths.includes(imagePath)) {
      try { await removeProductImage(imagePath); } catch (_) {}
    }
  } catch (_) {}
}

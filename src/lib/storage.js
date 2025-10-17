import { supabase } from "../supabase/client";

const DEFAULT_BUCKET = "product-images";

// Uploads a File/Blob/Uint8Array to Supabase Storage. Returns { path, publicUrl }.
export async function uploadProductImage(file, { bucket = DEFAULT_BUCKET, path } = {}) {
  if (!file) throw new Error("file is required");
  const fileExt = typeof file.name === "string" && file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const fileName = typeof file.name === "string" ? file.name : `${Date.now()}.${fileExt}`;
  const objectPath = path || `${Date.now()}-${Math.random().toString(36).slice(2)}/${fileName}`;

  const { data, error } = await supabase.storage.from(bucket).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;

  // If bucket is public, we can construct a public URL
  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return { path: data.path, publicUrl: publicData?.publicUrl };
}

// Uploads multiple files to Supabase Storage. Returns array of { path, publicUrl }.
export async function uploadProductImages(files, opts = {}) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) throw new Error("files array is empty");
  const results = [];
  for (const f of list) {
    // Reuse single-file uploader to keep behavior consistent
    const uploaded = await uploadProductImage(f, opts);
    results.push(uploaded);
  }
  return results;
}

// Removes an object from Supabase Storage bucket. Ignores errors.
export async function removeProductImage(path, { bucket = DEFAULT_BUCKET } = {}) {
  try {
    if (!path) return;
    await supabase.storage.from(bucket).remove([path]);
  } catch (_) {
    // ignore
  }
}

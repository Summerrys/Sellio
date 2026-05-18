import { getSupabase } from '@/lib/supabaseClient';

export const deleteImageFromStorage = async (imageUrl) => {
  if (!imageUrl || !imageUrl.includes('supabase')) return;
  try {
    const supabase = await getSupabase();
    // Extract path from URL: everything after /object/public/product-images/
    const path = imageUrl.split('/object/public/product-images/')[1];
    if (!path) return;
    await supabase.storage.from('product-images').remove([path]);
  } catch (err) {
    console.error('Failed to delete image from storage:', err);
  }
};

export const deleteMultipleImages = async (imageUrls) => {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return;
  const promises = imageUrls.map(url => deleteImageFromStorage(url));
  await Promise.all(promises);
};
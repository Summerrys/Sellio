import { getSupabase } from '@/lib/supabaseClient';

export const deleteImageFromStorage = async (imageUrl) => {
  console.log('deleteImageFromStorage called with:', imageUrl);
  if (!imageUrl || !imageUrl.includes('supabase')) {
    console.log('Skipping - not a supabase URL');
    return;
  }
  try {
    const supabase = await getSupabase();
    // Extract path from URL: everything after /object/public/product-images/
    const path = imageUrl.split('/object/public/product-images/')[1];
    console.log('Extracted path:', path);
    if (!path) {
      console.log('Skipping - no path extracted');
      return;
    }
    const { error } = await supabase.storage.from('product-images').remove([path]);
    console.log('Delete result - error:', error);
  } catch (err) {
    console.error('Failed to delete image from storage:', err);
  }
};

export const deleteMultipleImages = async (imageUrls) => {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return;
  const promises = imageUrls.map(url => deleteImageFromStorage(url));
  await Promise.all(promises);
};
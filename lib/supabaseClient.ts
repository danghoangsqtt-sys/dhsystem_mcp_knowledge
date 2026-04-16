/**
 * DHsystem - Backend API Client
 * 
 * Trước đây dùng Supabase trực tiếp, nay chuyển sang gọi Backend API.
 * File này giữ lại cho backward compatibility nhưng không còn dùng Supabase.
 * 
 * @deprecated Sử dụng apiFetch() trong api.ts thay thế
 */

// Legacy: không còn sử dụng Supabase
export const getSupabaseClient = () => {
  console.warn(
    '[DEPRECATED] getSupabaseClient() không còn sử dụng. ' +
    'Hệ thống đã chuyển sang Appwrite backend. ' +
    'Sử dụng các service trong api.ts thay thế.'
  );
  return null;
};
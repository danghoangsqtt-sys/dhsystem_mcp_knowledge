import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Define a type for our connection config
export interface SupabaseConfig {
  url: string;
  key: string;
}

let supabaseInstance: SupabaseClient | null = null;

// Prioritize Environment Variables if available (Production Mode)
// Safely access env using optional chaining (?.)
const importMeta = import.meta as any;
const ENV_URL = importMeta.env?.VITE_SUPABASE_URL;
const ENV_KEY = importMeta.env?.VITE_SUPABASE_KEY;

if (ENV_URL && ENV_KEY) {
  try {
    supabaseInstance = createClient(ENV_URL, ENV_KEY);
    console.log("Supabase initialized from Environment Variables");
  } catch (e) {
    console.error("Failed to init Supabase from Env vars");
  }
}

export const getSupabaseClient = (): SupabaseClient | null => {
  return supabaseInstance;
};

export const initSupabase = (config: SupabaseConfig): boolean => {
  try {
    if (!config.url || !config.key) return false;
    
    // Create new instance
    supabaseInstance = createClient(config.url, config.key);
    return true;
  } catch (error) {
    console.error("Supabase initialization failed:", error);
    return false;
  }
};

// Helper to check connection by fetching a simple query
export const checkConnection = async (): Promise<boolean> => {
  if (!supabaseInstance) return false;
  try {
    // Try to fetch count of knowledge_bases (assuming table exists per schema.sql)
    const { count, error } = await supabaseInstance
      .from('knowledge_bases')
      .select('*', { count: 'exact', head: true });
      
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("Connection check failed:", e);
    return false;
  }
};
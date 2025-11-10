export type * from './types.js';
export * from './settings/index.js';
export * from './chat/index.js';
export * from './profile/index.js';
export * from './prompt/favorites.js';

// Re-export the favorites instance for direct use
export { default as favoritesStorage } from './prompt/favorites.js';

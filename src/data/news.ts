import type { Post } from '~/lib/types';
import livePosts from './live/posts.json';

// News posts crawled from the current keralangounion.in (src/data/live/README.md): Malayalam
// text as published, topic and district from the old categories, photos still served from the
// old site. English versions come later with the AI-draft-and-review workflow (plan, section 6).
export const posts = livePosts as Post[];

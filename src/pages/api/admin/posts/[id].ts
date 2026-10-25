import type { APIRoute } from 'astro';
import { body, handle, idParam, userOf } from '~/lib/admin/api';
import { AdminError, approveEnglish, changeStatus, discardChanges, heartbeat, publishPost, requestHome, restoreRevision, savePost, submitPost, unlock } from '~/lib/admin/posts';

// The post editor's calls (src/lib/admin/posts.ts has the rules):
//   PUT  /api/admin/posts/{id}  { doc }            autosave → { savedAt }
//   POST /api/admin/posts/{id}  { action, doc? }   publish · submit · approve_english · discard ·
//        unpublish · archive · restore · send_back · request_home · restore_version · lock · unlock
export const prerender = false;

export const PUT: APIRoute = (ctx) =>
  handle(async () => {
    const { savedAt } = await savePost(userOf(ctx), idParam(ctx), (await body(ctx)).doc);
    return { savedAt };
  });

export const POST: APIRoute = (ctx) =>
  handle(async () => {
    const user = userOf(ctx);
    const id = idParam(ctx);
    const b = await body(ctx);
    switch (b.action) {
      case 'publish': return publishPost(user, id, b.doc, typeof b.scheduleAt === 'string' ? b.scheduleAt : null);
      case 'submit': return submitPost(user, id, b.doc);
      case 'approve_english': return approveEnglish(user, id, b.doc);
      case 'discard': return discardChanges(user, id);
      case 'unpublish':
      case 'archive':
      case 'restore':
      case 'send_back': return changeStatus(user, id, b.action);
      case 'request_home': return requestHome(user, id);
      case 'restore_version': return restoreRevision(user, id, Number(b.revisionId));
      case 'lock': return heartbeat(user, id);
      case 'unlock': return unlock(id, user);
      default: throw new AdminError('Unknown action.');
    }
  });

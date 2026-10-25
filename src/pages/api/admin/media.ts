import type { APIRoute } from 'astro';
import { body, handle, userOf } from '~/lib/admin/api';
import { deleteFile, listImages, replaceFile, setAlt, uploadImage, uploadPdf } from '~/lib/admin/media';
import { AdminError } from '~/lib/admin/publish';

// Photos for the editor's cover picker (src/lib/admin/media.ts):
//   GET   /api/admin/media?q=&before=   → { items }: newest images, 30 at a time
//   POST  /api/admin/media              multipart photo upload from the browser → { item }
//   POST  /api/admin/media?kind=pdf     multipart PDF upload (orders, Kerala Service) → { item }
//   POST  /api/admin/media?replace={id}  multipart: a new file takes that file's place everywhere
//   PATCH /api/admin/media  { id, alt } → { item }: the photo's description
//   DELETE /api/admin/media?id={id}     a file nothing uses (state roles)
export const prerender = false;

export const GET: APIRoute = (ctx) =>
  handle(async () => {
    userOf(ctx);
    const p = ctx.url.searchParams;
    return { items: await listImages(p.get('q') ?? '', Number(p.get('before')) || undefined) };
  });

export const POST: APIRoute = (ctx) =>
  handle(async () => {
    const user = userOf(ctx);
    let form: FormData;
    try {
      form = await ctx.request.formData();
    } catch {
      throw new AdminError('The upload could not be read. Try again.');
    }
    const replace = Number(ctx.url.searchParams.get('replace'));
    if (replace) return void (await replaceFile(user, replace, form));
    return { item: ctx.url.searchParams.get('kind') === 'pdf' ? await uploadPdf(user, form) : await uploadImage(user, form) };
  });

export const PATCH: APIRoute = (ctx) =>
  handle(async () => {
    const b = await body(ctx);
    return { item: await setAlt(userOf(ctx), Number(b.id), String(b.alt ?? '')) };
  });

export const DELETE: APIRoute = (ctx) => handle(async () => void (await deleteFile(userOf(ctx), Number(ctx.url.searchParams.get('id')))));

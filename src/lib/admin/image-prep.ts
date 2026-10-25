// Runs in the admin's browser before a photo is uploaded (plan, section 9): the photo is redrawn
// at the standard widths, which also drops EXIF data such as GPS location, and encoded as WebP at
// quality 80 (JPEG on browsers that can't make WebP, such as older Safari). Sizes wider than the
// original are skipped. A large phone photo becomes a few hundred KB, so uploads stay quick on
// mobile data. The SHA-256 of the original lets the server spot a photo uploaded before.

const WIDTHS = [320, 640, 960, 1280, 1920];
const MASTER = 2560;
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = /^image\/(jpeg|png|webp|heic|heif)$/;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function encode(bmp: ImageBitmap, width: number, type: string): Promise<Blob> {
  const height = Math.round((bmp.height * width) / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, type === 'image/webp' ? 0.8 : 0.82));
  if (!blob) throw new Error('This photo could not be prepared. Try another one.');
  return blob;
}

/** The form to POST to /api/admin/media for one photo */
export async function prepareImage(file: File, alt: string): Promise<FormData> {
  if (!ACCEPTED.test(file.type)) throw new Error('Choose a photo (JPEG, PNG, WebP or HEIC).');
  if (file.size > MAX_BYTES) throw new Error('That photo is larger than 15 MB. Choose a smaller one.');
  const sha = hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser can’t read that photo. Choose a JPEG or PNG, or take the photo again.');
  }
  // WebP where the browser can make it; Safari before 17 gives back PNG, so use JPEG there
  const probe = await encode(bmp, Math.min(16, bmp.width), 'image/webp');
  const type = probe.type === 'image/webp' ? 'image/webp' : 'image/jpeg';

  const form = new FormData();
  form.set('sha256', sha);
  form.set('alt', alt);
  form.set('width', String(bmp.width));
  form.set('height', String(bmp.height));
  const ext = type === 'image/webp' ? 'webp' : 'jpg';
  const widths = WIDTHS.filter((w) => w <= bmp.width);
  for (const w of widths) form.set(`w${w}`, await encode(bmp, w, type), `${w}.${ext}`);
  // A photo narrower than the smallest size goes up once, at its own width (never enlarged)
  if (!widths.length) form.set('w320', await encode(bmp, bmp.width, type), `320.${ext}`);
  form.set('master', await encode(bmp, Math.min(MASTER, bmp.width), type), 'master');
  bmp.close();
  return form;
}

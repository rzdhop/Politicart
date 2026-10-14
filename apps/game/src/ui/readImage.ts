/**
 * Read an image file the player picked, scale it down to `max` pixels on its
 * longest side and hand back a JPEG data URL. Liveries are capped at 512 and
 * campaign posters at 640, which keeps the saved workshop inside what
 * localStorage allows for a handful of pictures.
 */
export function readImage(file: File, max: number, cb: (url: string) => void) {
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const sc = Math.min(1, max / Math.max(im.width, im.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(im.width * sc));
      cv.height = Math.max(1, Math.round(im.height * sc));
      cv.getContext('2d')?.drawImage(im, 0, 0, cv.width, cv.height);
      cb(cv.toDataURL('image/jpeg', 0.82));
    };
    im.src = r.result as string;
  };
  r.readAsDataURL(file);
}

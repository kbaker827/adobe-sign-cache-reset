// Grabs a still frame from the camera as a base64 JPEG.
// On the glasses this should be the outward camera; on a phone it asks for
// the back camera. Needs HTTPS (or localhost) to work.

let stream = null;
let video = null;

export async function startCamera() {
  if (stream) return;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('No camera access in this browser');
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
    audio: false,
  });
  video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  // Give auto-exposure a moment on the first frame.
  await new Promise((r) => setTimeout(r, 300));
}

export function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video = null;
}

/** Returns base64 JPEG data (no "data:" prefix), longest side <= maxSide. */
export async function captureJpeg(maxSide = 1024) {
  await startCamera();
  const w = video.videoWidth;
  const hgt = video.videoHeight;
  if (!w || !hgt) throw new Error('Camera not ready');
  const scale = Math.min(1, maxSide / Math.max(w, hgt));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(hgt * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
}

// Release the camera when the app is hidden (saves battery, turns off the LED).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
});

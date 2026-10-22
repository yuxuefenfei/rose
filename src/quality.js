// Reduce resolution only after sustained slow frames; idle gaps are not samples.
export function createRenderQuality(mobile, devicePixelRatio) {
  let pixelRatio = Math.min(devicePixelRatio, 1.75);
  const minimum = Math.min(pixelRatio, 1.5);
  let elapsed = 0, samples = 0;
  return {
    get pixelRatio() { return pixelRatio; },
    sampleFrame(milliseconds) {
      if (!mobile || milliseconds <= 0 || milliseconds > 250) {
        elapsed = samples = 0;
        return false;
      }
      elapsed += milliseconds;
      if (++samples < 90) return false;
      const slow = elapsed / samples > 25;
      elapsed = samples = 0;
      if (!slow || pixelRatio <= minimum) return false;
      pixelRatio = Math.max(minimum, pixelRatio - 0.25);
      return true;
    },
  };
}

// Crop the drawing buffer, while the projection still uses full-page coordinates.
export function getRenderWindow(width, height, mobile) {
  if (!mobile || width >= height) return { top: 0, height };
  const top = Math.min(160, Math.round(height * 0.17));
  const bottom = Math.min(200, Math.round(height * 0.21));
  return { top, height: height - top - bottom };
}

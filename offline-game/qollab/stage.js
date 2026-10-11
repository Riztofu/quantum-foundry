// Qollab shows the game in a preview of varying width (laptop, wide monitor, full screen).
// The page is laid out once at a fixed design size and scaled uniformly to the preview's
// width, so it looks the same everywhere. app.js divides pointer math by this scale.
const DESIGN_WIDTH = 1600, DESIGN_HEIGHT = 820, MIN_SCALE = 0.55, MAX_SCALE = 1.6;
const frame = document.getElementById('qf-qollab'), stage = document.getElementById('qf-stage');
export function fitStage() {
  const width = frame.clientWidth || document.documentElement.clientWidth || DESIGN_WIDTH;
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, width / DESIGN_WIDTH));
  stage.style.transform = `scale(${scale})`;
  frame.style.height = Math.round(DESIGN_HEIGHT * scale) + 'px';
  return scale;
}
fitStage();
window.addEventListener('resize', fitStage);

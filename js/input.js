// Keyboard input singleton. Tracks held keys and one-shot "just pressed" set.
const Input = (() => {
  const held = new Set();
  const justPressed = new Set();
  let enabled = true;

  function onKeyDown(e) {
    if (!enabled) return;
    const k = normalize(e);
    if (!held.has(k)) justPressed.add(k);
    held.add(k);
    // Prevent page scroll from arrow keys / space when game is active.
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) {
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    held.delete(normalize(e));
  }
  function normalize(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return {
    setEnabled(v) { enabled = v; if (!v) { held.clear(); justPressed.clear(); } },
    isDown(...keys) { return keys.some(k => held.has(k)); },
    wasPressed(...keys) { return keys.some(k => justPressed.has(k)); },
    endFrame() { justPressed.clear(); },
    // Named gameplay actions.
    accelerate() { return this.isDown("ArrowUp", "w"); },
    brake() { return this.isDown("ArrowDown", "s"); },
    left() { return this.isDown("ArrowLeft", "a"); },
    right() { return this.isDown("ArrowRight", "d"); },
    useItem() { return this.wasPressed(" "); },
    pause() { return this.wasPressed("Escape", "p"); },
    drift() { return this.isDown("Shift"); },
  };
})();

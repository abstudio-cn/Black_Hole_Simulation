/**
 * controls.js - UI control panel for black hole simulation.
 *
 * Creates sliders at bottom-left for:
 *   - Particle temperature
 *   - Particle glow brightness
 *   - Black hole & particle collapse strength
 */

function createControlPanel() {
  // =====================
  // State
  // =====================
  const state = {
    temperature: 0.5,       // 0..1  (maps to 1200K–10000K range in accretionDisk)
    glowBrightness: 0.65,   // 0..1
    collapseStrength: 0.35, // 0..1
    particleSize: 0.5,      // 0..1  (maps to 0.3..2.7 multiplier in accretionDisk)
    rotationSpeed: 0.5,     // 0..1  (maps to 0.3..4.3 multiplier in accretionDisk)
    bhSize: 0.33            // 0..1  (maps to Rs 1.0..6.0, default 0.33 → Rs=2.0)
  };

  const listeners = [];

  // =====================
  // Build DOM
  // =====================
  const panel = document.createElement('div');
  panel.id = 'controls-panel';

  const title = document.createElement('h3');
  title.textContent = '⚫ 黑洞参数';
  panel.appendChild(title);

  // --- Temperature ---
  const tempGroup = createSliderGroup(
    '🔥 粒子温度',
    0, 1, state.temperature, 0.01,
    (v) => {
      state.temperature = v;
      emit('temperature', v);
    },
    (v) => (v * 100).toFixed(0) + '%'
  );
  panel.appendChild(tempGroup);

  // --- Glow Brightness ---
  const glowGroup = createSliderGroup(
    '✨ 发光亮度',
    0, 1, state.glowBrightness, 0.01,
    (v) => {
      state.glowBrightness = v;
      emit('glow', v);
    },
    (v) => (v * 100).toFixed(0) + '%'
  );
  panel.appendChild(glowGroup);

  // Divider
  const divider = document.createElement('div');
  divider.className = 'control-divider';
  panel.appendChild(divider);

  // --- Black Hole Size ---
  const bhSizeGroup = createSliderGroup(
    '⚫ 黑洞大小',
    0, 1, state.bhSize, 0.01,
    (v) => {
      state.bhSize = v;
      emit('bhSize', v);
    },
    (v) => (v * 100).toFixed(0) + '%'
  );
  panel.appendChild(bhSizeGroup);

  // Divider
  const dividerBH = document.createElement('div');
  dividerBH.className = 'control-divider';
  panel.appendChild(dividerBH);

  // --- Collapse Strength ---
  const collapseGroup = createSliderGroup(
    '🌀 坍缩强度',
    0.05, 1.0, state.collapseStrength, 0.01,
    (v) => {
      state.collapseStrength = v;
      emit('collapse', v);
    },
    (v) => (v * 100).toFixed(0) + '%'
  );
  panel.appendChild(collapseGroup);

  // Divider
  const divider2 = document.createElement('div');
  divider2.className = 'control-divider';
  panel.appendChild(divider2);

  // --- Particle Size ---
  const sizeGroup = createSliderGroup(
    '💫 粒子大小',
    0.05, 1.0, state.particleSize, 0.01,
    (v) => {
      state.particleSize = v;
      emit('particleSize', v);
    },
    (v) => (v * 100).toFixed(0) + '%'
  );
  panel.appendChild(sizeGroup);

  // --- Rotation Speed ---
  const rotGroup = createSliderGroup(
    '🔄 旋转速度',
    0.05, 1.0, state.rotationSpeed, 0.01,
    (v) => {
      state.rotationSpeed = v;
      emit('rotationSpeed', v);
    },
    (v) => (v * 100).toFixed(0) + '%'
  );
  panel.appendChild(rotGroup);

  document.body.appendChild(panel);

  // --- Info text (bottom-right) ---
  const info = document.createElement('div');
  info.id = 'info-text';
  info.textContent = '🖱 拖拽旋转 · 滚轮缩放 · 右键平移';
  document.body.appendChild(info);

  // =====================
  // Helpers
  // =====================
  function createSliderGroup(labelText, min, max, initial, step, onChange, formatFn) {
    const group = document.createElement('div');
    group.className = 'control-group';

    const label = document.createElement('label');
    const labelSpan = document.createElement('span');
    labelSpan.textContent = labelText;

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'value-display';
    valueDisplay.textContent = formatFn(initial);

    label.appendChild(labelSpan);
    label.appendChild(valueDisplay);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initial);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valueDisplay.textContent = formatFn(v);
      onChange(v);
    });

    group.appendChild(label);
    group.appendChild(slider);
    return group;
  }

  function emit(event, value) {
    for (const cb of listeners) {
      if (cb.event === event || cb.event === '*') {
        try { cb.fn(value, event); } catch (e) { /* ignore */ }
      }
    }
  }

  // =====================
  // Public API
  // =====================
  return {
    state,

    /** Register a listener: on(eventName, callback(value, eventName)) */
    on(event, fn) {
      listeners.push({ event, fn });
    },

    /** Get current state snapshot */
    getState() {
      return { ...state };
    }
  };
}

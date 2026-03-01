// SpritePlistEditor.jsx
// Updated: if device aspect ratio is 16:9 or 9:16, shifts the x/y of ALL buttons.
// Drop this into your React app (Tailwind optional). Export default component.

import React, { useState, useRef, useEffect } from 'react';

export default function SpritePlistEditor() {
  // Aspect configuration
  const ASPECT_TOLERANCE = 0.03; // tolerance for float comparisons
  const LANDSCAPE_RATIO = 16 / 9;
  const PORTRAIT_RATIO = 9 / 16;
  const LANDSCAPE_SHIFT = { x: 48, y: 0 };
  const PORTRAIT_SHIFT = { x: 0, y: 48 };

  const [btnShift, setBtnShift] = useState({ x: 0, y: 0 });

  // existing state
  const [plistText, setPlistText] = useState('');
  const [plistObj, setPlistObj] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageURL, setImageURL] = useState(null);
  const [frames, setFrames] = useState([]); // array of {name, frameRect:{x,y,w,h}, rotated, offset, sourceSize}
  const [selected, setSelected] = useState(null);

  // transform state
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [anchorX, setAnchorX] = useState(0.5);
  const [anchorY, setAnchorY] = useState(0.5);
  const [opacity, setOpacity] = useState(1);
  const [tint, setTint] = useState('#ffffff');

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startTx: 0, startTy: 0 });

  // Detect aspect ratio and apply button shift if matches 16:9 or 9:16
  useEffect(() => {
    function applyAspectShift() {
      const r = window.innerWidth / Math.max(1, window.innerHeight);
      if (Math.abs(r - LANDSCAPE_RATIO) < ASPECT_TOLERANCE) {
        setBtnShift(LANDSCAPE_SHIFT);
      } else if (Math.abs(r - PORTRAIT_RATIO) < ASPECT_TOLERANCE) {
        setBtnShift(PORTRAIT_SHIFT);
      } else {
        setBtnShift({ x: 0, y: 0 });
      }
    }
    applyAspectShift();
    window.addEventListener('resize', applyAspectShift);
    return () => window.removeEventListener('resize', applyAspectShift);
  }, []);

  useEffect(() => {
    if (imageFile) setImageURL(URL.createObjectURL(imageFile));
    return () => {
      if (imageURL) URL.revokeObjectURL(imageURL);
    };
  }, [imageFile]);

  useEffect(() => {
    if (!imageURL) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      drawCanvas();
    };
    img.src = imageURL;
  }, [imageURL, selected, tx, ty, rotation, scaleX, scaleY, anchorX, anchorY, opacity, tint]);

  useEffect(() => {
    drawCanvas();
  }, [frames, selected]);

  function handlePlistUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      setPlistText(e.target.result);
      const parsed = parsePlistToFrames(e.target.result);
      setPlistObj(parsed.xmlDoc || null);
      setFrames(parsed.frames || []);
      setSelected(parsed.frames && parsed.frames[0] ? 0 : null);
    };
    reader.readAsText(file);
  }

  function parsePlistToFrames(xmlText) {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlText, 'application/xml');

      // find <key>frames</key> dict
      const keys = Array.from(xml.getElementsByTagName('key'));
      let framesDict = null;
      for (let i = 0; i < keys.length; i++) {
        if (keys[i].textContent.trim() === 'frames') {
          // next sibling should be dict
          let node = keys[i].nextElementSibling;
          if (node && node.tagName === 'dict') framesDict = node;
          break;
        }
      }

      const frames = [];
      if (framesDict) {
        const children = Array.from(framesDict.children);
        for (let i = 0; i < children.length; i += 2) {
          const nameKey = children[i];
          const valueDict = children[i + 1];
          if (!nameKey || !valueDict) break;
          const name = nameKey.textContent;
          const dd = {}; // properties
          const kv = Array.from(valueDict.children);
          for (let j = 0; j < kv.length; j += 2) {
            const k = kv[j];
            const v = kv[j + 1];
            if (!k || !v) break;
            dd[k.textContent] = v.textContent;
          }

          const frameRect = parseFrameString(dd['frame'] || dd['textureRect'] || dd['rect']);
          const rotated = (dd['rotated'] || 'false') === 'true';
          const offset = parsePointString(dd['offset'] || dd['spriteOffset']);
          const sourceSize = parsePointString(dd['sourceSize'] || dd['spriteSourceSize']);

          frames.push({ name, frameRect, rotated, offset, sourceSize, raw: dd });
        }
      }

      // fallback: try SubTexture style (eg. some texture atlas formats)
      if (frames.length === 0) {
        const subTextures = xml.getElementsByTagName('SubTexture');
        for (let i = 0; i < subTextures.length; i++) {
          const st = subTextures[i];
          const name = st.getAttribute('name');
          const x = parseInt(st.getAttribute('x') || '0', 10);
          const y = parseInt(st.getAttribute('y') || '0', 10);
          const w = parseInt(st.getAttribute('width') || '0', 10);
          const h = parseInt(st.getAttribute('height') || '0', 10);
          frames.push({ name, frameRect: { x, y, w, h }, rotated: false, offset: { x: 0, y: 0 }, sourceSize: { x: w, y: h }, raw: {} });
        }
      }

      return { frames, xmlDoc: xml };
    } catch (err) {
      console.error('plist parse error', err);
      return { frames: [] };
    }
  }

  function parseFrameString(s) {
    if (!s) return { x: 0, y: 0, w: 0, h: 0 };
    // formats: "{{x,y},{w,h}}"  or "x,y,w,h"  or "{x,y,w,h}"
    const nums = s.replace(/[{} ]+/g, '').split(/,|\s+/).map(v => parseFloat(v)).filter(v => !Number.isNaN(v));
    if (nums.length >= 4) return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  function parsePointString(s) {
    if (!s) return { x: 0, y: 0 };
    const nums = s.replace(/[{} ]+/g, '').split(/,|\s+/).map(v => parseFloat(v)).filter(v => !Number.isNaN(v));
    if (nums.length >= 2) return { x: nums[0], y: nums[1] };
    return { x: 0, y: 0 };
  }

  function drawCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imgRef.current;
    if (!canvas || !ctx) return;

    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // background grid
    const gridSize = 32;
    ctx.save();
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#111827';
    ctx.globalAlpha = 0.5;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.restore();

    if (!img) return;

    // draw full spritesheet small preview top-left
    const thumbW = 140;
    const thumbH = 140 * (img.height / img.width);
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(img, 8, 8, thumbW, thumbH);
    ctx.restore();

    if (selected == null || !frames[selected]) return;
    const f = frames[selected];
    const fr = f.frameRect;
    // center area
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.save();
    ctx.translate(cx + tx, cy + ty);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);
    ctx.globalAlpha = opacity;

    // compute draw position so that anchor is placed at (0,0)
    const drawW = fr.w;
    const drawH = fr.h;
    const dx = -anchorX * drawW;
    const dy = -anchorY * drawH;

    // draw frame from spritesheet
    ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, dx, dy, drawW, drawH);

    // tint overlay using multiply blend
    if (tint && tint !== '#ffffff') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = tint;
      ctx.fillRect(dx, dy, drawW, drawH);
      ctx.globalCompositeOperation = 'source-over';
    }

    // bounding box and origin cross
    ctx.strokeStyle = '#00f6ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx - 0.5, dy - 0.5, drawW + 1, drawH + 1);

    ctx.strokeStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.stroke();

    ctx.restore();
  }

  function handleCanvasMouseDown(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    dragRef.current = { dragging: true, startX: x, startY: y, startTx: tx, startTy: ty };
    window.addEventListener('mousemove', handleCanvasMouseMove);
    window.addEventListener('mouseup', handleCanvasMouseUp);
  }

  function handleCanvasMouseMove(e) {
    if (!dragRef.current.dragging) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - dragRef.current.startX;
    const dy = y - dragRef.current.startY;
    setTx(dragRef.current.startTx + dx);
    setTy(dragRef.current.startTy + dy);
  }

  function handleCanvasMouseUp() {
    dragRef.current.dragging = false;
    window.removeEventListener('mousemove', handleCanvasMouseMove);
    window.removeEventListener('mouseup', handleCanvasMouseUp);
  }

  function exportJSON() {
    const payload = {
      frames: frames.map((f, idx) => ({ name: f.name, transform: idx === selected ? { tx, ty, rotation, scaleX, scaleY, anchorX, anchorY, opacity, tint } : null }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spritesheet-transforms.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPlistWithOffsets() {
    if (!plistObj) return exportJSON();
    const xml = plistObj.cloneNode(true);
    const dicts = xml.getElementsByTagName('dict');
    if (dicts.length === 0) return exportJSON();
    const topDict = dicts[0];

    // remove existing userData if present
    const ks = Array.from(topDict.getElementsByTagName('key'));
    for (let i = 0; i < ks.length; i++) {
      if (ks[i].textContent === 'userData') {
        const node = ks[i].nextElementSibling;
        if (node) topDict.removeChild(node);
        topDict.removeChild(ks[i]);
        break;
      }
    }

    const userKey = xml.createElement('key');
    userKey.textContent = 'userData';
    const userDict = xml.createElement('dict');

    frames.forEach((f, idx) => {
      const k = xml.createElement('key');
      k.textContent = f.name;
      const d = xml.createElement('dict');

      const addKV = (name, value) => {
        const keyN = xml.createElement('key');
        keyN.textContent = name;
        const realVal = xml.createElement('string');
        realVal.textContent = String(value);
        d.appendChild(keyN);
        d.appendChild(realVal);
      };

      if (idx === selected) {
        addKV('tx', tx);
        addKV('ty', ty);
        addKV('rotation', rotation);
        addKV('scaleX', scaleX);
        addKV('scaleY', scaleY);
        addKV('anchorX', anchorX);
        addKV('anchorY', anchorY);
        addKV('opacity', opacity);
        addKV('tint', tint);
      }

      userDict.appendChild(k);
      userDict.appendChild(d);
    });

    topDict.appendChild(userKey);
    topDict.appendChild(userDict);

    const serializer = new XMLSerializer();
    const out = serializer.serializeToString(xml);
    const blob = new Blob([out], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spritesheet-with-userdata.plist';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Small helper to render buttons with the aspect shift applied
  function ActionButton({ children, onClick, className, type = 'button' }) {
    const style = { transform: `translate(${btnShift.x}px, ${btnShift.y}px)` };
    return (
      <button type={type} onClick={onClick} className={`${className || ''} js-button`} style={style}>
        {children}
      </button>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      <aside className="w-80 p-4 border-r border-slate-700 bg-gradient-to-b from-slate-850/40 to-transparent">
        <div className="space-y-3">
          <h2 className="text-2xl font-extrabold tracking-tight">Sprite & Plist Studio</h2>
          <p className="text-sm text-slate-400">Upload a .plist and a spritesheet image, pick a frame, tweak transforms, export.</p>

          <div className="bg-slate-800 p-3 rounded-lg shadow-inner">
            <label className="block text-xs uppercase text-slate-400">Upload .plist</label>
            <input className="mt-2 w-full text-xs text-slate-200" type="file" accept=".plist,.xml" onChange={(e) => e.target.files[0] && handlePlistUpload(e.target.files[0])} />
          </div>

          <div className="bg-slate-800 p-3 rounded-lg">
            <label className="block text-xs uppercase text-slate-400">Upload spritesheet</label>
            <input className="mt-2 w-full text-xs text-slate-200" type="file" accept="image/*" onChange={(e) => e.target.files[0] && setImageFile(e.target.files[0])} />
          </div>

          <div className="bg-slate-800 p-3 rounded-lg flex flex-col gap-2">
            <ActionButton className="px-3 py-2 rounded bg-gradient-to-r from-cyan-500 to-blue-500 text-black font-semibold" onClick={() => drawCanvas()}>Render Preview</ActionButton>
            <ActionButton className="px-3 py-2 rounded border border-slate-600 hover:bg-slate-700" onClick={() => exportJSON()}>Export transforms (.json)</ActionButton>
            <ActionButton className="px-3 py-2 rounded border border-slate-600 hover:bg-slate-700" onClick={() => exportPlistWithOffsets()}>Export plist with userdata</ActionButton>
          </div>

          <div className="text-xs text-slate-400">Tip: drag the preview to move the frame. Use sliders for precise control.</div>
        </div>
      </aside>

      <main className="flex-1 p-4 overflow-hidden">
        <div className="grid grid-cols-3 gap-4 h-full">
          <section className="col-span-2 bg-gradient-to-b from-slate-900/40 to-transparent rounded-lg p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-tr from-pink-600 to-yellow-400 rounded-lg flex items-center justify-center font-bold text-slate-900">SP</div>
                <div>
                  <div className="text-lg font-semibold">Preview Canvas</div>
                  <div className="text-sm text-slate-400">Interactive editor â€” drag to move, sliders for transforms</div>
                </div>
              </div>
              <div className="text-sm text-slate-400">{frames.length} frames loaded</div>
            </div>

            <div className="flex-1 flex items-center justify-center bg-slate-900/40 rounded-lg p-3">
              <canvas ref={canvasRef} width={1100} height={700} onMouseDown={handleCanvasMouseDown} className="rounded-lg shadow-lg" />
            </div>

            <div className="mt-3 grid grid-cols-4 gap-3">
              <div className="col-span-1 bg-slate-800 p-3 rounded-lg">
                <label className="text-xs text-slate-400">Offset X</label>
                <input type="range" min={-1000} max={1000} value={tx} onChange={(e) => setTx(Number(e.target.value))} />
                <div className="text-xs">{tx}px</div>

                <label className="text-xs text-slate-400 mt-2">Offset Y</label>
                <input type="range" min={-1000} max={1000} value={ty} onChange={(e) => setTy(Number(e.target.value))} />
                <div className="text-xs">{ty}px</div>
              </div>

              <div className="col-span-1 bg-slate-800 p-3 rounded-lg">
                <label className="text-xs text-slate-400">Rotation</label>
                <input type="range" min={-180} max={180} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
                <div className="text-xs">{rotation}Â°</div>

                <label className="text-xs text-slate-400 mt-2">Opacity</label>
                <input type="range" min={0} max={1} step={0.01} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
                <div className="text-xs">{opacity}</div>
              </div>

              <div className="col-span-1 bg-slate-800 p-3 rounded-lg">
                <label className="text-xs text-slate-400">Scale X</label>
                <input type="range" min={-5} max={5} step={0.01} value={scaleX} onChange={(e) => setScaleX(Number(e.target.value))} />
                <div className="text-xs">{scaleX.toFixed(2)}</div>

                <label className="text-xs text-slate-400 mt-2">Scale Y</label>
                <input type="range" min={-5} max={5} step={0.01} value={scaleY} onChange={(e) => setScaleY(Number(e.target.value))} />
                <div className="text-xs">{scaleY.toFixed(2)}</div>
              </div>

              <div className="col-span-1 bg-slate-800 p-3 rounded-lg">
                <label className="text-xs text-slate-400">Anchor X</label>
                <input type="range" min={0} max={1} step={0.01} value={anchorX} onChange={(e) => setAnchorX(Number(e.target.value))} />
                <div className="text-xs">{anchorX.toFixed(2)}</div>

                <label className="text-xs text-slate-400 mt-2">Anchor Y</label>
                <input type="range" min={0} max={1} step={0.01} value={anchorY} onChange={(e) => setAnchorY(Number(e.target.value))} />
                <div className="text-xs">{anchorY.toFixed(2)}</div>
              </div>
            </div>

            <div className="mt-3 flex gap-3 items-center">
              <label className="text-xs text-slate-400">Tint</label>
              <input type="color" value={tint} onChange={(e) => setTint(e.target.value)} />
              <div className="text-xs text-slate-400 ml-4">Preview opacity: {opacity}</div>
            </div>
          </section>

          <aside className="col-span-1 bg-slate-900/50 p-3 rounded-lg overflow-auto">
            <div className="text-sm font-semibold mb-2">Frames</div>
            <div className="space-y-2">
              {frames.length === 0 && <div className="text-xs text-slate-500">No frames loaded â€” upload a plist or spritesheet.</div>}
              {frames.map((f, idx) => (
                <div key={f.name} className={`p-2 rounded cursor-pointer flex items-center justify-between ${idx === selected ? 'bg-slate-800 border border-cyan-500' : 'hover:bg-slate-800'}`} onClick={() => { setSelected(idx); resetTransformForFrame(idx); }}>
                  <div className="flex-1">
                    <div className="text-sm truncate">{f.name}</div>
                    <div className="text-xs text-slate-400">{f.frameRect.w}x{f.frameRect.h} @ {f.frameRect.x},{f.frameRect.y}</div>
                  </div>
                  <div className="ml-2 text-xs text-slate-400">#{idx}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-sm font-semibold">Selected frame transforms</div>
            {selected != null && frames[selected] && (
              <div className="mt-2 text-xs text-slate-400 space-y-1">
                <div>Name: {frames[selected].name}</div>
                <div>Rect: {frames[selected].frameRect.x},{frames[selected].frameRect.y},{frames[selected].frameRect.w},{frames[selected].frameRect.h}</div>
                <div>Offset: {frames[selected].offset?.x ?? 0},{frames[selected].offset?.y ?? 0}</div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <ActionButton className="flex-1 px-2 py-1 rounded bg-emerald-500 text-black font-semibold" onClick={() => { setTx(0); setTy(0); setRotation(0); setScaleX(1); setScaleY(1); setAnchorX(0.5); setAnchorY(0.5); setOpacity(1); setTint('#ffffff'); }}>Reset</ActionButton>
              <ActionButton className="flex-1 px-2 py-1 rounded border border-slate-600" onClick={() => exportJSON()}>Download JSON</ActionButton>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );

  function resetTransformForFrame(idx) {
    setTx(0); setTy(0); setRotation(0); setScaleX(1); setScaleY(1); setAnchorX(0.5); setAnchorY(0.5); setOpacity(1); setTint('#ffffff');
  }
}

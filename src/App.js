import React, { useState, useEffect, useRef } from "react";
import {
  Stage,
  Layer,
  Circle,
  Line,
  Text,
  Rect,
  Image as KonvaImage
} from "react-konva";
import axios from "axios";
import "./App.css";

/**
 * Main ECAD application component.
 * Renders interactive canvas with grid, nodes, connections, labels, outline, and optional background image.
 * Supports exporting to PNG and SVG with optional inclusion of background image.
 */
const App = () => {
  // Constants for physics and rendering
  const traceThickness = 0.000035; // Physical trace thickness in meters
  const filletRadius   = 15; // Radius for fillet rounding
  const HIT_STROKE     = 40; // Hit detection stroke width

  // Real-world stage dimensions in centimeters
  const STAGE_WIDTH_CM  = 20;
  const STAGE_HEIGHT_CM = 15;
  const PIXELS_PER_CM   = 600 / STAGE_WIDTH_CM; // 600px canvas width equals 20cm => 30px per cm

  // Lookup table for material color and resistivity
  const materialProperties = {
    copper:   { color: "orange",    resistivity: 1.68e-8 },
    aluminum: { color: "gray",      resistivity: 2.82e-8 },
    gold:     { color: "yellow",    resistivity: 2.44e-8 },
    silver:   { color: "lightgray", resistivity: 1.59e-8 }
  };

  // Component state
  const [shapes,          setShapes]          = useState([]); // All shapes (nodes, connections, outline)
  const [labels,          setLabels]          = useState([]); // Canvas text labels
  const [activeLayers,    setActiveLayers]    = useState({ // Toggle visibility of layers
    footprint:    true,
    f_lig:        true,
    outlineLayer: true,
    labelLayer:   true,
    imageLayer:   true
  });
  const [selectedNode,       setSelectedNode      ] = useState(null); // Currently selected node
  const [selectedConnection, setSelectedConnection] = useState(null); // Currently selected connection
  const [selectedLabel,      setSelectedLabel     ] = useState(null); // Currently selected label
  const [isDrawingOutline,   setIsDrawingOutline  ] = useState(false);// In-outline-drawing mode?
  const [isAddingLabel,      setIsAddingLabel     ] = useState(false);// In-label-adding mode?
  const [outlinePath,        setOutlinePath       ] = useState([]); // Temporary points when drawing outline
  const [activePath,         setActivePath        ] = useState([]); // Temporary points when drawing connection
  const [mousePosition,      setMousePosition     ] = useState(null); // Latest mouse position for preview
  const [selectedMaterial,   setSelectedMaterial  ] = useState("copper"); // Material for new traces
  const [traceWidth,         setTraceWidth        ] = useState(0.005); // Width of trace in meters
  const [resistance,         setResistance        ] = useState(0); // Computed resistance of selected connection
  const [tempResistance,     setTempResistance    ] = useState(""); // Text input buffer for resistance editing
  const [showGrid,           setShowGrid          ] = useState(true); // Grid toggle
  const [gridSpacing,        setGridSpacing       ] = useState(PIXELS_PER_CM); // Grid spacing in pixels
  const [lineType,           setLineType          ] = useState("linear"); // Linear, chamfer, fillet, bezier
  const [labelFontSize,      setLabelFontSize     ] = useState(14); // Font size for labels
  const [chamferLength,      setChamferLength     ] = useState(PIXELS_PER_CM / 2); // Chamfer offset in px

  // Background image state
  const [bgImageObj,      setBgImageObj]      = useState(null); // HTMLImageElement for background
  const [bgImageSizeCm,   setBgImageSizeCm]   = useState({ width:0, height:0 }); // Size in cm

  // Export dialog state
  const [exportDialog, setExportDialog] = useState({ open:false, type:null }); // { open: bool, type: 'png'|'svg' }

  // Refs
  const stageRef     = useRef(null); // Reference to Konva Stage
  const fileInputRef = useRef(null); // Hidden file input for loading image

  /**
   * On mount: load shapes from backend and register Escape key handler.
   */
  useEffect(() => {
    axios.get("http://127.0.0.1:5050/shapes")
      .then(res => setShapes(res.data))
      .catch(() => setShapes([]));

    const onKey = e => {
      if (e.key === "Escape") {
        // Clear selections and modes
        setSelectedNode(null);
        setSelectedConnection(null);
        setSelectedLabel(null);
        setActivePath([]);
        setOutlinePath([]);
        setIsDrawingOutline(false);
        setIsAddingLabel(false);
        setResistance(0);
        setTempResistance("");
        setMousePosition(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Snaps given coordinates to the nearest grid intersection if grid is enabled.
   * @param {number} x - X coordinate in pixels
   * @param {number} y - Y coordinate in pixels
   * @returns {[number, number]} Snapped [x, y]
   */
  const snapToGrid = (x, y) =>
    showGrid
      ? [Math.round(x / gridSpacing) * gridSpacing, Math.round(y / gridSpacing) * gridSpacing]
      : [x, y];

  /**
   * Calculates resistance of a trace given its points, material, and width.
   * @param {number[]} pts - Flat array of [x1,y1,x2,y2,...] in pixels
   * @param {string} material - Material key
   * @param {number} width - Width in meters
   * @returns {number} Resistance in ohms
   */
  const calculateResistance = (pts, material, width) => {
    let length = 0;
    for (let i = 0; i < pts.length - 2; i += 2) {
      length += Math.hypot(pts[i+2] - pts[i], pts[i+3] - pts[i+1]);
    }
    length /= 1000; // Convert mm to m
    const rho = materialProperties[material]?.resistivity;
    return rho ? (rho * length) / (width * traceThickness) : 0;
  };

  /**
   * Generates chamfered corner points for a given polyline.
   * @param {number[]} pts - Flat array of points
   * @returns {number[]} New flat array including chamfer offsets
   */
  const getChamferPoints = pts => {
    if (!pts || pts.length < 6) return pts;
    const out = [pts[0], pts[1]];
    const n   = pts.length / 2;
    for (let i = 1; i < n - 1; i++) {
      const x0 = pts[2*(i-1)], y0 = pts[2*(i-1)+1];
      const x1 = pts[2*i],     y1 = pts[2*i+1];
      const x2 = pts[2*(i+1)], y2 = pts[2*(i+1)+1];
      const d1 = Math.hypot(x0-x1, y0-y1), d2 = Math.hypot(x2-x1, y2-y1);
      if (d1 && d2) {
        const ux1 = (x0-x1)/d1, uy1 = (y0-y1)/d1;
        const ux2 = (x2-x1)/d2, uy2 = (y2-y1)/d2;
        out.push(x1 + ux1*chamferLength, y1 + uy1*chamferLength);
        out.push(x1 + ux2*chamferLength, y1 + uy2*chamferLength);
      } else {
        out.push(x1, y1);
      }
    }
    out.push(pts[pts.length-2], pts[pts.length-1]);
    return out;
  };

  /**
   * Generates filleted (rounded) corner points for a given polyline.
   * @param {number[]} pts - Flat array of points
   * @returns {number[]} New flat array including fillet approximations
   */
  const getFilletPoints = pts => {
    if (!pts || pts.length < 6) return pts;
    const out = [pts[0], pts[1]];
    const n   = pts.length / 2;
    for (let i = 1; i < n - 1; i++) {
      const [x0,y0,x1,y1,x2,y2] = pts.slice(2*(i-1), 2*(i+2));
      const d0  = Math.hypot(x0-x1, y0-y1), d1 = Math.hypot(x2-x1, y2-y1);
      if (d0 < 1e-6 || d1 < 1e-6) {
        out.push(x1, y1);
        continue;
      }
      const u0x = (x0-x1)/d0, u0y = (y0-y1)/d0;
      const u1x = (x2-x1)/d1, u1y = (y2-y1)/d1;
      const dot = Math.max(-1, Math.min(1, u0x*u1x + u0y*u1y));
      const ang = Math.acos(dot);
      const t   = filletRadius / Math.tan(ang/2);
      const p0x = x1 + u0x*t, p0y = y1 + u0y*t;
      const p2x = x1 + u1x*t, p2y = y1 + u1y*t;
      const bisx= u0x + u1x, bisy= u0y + u1y;
      const bl  = Math.hypot(bisx, bisy);
      if (bl < 1e-6) {
        out.push(x1, y1);
        continue;
      }
      const ubx = bisx/bl, uby = bisy/bl;
      const dist= filletRadius / Math.sin(ang/2);
      const cx  = x1 + ubx*dist, cy = y1 + uby*dist;
      let start = Math.atan2(p0y-cy, p0x-cx);
      let end   = Math.atan2(p2y-cy, p2x-cx);
      let delta = end - start;
      if (delta > Math.PI)  delta -= 2*Math.PI;
      if (delta < -Math.PI) delta += 2*Math.PI;
      const steps = Math.max(4, Math.ceil(Math.abs(delta)/(Math.PI/12)));
      for (let s = 0; s <= steps; s++) {
        const a = start + (delta*s)/steps;
        out.push(cx + Math.cos(a)*filletRadius, cy + Math.sin(a)*filletRadius);
      }
    }
    out.push(pts[pts.length-2], pts[pts.length-1]);
    return out;
  };

  /**
   * Adds a new node of given type at random position (snapped).
   * @param {string} type - "power" or "ground"
   */
  const addNode = type => {
    let x = Math.random()*600, y = Math.random()*400;
    if (showGrid) [x,y] = snapToGrid(x,y);
    const node = {
      id: Date.now(),
      type: "node",
      nodeType: type,
      x, y,
      radius: 10,
      color: type==="power"?"red":"black",
      layer: "footprint"
    };
    axios.post("http://127.0.0.1:5050/shapes", node)
      .then(() => setShapes(prev => [...prev, node]));
  };

  /**
   * Handles clicking on a node: starts or completes a connection.
   * @param {object} n - Node object
   */
  const handleNodeClick = n => {
    if (isAddingLabel) return;
    setSelectedLabel(null);
    if (!selectedNode) {
      // Begin new connection
      setSelectedNode(n);
      setSelectedConnection(null);
      setActivePath([n.x, n.y]);
    } else if (selectedNode.id !== n.id) {
      // Finish connection
      const [nx,ny] = showGrid ? snapToGrid(n.x,n.y) : [n.x,n.y];
      const pts = [...activePath, nx, ny];
      const conn = {
        id: Date.now(),
        type: "connection",
        points: pts,
        node1Id: selectedNode.id,
        node2Id: n.id,
        material: selectedMaterial,
        width: traceWidth,
        color: materialProperties[selectedMaterial].color,
        layer: "f_lig"
      };
      axios.post("http://127.0.0.1:5050/shapes", conn)
        .then(() => setShapes(prev => [...prev, conn]));
      setSelectedNode(null);
      setActivePath([]);
    }
  };

  /**
   * Selects a connection for width/resistance editing.
   * @param {object} c - Connection object
   */
  const handleConnectionClick = c => {
    setSelectedConnection(c);
    setSelectedNode(null);
    setSelectedLabel(null);
    setTraceWidth(c.width);
    const R = calculateResistance(c.points, c.material, c.width);
    setResistance(Number(R.toFixed(2)));
    setTempResistance(Number(R.toFixed(2)).toString());
  };

  /**
   * Updates trace width slider and recalculates resistance.
   * @param {number} val - New width in meters
   */
  const handleWidthChange = val => {
    setTraceWidth(val);
    if (!selectedConnection || selectedConnection.layer==="outline") return;
    const updated = { ...selectedConnection, width: val };
    setShapes(prev => prev.map(s => s.id===updated.id ? updated : s));
    setSelectedConnection(updated);
    const R = calculateResistance(updated.points, updated.material, val);
    setResistance(Number(R.toFixed(2)));
    setTempResistance(Number(R.toFixed(2)).toString());
  };

  /**
   * Handles user editing resistance; recalculates width accordingly.
   */
  const handleResistanceBlur = () => {
    if (!selectedConnection || selectedConnection.layer==="outline") return;
    const Rval = parseFloat(tempResistance);
    if (isNaN(Rval) || Rval <= 0) {
      setTempResistance(resistance.toString());
      return;
    }
    let length = 0;
    selectedConnection.points.forEach((_,i,arr) => {
      if (i%2===0 && i < arr.length-2) {
        length += Math.hypot(arr[i+2]-arr[i], arr[i+3]-arr[i+1]);
      }
    });
    length /= 1000;
    const rho = materialProperties[selectedConnection.material].resistivity;
    const newW = (rho * length) / (Rval * traceThickness);
    handleWidthChange(newW);
    setResistance(Rval);
  };

  /**
   * Stage click handler: places labels, outline points, or clears selection.
   * @param {KonvaEvent} e - Konva mouse event
   */
  const handleStageClick = e => {
    const stage = e.target.getStage(); if (!stage) return;
    const pos = stage.getPointerPosition();
    const [x,y] = showGrid ? snapToGrid(pos.x,pos.y) : [pos.x,pos.y];

    if (isAddingLabel) {
      // Prompt for label text
      const txt = window.prompt("Enter label text:", "");
      if (txt) setLabels(prev => [...prev, { id:Date.now(), x, y, text:txt, fontSize:labelFontSize }]);
      setIsAddingLabel(false);
      return;
    }

    if (isDrawingOutline) {
      // Add point to outline path
      setOutlinePath(prev => [...prev, x, y]);
    } else if (selectedNode) {
      // Add intermediate point to connection
      setActivePath(prev => [...prev, x, y]);
    } else if (e.target === stage) {
      // Click on empty space clears selections
      setSelectedNode(null);
      setSelectedConnection(null);
      setSelectedLabel(null);
      setActivePath([]);
      setOutlinePath([]);
      setIsDrawingOutline(false);
    }
  };

  /**
   * Mouse move handler: updates preview lines.
   * @param {KonvaEvent} e - Konva mouse event
   */
  const handleMouseMove = e => {
    if (!selectedNode && !isDrawingOutline && !isAddingLabel) return;
    const stage = e.target.getStage(); if (!stage) return;
    setMousePosition(stage.getPointerPosition());
  };

  /**
   * Finishes drawing an outline by closing loop and saving shape.
   */
  const finishOutline = () => {
    if (outlinePath.length < 4) {
      setOutlinePath([]);
      setIsDrawingOutline(false);
      return;
    }
    const [sx,sy] = outlinePath;
    const closed = [...outlinePath, sx, sy];
    const shape = {
      id: Date.now(),
      type: "outline",
      points: closed,
      width: traceWidth,
      color: "limegreen",
      layer: "outline"
    };
    axios.post("http://127.0.0.1:5050/shapes", shape)
      .then(() => setShapes(prev => [...prev, shape]));
    setOutlinePath([]);
    setIsDrawingOutline(false);
  };

  /**
   * Deletes the currently selected node, connection, or label.
   */
  const handleDelete = () => {
    if (selectedNode) {
      const nid = selectedNode.id;
      setShapes(prev => prev.filter(s =>
        s.id !== nid &&
        !(s.type === "connection" && (s.node1Id === nid || s.node2Id === nid))
      ));
      setSelectedNode(null);
    } else if (selectedConnection) {
      setShapes(prev => prev.filter(s => s.id !== selectedConnection.id));
      setSelectedConnection(null);
    } else if (selectedLabel) {
      setLabels(prev => prev.filter(l => l.id !== selectedLabel.id));
      setSelectedLabel(null);
    }
  };

  /**
   * Handles dragging a node and updates connected lines.
   * @param {KonvaEvent} e - Konva drag event
   * @param {object} n - Node object
   */
  const handleNodeDrag = (e,n) => {
    let x = e.target.x(), y = e.target.y();
    if (showGrid) [x,y] = snapToGrid(x,y);
    setShapes(prev => prev.map(s => {
      if (s.id === n.id) return { ...s, x, y };
      if (s.type === "connection") {
        const pts = [...s.points];
        if (s.node1Id === n.id) { pts[0] = x; pts[1] = y; }
        if (s.node2Id === n.id) { pts[pts.length-2] = x; pts[pts.length-1] = y; }
        return { ...s, points: pts };
      }
      return s;
    }));
  };

  /**
   * Handles background image file selection and user-specified sizing.
   * @param {Event} e - File input change event
   */
  const handleImageUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    img.onload = () => {
      const wcm = parseFloat(window.prompt("Image width (cm):", "10")) || 0;
      const hcm = parseFloat(window.prompt("Image height (cm):", "10")) || 0;
      setBgImageObj(img);
      setBgImageSizeCm({ width: wcm, height: hcm });
    };
  };

  /**
   * Renders grid lines and numeric labels.
   * Labels only on every other line if spacing ≤ 20px.
   */
  const drawGrid = () => {
    const lines = [];
    const skipOdd = gridSpacing <= 20;
    for (let x = 0; x <= 600; x += gridSpacing) {
      lines.push(
        <Line key={`gx${x}`} points={[x,0,x,400]} stroke="#ddd" strokeWidth={0.5}/>
      );
      const idx = Math.round(x / gridSpacing);
      if (!skipOdd || idx % 2 === 0) {
        const cm = (x/PIXELS_PER_CM).toFixed(1).replace(/\.0$/,"");
        lines.push(
          <Text key={`gxlabel${x}`} x={x+2} y={0} text={cm} fontSize={12}/>
        );
      }
    }
    for (let y = 0; y <= 400; y += gridSpacing) {
      lines.push(
        <Line key={`gy${y}`} points={[0,y,600,y]} stroke="#ddd" strokeWidth={0.5}/>
      );
      const idx = Math.round(y / gridSpacing);
      if (!skipOdd || idx % 2 === 0) {
        const cm = (y/PIXELS_PER_CM).toFixed(1).replace(/\.0$/,"");
        lines.push(
          <Text key={`gylabel${y}`} x={0} y={y+2} text={cm} fontSize={12}/>
        );
      }
    }
    return lines;
  };

  /**
   * Initiates export dialog for PNG or SVG.
   * @param {'png'|'svg'} type - Export format
   */
  const handleExport = type => {
    setExportDialog({ open: true, type });
  };

  /**
   * Performs the actual export after user responds to dialog.
   * Temporarily toggles background image layer based on includeBg.
   * @param {'png'|'svg'} type
   * @param {boolean} includeBg
   */
  const performExport = (type, includeBg) => {
    const prev = activeLayers.imageLayer;
    if (!includeBg) {
      setActiveLayers(l => ({ ...l, imageLayer: false }));
    }
    setExportDialog({ open:false, type:null });
    setTimeout(() => {
      if (type === "png") {
        const uri    = stageRef.current.toDataURL();
        const link   = document.createElement("a");
        link.download = "diagram.png";
        link.href     = uri;
        link.click();
      } else if (type === "svg") {
        let svg = `<?xml version="1.0" encoding="utf-8"?><svg width="${STAGE_WIDTH_CM}cm" height="${STAGE_HEIGHT_CM}cm" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">`;
        shapes.filter(s=>s.layer==="footprint").forEach(n=>{
          svg += `<circle cx="${n.x}" cy="${n.y}" r="${n.radius}" fill="${n.color}"/>`;
        });
        shapes.filter(s=>s.layer==="f_lig"||s.layer==="outline").forEach(t=>{
          const color = t.layer==="outline"?"limegreen":t.color;
          const w     = (t.width||0.005)*1000;
          const pts   = t.points.filter((_,i)=>i%2===0)
                            .map((_,i)=>`${t.points[2*i]},${t.points[2*i+1]}`)
                            .join(" ");
          svg += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round"/>`;
        });
        labels.forEach(l=>{
          svg += `<text x="${l.x}" y="${l.y+l.fontSize}" font-size="${l.fontSize}" fill="black">${l.text}</text>`;
        });
        svg += `</svg>`;
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url  = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = "diagram.svg";
        link.href     = url;
        link.click();
        URL.revokeObjectURL(url);
      }
      // restore background layer visibility
      setActiveLayers(l => ({ ...l, imageLayer: prev }));
    }, 100);
  };

  return (
    <div>
      <h2>ECAD Tool</h2>

      {/* Export confirmation modal */}
      {exportDialog.open && (
        <div className="modal-overlay">
          <div className="modal">
            <p>Include background image in export?</p>
            <button onClick={() => performExport(exportDialog.type, true)}>Yes</button>
            <button onClick={() => performExport(exportDialog.type, false)}>No</button>
          </div>
        </div>
      )}

      <div className="controls">
        {/* Top row buttons */}
        <div className="controls-row">
          <button onClick={() => handleExport("png")}>Export PNG</button>
          <button onClick={() => handleExport("svg")}>Export SVG</button>
          <button onClick={() => addNode("power")}>Add Power Node</button>
          <button onClick={() => addNode("ground")}>Add Ground Node</button>
          <button
            onClick={handleDelete}
            disabled={!selectedNode && !selectedConnection && !selectedLabel}
          >
            Delete
          </button>
          <button onClick={() => isDrawingOutline ? finishOutline() : setIsDrawingOutline(true)}>
            {isDrawingOutline ? "Finish Outline" : "Add Outline"}
          </button>
          <button
            onClick={() => {
              setIsAddingLabel(true);
              setSelectedNode(null);
              setSelectedConnection(null);
              setSelectedLabel(null);
            }}
          >
            Add Label
          </button>
          <button onClick={() => fileInputRef.current.click()}>Load Image</button>
          {/* Hidden file input for background image */}
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleImageUpload}
          />
        </div>

        {/* Layer toggles */}
        <div className="controls-row">
          <label>
            <input
              type="checkbox"
              checked={activeLayers.footprint}
              onChange={() => setActiveLayers(l => ({ ...l, footprint: !l.footprint }))}
            /> Footprint
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeLayers.f_lig}
              onChange={() => setActiveLayers(l => ({ ...l, f_lig: !l.f_lig }))}
            /> F.LIG
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeLayers.outlineLayer}
              onChange={() => setActiveLayers(l => ({ ...l, outlineLayer: !l.outlineLayer }))}
            /> Outline
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeLayers.labelLayer}
              onChange={() => setActiveLayers(l => ({ ...l, labelLayer: !l.labelLayer }))}
            /> Labels
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeLayers.imageLayer}
              onChange={() => setActiveLayers(l => ({ ...l, imageLayer: !l.imageLayer }))}
            /> Background Image
          </label>
          <label>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={() => setShowGrid(g => !g)}
            /> Show Grid
          </label>
        </div>

        {/* Settings sliders & dropdowns */}
        <div className="controls-row">
          <label>
            Grid Spacing: {gridSpacing.toFixed(0)}px
            <input
              type="range"
              min={5}
              max={PIXELS_PER_CM * 2}
              step={1}
              value={gridSpacing}
              onChange={e => setGridSpacing(Number(e.target.value))}
            />
          </label>
          <label>
            Material:
            <select
              value={selectedMaterial}
              onChange={e => setSelectedMaterial(e.target.value)}
            >
              {Object.keys(materialProperties).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Line Type:
            <select
              value={lineType}
              onChange={e => setLineType(e.target.value)}
            >
              <option value="linear">Linear</option>
              <option value="chamfer">Chamfer</option>
              <option value="fillet">Fillet</option>
              <option value="bezier">Bezier</option>
            </select>
          </label>
          <label>
            Chamfer Length: {chamferLength.toFixed(0)}px
            <input
              type="range"
              min={0}
              max={gridSpacing/2}
              step={1}
              value={chamferLength}
              onChange={e => setChamferLength(Number(e.target.value))}
            />
          </label>
          <label>
            Font Size:
            <select
              value={labelFontSize}
              onChange={e => setLabelFontSize(Number(e.target.value))}
            >
              {[12,14,16,18,20,24].map(sz => (
                <option key={sz} value={sz}>{sz}</option>
              ))}
            </select>
          </label>
          <label>
            Trace Width:
            <input
              type="range"
              min={0.001}
              max={0.05}
              step={0.001}
              disabled={!selectedConnection || selectedConnection.layer==="outline"}
              value={traceWidth}
              onChange={e => handleWidthChange(Number(e.target.value))}
            />
          </label>
          <label>
            Resistance:
            <input
              type="text"
              value={tempResistance}
              disabled={!selectedConnection || selectedConnection.layer==="outline"}
              onChange={e => setTempResistance(e.target.value)}
              onBlur={handleResistanceBlur}
            />
          </label>
        </div>
      </div>

      {/* Main Konva stage */}
      <Stage
        ref={stageRef}           /* Stage ref for export */
        width={600}              /* Canvas width in px */
        height={400}             /* Canvas height in px */
        onClick={handleStageClick} /* Handle stage clicks */
        onMouseMove={handleMouseMove} /* Handle mouse movement */
        style={{ border: "1px solid #ccc" }} /* Canvas border */
      >
        {/* Background Image Layer */}
        {activeLayers.imageLayer && bgImageObj && (
          <Layer>
            <KonvaImage
              image={bgImageObj} /* HTMLImageElement source */
              x={0}
              y={0}
              width={bgImageSizeCm.width * PIXELS_PER_CM}   /* Width in px */
              height={bgImageSizeCm.height * PIXELS_PER_CM} /* Height in px */
            />
          </Layer>
        )}

        {/* Grid Layer */}
        {showGrid && <Layer>{drawGrid()}</Layer>}

        {/* Labels Layer */}
        {activeLayers.labelLayer && (
          <Layer>
            {labels.map(lbl => {
              const pad = 4;
              const w   = lbl.text.length * (lbl.fontSize * 0.6) + pad*2;
              const h   = lbl.fontSize + pad*2;
              const isSel = selectedLabel?.id === lbl.id;
              return (
                <React.Fragment key={lbl.id}>
                  {isSel && <Rect x={lbl.x-pad} y={lbl.y-pad} width={w} height={h} stroke="black" strokeWidth={1}/>}
                  <Text
                    x={lbl.x} y={lbl.y}
                    text={lbl.text} fontSize={lbl.fontSize} fill="black"
                    onClick={() => {
                      setSelectedLabel(lbl);
                      setSelectedNode(null);
                      setSelectedConnection(null);
                    }}
                  />
                </React.Fragment>
              );
            })}
          </Layer>
        )}

        {/* F.LIG Layer */}
        {activeLayers.f_lig && (
          <Layer>
            {shapes.filter(s => s.layer==="f_lig").map(line => {
              const pts = lineType === "chamfer"
                ? getChamferPoints(line.points)
                : lineType === "fillet"
                  ? getFilletPoints(line.points)
                  : line.points;
              const baseW = (line.width||0.005)*1000;
              const isSel = selectedConnection?.id === line.id;
              const common = {
                points: pts,
                hitStrokeWidth: HIT_STROKE,
                lineJoin: lineType==="linear"?"miter":"round",
                strokeCap: lineType==="linear"?undefined:"round",
                bezier: lineType==="bezier",
                tension: lineType==="bezier"?1:undefined,
                onClick: () => handleConnectionClick(line)
              };
              return (
                <React.Fragment key={line.id}>
                  {isSel && <Line {...common} stroke="black" strokeWidth={baseW+2}/>}
                  <Line {...common} stroke={line.color} strokeWidth={baseW}/>
                </React.Fragment>
              );
            })}
            {selectedNode && activePath.length>0 && (
              <>
                <Line points={activePath} stroke="green" strokeWidth={2} dash={[5,5]}/>
                {mousePosition && (
                  <Line points={[...activePath,mousePosition.x,mousePosition.y]} stroke="green" strokeWidth={2} dash={[5,5]}/>
                )}
              </>
            )}
          </Layer>
        )}

        {/* Footprint Layer */}
        {activeLayers.footprint && (
          <Layer>
            {shapes.filter(s => s.layer==="footprint").map(n => (
              <Circle
                key={n.id}
                x={n.x} y={n.y}
                radius={n.radius}
                fill={n.color}
                stroke={selectedNode?.id===n.id?"black":"transparent"}
                strokeWidth={3}
                hitStrokeWidth={HIT_STROKE}
                draggable
                onClick={() => handleNodeClick(n)}
                onDragMove={e => handleNodeDrag(e, n)}
              />
            ))}
          </Layer>
        )}

        {/* Outline Layer */}
        {activeLayers.outlineLayer && (
          <Layer>
            {shapes.filter(s => s.layer==="outline").map(o => {
              const pts = lineType === "chamfer"
                ? getChamferPoints(o.points)
                : lineType === "fillet"
                  ? getFilletPoints(o.points)
                  : o.points;
              const w     = (o.width||0.005)*1000;
              const isSel = selectedConnection?.id === o.id;
              const common = {
                points: pts,
                hitStrokeWidth: HIT_STROKE,
                lineJoin: lineType==="linear"?"miter":"round",
                strokeCap: lineType==="linear"?undefined:"round",
                bezier: lineType==="bezier",
                tension: lineType==="bezier"?1:undefined,
                onClick: () => handleConnectionClick(o)
              };
              return (
                <React.Fragment key={o.id}>
                  {isSel && <Line {...common} stroke="black" strokeWidth={w+2}/>}
                  <Line {...common} stroke="limegreen" strokeWidth={w}/>
                </React.Fragment>
              );
            })}
            {isDrawingOutline && outlinePath.length>0 && (
              <>
                <Line
                  points={outlinePath}
                  stroke="limegreen"
                  strokeWidth={traceWidth*1000}
                  dash={[5,5]}
                  lineJoin="miter"
                  strokeCap="butt"
                />
                {mousePosition && (
                  <Line
                    points={[...outlinePath,mousePosition.x,mousePosition.y]}
                    stroke="limegreen"
                    strokeWidth={traceWidth*1000}
                    dash={[5,5]}
                    lineJoin="miter"
                    strokeCap="butt"
                  />
                )}
              </>
            )}
          </Layer>
        )}
      </Stage>
    </div>
  );
};

export default App;

export default App;

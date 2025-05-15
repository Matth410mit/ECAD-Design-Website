import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Circle, Line, Text, Rect } from "react-konva";
import axios from "axios";
import "./App.css";

const App = () => {
  // Constants
  const traceThickness = 0.000035;
  const filletRadius = 15;
  const HIT_STROKE = 40;

  // Material properties lookup
  const materialProperties = {
    copper: { color: "orange", resistivity: 1.68e-8 },
    aluminum: { color: "gray", resistivity: 2.82e-8 },
    gold: { color: "yellow", resistivity: 2.44e-8 },
    silver: { color: "lightgray", resistivity: 1.59e-8 }
  };

  // State
  const [shapes, setShapes] = useState([]);
  const [labels, setLabels] = useState([]);
  const [activeLayers, setActiveLayers] = useState({ footprint: true, f_lig: true, outlineLayer: true, labelLayer: true });
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [isDrawingOutline, setIsDrawingOutline] = useState(false);
  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [outlinePath, setOutlinePath] = useState([]);
  const [activePath, setActivePath] = useState([]);
  const [mousePosition, setMousePosition] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState("copper");
  const [traceWidth, setTraceWidth] = useState(0.005);
  const [resistance, setResistance] = useState(0);
  const [tempResistance, setTempResistance] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  const [gridSpacing, setGridSpacing] = useState(20);
  const [lineType, setLineType] = useState("linear");
  const [labelFontSize, setLabelFontSize] = useState(14);
  const [chamferLength, setChamferLength] = useState(gridSpacing / 2);

  const stageRef = useRef(null);

  // Load shapes from backend
  useEffect(() => {
    axios.get("http://127.0.0.1:5050/shapes")
      .then(res => setShapes(res.data))
      .catch(() => setShapes([]));
    const onKey = e => {
      if (e.key === "Escape") {
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

  // Snap coordinates to grid
  const snapToGrid = (x, y) =>
    showGrid
      ? [Math.round(x / gridSpacing) * gridSpacing, Math.round(y / gridSpacing) * gridSpacing]
      : [x, y];

  // Calculate resistance for a connection
  const calculateResistance = (pts, material, width) => {
    let length = 0;
    for (let i = 0; i < pts.length - 2; i += 2) {
      length += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
    }
    length /= 1000; // mm -> m
    const rho = materialProperties[material]?.resistivity;
    return rho ? (rho * length) / (width * traceThickness) : 0;
  };

  // Generate chamfered corner points
  const getChamferPoints = pts => {
    if (!pts || pts.length < 6) return pts;
    const out = [pts[0], pts[1]];
    const n = pts.length / 2;
    for (let i = 1; i < n - 1; i++) {
      const x0 = pts[2 * (i - 1)], y0 = pts[2 * (i - 1) + 1];
      const x1 = pts[2 * i], y1 = pts[2 * i + 1];
      const x2 = pts[2 * (i + 1)], y2 = pts[2 * (i + 1) + 1];
      const d1 = Math.hypot(x0 - x1, y0 - y1);
      const d2 = Math.hypot(x2 - x1, y2 - y1);
      if (d1 && d2) {
        const ux1 = (x0 - x1) / d1, uy1 = (y0 - y1) / d1;
        const ux2 = (x2 - x1) / d2, uy2 = (y2 - y1) / d2;
        out.push(x1 + ux1 * chamferLength, y1 + uy1 * chamferLength);
        out.push(x1 + ux2 * chamferLength, y1 + uy2 * chamferLength);
      } else {
        out.push(x1, y1);
      }
    }
    out.push(pts[pts.length - 2], pts[pts.length - 1]);
    return out;
  };

  // Generate filleted corner points
  const getFilletPoints = pts => {
    if (!pts || pts.length < 6) return pts;
    const out = [pts[0], pts[1]];
    const n = pts.length / 2;
    for (let i = 1; i < n - 1; i++) {
      const [x0, y0, x1, y1, x2, y2] = pts.slice(2 * (i - 1), 2 * (i + 2));
      const d0 = Math.hypot(x0 - x1, y0 - y1), d1 = Math.hypot(x2 - x1, y2 - y1);
      if (d0 < 1e-6 || d1 < 1e-6) { out.push(x1, y1); continue; }
      const u0x = (x0 - x1) / d0, u0y = (y0 - y1) / d0;
      const u1x = (x2 - x1) / d1, u1y = (y2 - y1) / d1;
      const dot = u0x * u1x + u0y * u1y;
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
      const t = filletRadius / Math.tan(ang / 2);
      const p0x = x1 + u0x * t, p0y = y1 + u0y * t;
      const p2x = x1 + u1x * t, p2y = y1 + u1y * t;
      const bisx = u0x + u1x, bisy = u0y + u1y;
      const bl = Math.hypot(bisx, bisy);
      if (bl < 1e-6) { out.push(x1, y1); continue; }
      const ubx = bisx / bl, uby = bisy / bl;
      const dist = filletRadius / Math.sin(ang / 2);
      const cx = x1 + ubx * dist, cy = y1 + uby * dist;
      let start = Math.atan2(p0y - cy, p0x - cx);
      let end = Math.atan2(p2y - cy, p2x - cx);
      let delta = end - start;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      const steps = Math.max(4, Math.ceil(Math.abs(delta) / (Math.PI / 12)));
      for (let s = 0; s <= steps; s++) {
        const a = start + (delta * s) / steps;
        out.push(cx + Math.cos(a) * filletRadius, cy + Math.sin(a) * filletRadius);
      }
    }
    out.push(pts[pts.length - 2], pts[pts.length - 1]);
    return out;
  };

  // Add node to canvas
  const addNode = type => {
    let x = Math.random() * 500, y = Math.random() * 300;
    if (showGrid) [x, y] = snapToGrid(x, y);
    const node = { id: Date.now(), type: "node", nodeType: type, x, y, radius: 10, color: type === "power" ? "red" : "black", layer: "footprint" };
    axios.post("http://127.0.0.1:5050/shapes", node).then(() => setShapes(prev => [...prev, node]));
  };

  // Handle node click for connections
  const handleNodeClick = n => {
    if (isAddingLabel) return;
    setSelectedLabel(null);
    if (!selectedNode) {
      setSelectedNode(n);
      setSelectedConnection(null);
      setActivePath([n.x, n.y]);
    } else if (selectedNode.id !== n.id) {
      const [nx, ny] = showGrid ? snapToGrid(n.x, n.y) : [n.x, n.y];
      const pts = [...activePath, nx, ny];
      const conn = { id: Date.now(), type: "connection", points: pts, node1Id: selectedNode.id, node2Id: n.id, material: selectedMaterial, width: traceWidth, color: materialProperties[selectedMaterial].color, layer: "f_lig" };
      axios.post("http://127.0.0.1:5050/shapes", conn).then(() => setShapes(prev => [...prev, conn]));
      setSelectedNode(null);
      setActivePath([]);
    }
  };

  // Select connection for editing
  const handleConnectionClick = c => {
    setSelectedConnection(c);
    setSelectedNode(null);
    setSelectedLabel(null);
    setTraceWidth(c.width);
    const R = calculateResistance(c.points, c.material, c.width);
    setResistance(Number(R.toFixed(2)));
    setTempResistance(Number(R.toFixed(2)).toString());
  };

  // Trace width slider change
  const handleWidthChange = val => {
    setTraceWidth(val);
    if (! selectedConnection || selectedConnection.layer === "outline") return;
    const updated = { ...selectedConnection, width: val };
    setShapes(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelectedConnection(updated);
    const R = calculateResistance(updated.points, updated.material, val);
    setResistance(Number(R.toFixed(2)));
    setTempResistance(Number(R.toFixed(2)).toString());
  };

  // Resistance input blur
  const handleResistanceBlur = () => {
    if (! selectedConnection || selectedConnection.layer === "outline") return;
    const Rval = parseFloat(tempResistance);
    if (isNaN(Rval) || Rval <= 0) { setTempResistance(resistance.toString()); return; }
    let length = 0;
    selectedConnection.points.forEach((_, i, arr) => {
      if (i % 2 === 0 && i < arr.length - 2) length += Math.hypot(arr[i+2] - arr[i], arr[i+3] - arr[i+1]);
    });
    length /= 1000;
    const rho = materialProperties[selectedConnection.material].resistivity;
    const newW = (rho * length) / (Rval * traceThickness);
    handleWidthChange(newW);
    setResistance(Rval);
  };

  // Stage click for labels/outlines
  const handleStageClick = e => {
    const stage = e.target.getStage(); if (!stage) return;
    const pos = stage.getPointerPosition();
    const [x,y] = showGrid ? snapToGrid(pos.x, pos.y) : [pos.x,pos.y];
    if (isAddingLabel) {
      const txt = window.prompt("Enter label text:", "");
      if (txt) setLabels(prev => [...prev, { id: Date.now(), x, y, text: txt, fontSize: labelFontSize }]);
      setIsAddingLabel(false);
      return;
    }
    if (isDrawingOutline) {
      setOutlinePath(prev => [...prev, x, y]);
    } else if (selectedNode) {
      setActivePath(prev => [...prev, x, y]);
    } else if (e.target === stage) {
      setSelectedNode(null);
      setSelectedConnection(null);
      setSelectedLabel(null);
      setActivePath([]);
      setOutlinePath([]);
      setIsDrawingOutline(false);
    }
  };

  // Mouse move for preview lines
  const handleMouseMove = e => {
    if (! selectedNode && ! isDrawingOutline && ! isAddingLabel) return;
    const stage = e.target.getStage(); if (!stage) return;
    setMousePosition(stage.getPointerPosition());
  };

  // Finish outline drawing
  const finishOutline = () => {
    if (outlinePath.length < 4) { setOutlinePath([]); setIsDrawingOutline(false); return; }
    const [sx,sy] = outlinePath;
    const closed = [...outlinePath, sx, sy];
    const shape = { id: Date.now(), type: "outline", points: closed, width: traceWidth, color: "limegreen", layer: "outline" };
    axios.post("http://127.0.0.1:5050/shapes", shape).then(() => setShapes(prev => [...prev, shape]));
    setOutlinePath([]);
    setIsDrawingOutline(false);
  };

  // Delete selected element
  const handleDelete = () => {
    if (selectedNode) {
      const nid = selectedNode.id;
      setShapes(prev => prev.filter(s => s.id !== nid && !(s.type === "connection" && (s.node1Id === nid || s.node2Id === nid))));
      setSelectedNode(null);
    } else if (selectedConnection) {
      setShapes(prev => prev.filter(s => s.id !== selectedConnection.id));
      setSelectedConnection(null);
    } else if (selectedLabel) {
      setLabels(prev => prev.filter(l => l.id !== selectedLabel.id));
      setSelectedLabel(null);
    }
  };

  // Drag node updates connections
  const handleNodeDrag = (e,n) => {
    let x = e.target.x(), y = e.target.y();
    if (showGrid) [x,y] = snapToGrid(x,y);
    setShapes(prev => prev.map(s => {
      if (s.id === n.id) return {...s,x,y};
      if (s.type === "connection") {
        const pts = [...s.points];
        if (s.node1Id === n.id) { pts[0] = x; pts[1] = y; }
        if (s.node2Id === n.id) { pts[pts.length-2] = x; pts[pts.length-1] = y; }
        return {...s,points:pts};
      }
      return s;
    }));
  };

  // Render grid lines
  const drawGrid = () => {
    const lines = [];
    for (let i=0; i<=600; i+=gridSpacing) lines.push(<Line key={`gx${i}`} points={[i,0,i,400]} stroke="#ddd" strokeWidth={0.5}/>);
    for (let j=0; j<=400; j+=gridSpacing) lines.push(<Line key={`gy${j}`} points={[0,j,600,j]} stroke="#ddd" strokeWidth={0.5}/>);
    return lines;
  };

  // Export PNG bitmap
  const exportPNG = () => {
    const uri = stageRef.current.toDataURL();
    const link = document.createElement("a");
    link.download = "diagram.png";
    link.href = uri;
    link.click();
  };

    // Export SVG by rebuilding true vector from state
  const exportSVG = () => {
    const width = 600;
    const height = 400;
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
` +
              `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
`;

    // Footprint nodes
    shapes.filter(s => s.layer === 'footprint').forEach(node => {
      svg += `  <circle cx="${node.x}" cy="${node.y}" r="${node.radius}" fill="${node.color}" />
`;
    });

    // F.LIG and outline traces
    shapes.filter(s => s.layer === 'f_lig' || s.layer === 'outline').forEach(trace => {
      const color = trace.layer === 'outline' ? 'limegreen' : trace.color;
      const strokeWidth = ((trace.width || 0.005) * 1000).toFixed(2);
      const pts = trace.points.reduce((acc, v, i) => {
        if (i % 2 === 0) acc.push(`${trace.points[i]},${trace.points[i+1]}`);
        return acc;
      }, []).join(' ');
      svg += `  <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" />
`;
    });

    // Labels
    labels.forEach(lbl => {
      svg += `  <text x="${lbl.x}" y="${lbl.y + lbl.fontSize}" font-size="${lbl.fontSize}" fill="black">${lbl.text}</text>
`;
    });

    svg += '</svg>';

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'diagram.svg';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Main render
  return (
    <div>
      <h2>ECAD Tool</h2>
      <div className="controls">
        <div className="controls-row">
          <button onClick={exportPNG}>Export PNG</button>
          <button onClick={exportSVG}>Export SVG</button>
          <button onClick={()=>addNode("power")}>Add Power Node</button>
          <button onClick={()=>addNode("ground")}>Add Ground Node</button>
          <button onClick={handleDelete} disabled={!selectedNode&&!selectedConnection&&!selectedLabel}>Delete Selected</button>
          <button onClick={()=>isDrawingOutline?finishOutline():setIsDrawingOutline(true)}>
            {isDrawingOutline?"Finish Outline":"Add Outline"}
          </button>
          <button onClick={()=>{setIsAddingLabel(true);setSelectedNode(null);setSelectedConnection(null);setSelectedLabel(null);}}>
            Add Label
          </button>
        </div>
        <div className="controls-row">
          <label><input type="checkbox" checked={activeLayers.footprint} onChange={()=>setActiveLayers(l=>({...l,footprint:!l.footprint}))}/> Footprint</label>
          <label><input type="checkbox" checked={activeLayers.f_lig} onChange={()=>setActiveLayers(l=>({...l,f_lig:!l.f_lig}))}/> F.LIG</label>
          <label><input type="checkbox" checked={activeLayers.outlineLayer} onChange={()=>setActiveLayers(l=>({...l,outlineLayer:!l.outlineLayer}))}/> Outline</label>
          <label><input type="checkbox" checked={activeLayers.labelLayer} onChange={()=>setActiveLayers(l=>({...l,labelLayer:!l.labelLayer}))}/> Labels</label>
          <label><input type="checkbox" checked={showGrid} onChange={()=>setShowGrid(g=>!g)}/> Show Grid</label>
        </div>
        <div className="controls-row">
          <label>Grid Spacing: {gridSpacing}px<input type="range" min={10} max={50} value={gridSpacing} onChange={e=>setGridSpacing(Number(e.target.value))}/></label>
          <label>Material<select value={selectedMaterial} onChange={e=>setSelectedMaterial(e.target.value)}>{Object.keys(materialProperties).map(m=><option key={m} value={m}>{m}</option>)}</select></label>
          <label>Line Type<select value={lineType} onChange={e=>setLineType(e.target.value)}><option value="linear">Linear</option><option value="chamfer">Chamfer</option><option value="fillet">Fillet</option><option value="bezier">Bezier</option></select></label>
          <label>Chamfer Length: {chamferLength}px<input type="range" min={0} max={gridSpacing/2} step={1} value={chamferLength} onChange={e=>setChamferLength(Number(e.target.value))}/></label>
          <label>Font Size<select value={labelFontSize} onChange={e=>setLabelFontSize(Number(e.target.value))}>{[12,14,16,18,20,24].map(sz=><option key={sz} value={sz}>{sz}</option>)}</select></label>
          <label>Trace Width<input type="range" min={0.001} max={0.05} step={0.001} disabled={!selectedConnection||selectedConnection.layer==='outline'} value={traceWidth} onChange={e=>handleWidthChange(Number(e.target.value))}/></label>
          <label>Resistance (Ω)<input type="text" value={tempResistance} disabled={!selectedConnection||selectedConnection.layer==='outline'} onChange={e=>setTempResistance(e.target.value)} onBlur={handleResistanceBlur}/></label>
        </div>
      </div>
      <Stage ref={stageRef} width={600} height={400} onClick={handleStageClick} onMouseMove={handleMouseMove} style={{border:'1px solid #ccc'}}>
        {showGrid && <Layer>{drawGrid()}</Layer>}
        {activeLayers.labelLayer && <Layer>{labels.map(lbl=>{const pad=4;const w=lbl.text.length*(lbl.fontSize*0.6)+pad*2;const h=lbl.fontSize+pad*2;const isSel=selectedLabel?.id===lbl.id;return(<React.Fragment key={lbl.id}>{isSel&&<Rect x={lbl.x-pad} y={lbl.y-pad} width={w} height={h} stroke="black" strokeWidth={1}/>}<Text x={lbl.x} y={lbl.y} text={lbl.text} fontSize={lbl.fontSize} fill="black" onClick={()=>{setSelectedLabel(lbl);setSelectedNode(null);setSelectedConnection(null)}}/></React.Fragment>);} )}</Layer>}
        {activeLayers.f_lig && <Layer>{shapes.filter(s=>s.layer==='f_lig').map(line=>{const pts=lineType==='chamfer'?getChamferPoints(line.points):lineType==='fillet'?getFilletPoints(line.points):line.points;const baseW=(line.width||0.005)*1000;const isSel=selectedConnection?.id===line.id;const common={points:pts,hitStrokeWidth:HIT_STROKE,lineJoin:lineType==='linear'?'miter':'round',strokeCap:lineType==='linear'?undefined:'round',bezier:lineType==='bezier',tension:lineType==='bezier'?1:undefined,onClick:()=>handleConnectionClick(line)};return(<React.Fragment key={line.id}>{isSel&&<Line {...common} stroke="black" strokeWidth={baseW+2}/>}<Line {...common} stroke={line.color} strokeWidth={baseW}/></React.Fragment>);} )}{selectedNode&&activePath.length>0&&(<><Line points={activePath} stroke="green" strokeWidth={2} dash={[5,5]}/>{mousePosition&&<Line points={[...activePath,mousePosition.x,mousePosition.y]} stroke="green" strokeWidth={2} dash={[5,5]}/>}</>)}</Layer>}
        {activeLayers.footprint && <Layer>{shapes.filter(s=>s.layer==='footprint').map(n=><Circle key={n.id} x={n.x} y={n.y} radius={n.radius} fill={n.color} stroke={selectedNode?.id===n.id?'black':'transparent'} strokeWidth={3} hitStrokeWidth={HIT_STROKE} draggable onClick={()=>handleNodeClick(n)} onDragMove={e=>handleNodeDrag(e,n)}/> )}</Layer>}
        {activeLayers.outlineLayer && <Layer>{shapes.filter(s=>s.layer==='outline').map(o=>{const pts=lineType==='chamfer'?getChamferPoints(o.points):lineType==='fillet'?getFilletPoints(o.points):o.points;const w=(o.width||0.005)*1000;const isSel=selectedConnection?.id===o.id;const common={points:pts,hitStrokeWidth:HIT_STROKE,lineJoin:lineType==='linear'?'miter':'round',strokeCap:lineType==='linear'?undefined:'round',bezier:lineType==='bezier',tension:lineType==='bezier'?1:undefined,onClick:()=>handleConnectionClick(o)};return(<React.Fragment key={o.id}>{isSel&&<Line {...common} stroke="black" strokeWidth={w+2}/>}<Line {...common} stroke="limegreen" strokeWidth={w}/></React.Fragment>);} )}{isDrawingOutline&&outlinePath.length>0&&(<><Line points={outlinePath} stroke="limegreen" strokeWidth={traceWidth*1000} dash={[5,5]} lineJoin="miter" strokeCap="butt"/>{mousePosition&&<Line points={[...outlinePath,mousePosition.x,mousePosition.y]} stroke="limegreen" strokeWidth={traceWidth*1000} dash={[5,5]} lineJoin="miter" strokeCap="butt"/>}</>)}</Layer>}
      </Stage>
    </div>
  );
};

export default App;

export default App;

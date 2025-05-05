// src/App.js
import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Circle, Line, Text, Rect } from "react-konva";
import axios from "axios";
import "./App.css";

const App = () => {
  const [shapes, setShapes] = useState([]);
  const [labels, setLabels] = useState([]);
  const [activeLayers, setActiveLayers] = useState({
    footprint: true,
    f_lig: true,
    outlineLayer: true,
    labelLayer: true
  });
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
  const stageRef = useRef(null);

  const traceThickness = 0.000035;
  const chamferOffset = 15;
  const filletRadius = 15;
  const HIT_STROKE = 40;

  const materialProperties = {
    copper: { color: "orange", resistivity: 1.68e-8 },
    aluminum: { color: "gray", resistivity: 2.82e-8 },
    gold: { color: "yellow", resistivity: 2.44e-8 },
    silver: { color: "lightgray", resistivity: 1.59e-8 }
  };

  useEffect(() => {
    axios.get("http://127.0.0.1:5050/shapes").then((res) => setShapes(res.data));
    const onKey = (e) => {
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

  const snapToGrid = (x, y) => [
    Math.round(x / gridSpacing) * gridSpacing,
    Math.round(y / gridSpacing) * gridSpacing
  ];

  const calculateResistance = (pts, material, width) => {
    if (!pts || pts.length < 4) return 0;
    let length = 0;
    for (let i = 0; i < pts.length - 2; i += 2) {
      length += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
    }
    length /= 1000;
    const rho = materialProperties[material]?.resistivity;
    if (!rho) return 0;
    return (rho * length) / (width * traceThickness);
  };

  const getChamferPoints = (pts) => {
    if (!pts || pts.length < 6) return pts;
    const out = [pts[0], pts[1]];
    const n = pts.length / 2;
    for (let i = 1; i < n - 1; i++) {
      const x0 = pts[2 * (i - 1)],
        y0 = pts[2 * (i - 1) + 1];
      const x1 = pts[2 * i],
        y1 = pts[2 * i + 1];
      const x2 = pts[2 * (i + 1)],
        y2 = pts[2 * (i + 1) + 1];
      const dx1 = x0 - x1,
        dy1 = y0 - y1;
      const dx2 = x2 - x1,
        dy2 = y2 - y1;
      const l1 = Math.hypot(dx1, dy1),
        l2 = Math.hypot(dx2, dy2);
      const ux1 = dx1 / l1,
        uy1 = dy1 / l1;
      const ux2 = dx2 / l2,
        uy2 = dy2 / l2;
      out.push(x1 + ux1 * chamferOffset, y1 + uy1 * chamferOffset);
      out.push(x1 + ux2 * chamferOffset, y1 + uy2 * chamferOffset);
    }
    out.push(pts[pts.length - 2], pts[pts.length - 1]);
    return out;
  };

  const getFilletPoints = (pts) => {
    if (!pts || pts.length < 6) return pts;
    const r = filletRadius;
    const out = [pts[0], pts[1]];
    const n = pts.length / 2;
    for (let i = 1; i < n - 1; i++) {
      const x0 = pts[2 * (i - 1)],
        y0 = pts[2 * (i - 1) + 1];
      const x1 = pts[2 * i],
        y1 = pts[2 * i + 1];
      const x2 = pts[2 * (i + 1)],
        y2 = pts[2 * (i + 1) + 1];
      const dx1 = x0 - x1,
        dy1 = y0 - y1;
      const dx2 = x2 - x1,
        dy2 = y2 - y1;
      const d1 = Math.hypot(dx1, dy1),
        d2 = Math.hypot(dx2, dy2);
      if (d1 < 1e-6 || d2 < 1e-6) {
        out.push(x1, y1);
        continue;
      }
      const [u1x, u1y] = [dx1 / d1, dy1 / d1];
      const [u2x, u2y] = [dx2 / d2, dy2 / d2];
      const dot = u1x * u2x + u1y * u2y;
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
      const t = r / Math.tan(angle / 2);
      const p1x = x1 + u1x * t,
        p1y = y1 + u1y * t;
      const p2x = x1 + u2x * t,
        p2y = y1 + u2y * t;
      const [bisx, bisy] = [u1x + u2x, u1y + u2y];
      const bl = Math.hypot(bisx, bisy);
      if (bl < 1e-6) {
        out.push(x1, y1);
        continue;
      }
      const [ubx, uby] = [bisx / bl, bisy / bl];
      const dist = r / Math.sin(angle / 2);
      const cx = x1 + ubx * dist,
        cy = y1 + uby * dist;
      let startAng = Math.atan2(p1y - cy, p1x - cx);
      let endAng = Math.atan2(p2y - cy, p2x - cx);
      let delta = endAng - startAng;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      const steps = Math.max(4, Math.ceil(Math.abs(delta) / (Math.PI / 12)));
      for (let s = 0; s <= steps; s++) {
        const a = startAng + (delta * s) / steps;
        out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
    }
    out.push(pts[pts.length - 2], pts[pts.length - 1]);
    return out;
  };

  const addNode = (type) => {
    let x = Math.random() * 500,
      y = Math.random() * 300;
    if (showGrid) [x, y] = snapToGrid(x, y);
    const node = {
      id: Date.now(),
      type: "node",
      nodeType: type,
      x,
      y,
      radius: 10,
      color: type === "power" ? "red" : "black",
      layer: "footprint"
    };
    axios.post("http://127.0.0.1:5050/shapes", node).then(() => setShapes((prev) => [...prev, node]));
  };

  const handleWidthChange = (val) => {
    setTraceWidth(val);
    if (!selectedConnection) return;
    const updated = { ...selectedConnection, width: val };
    setShapes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setSelectedConnection(updated);
    const R = calculateResistance(updated.points, updated.material, val);
    setResistance(Number(R.toFixed(2)));
    setTempResistance(Number(R.toFixed(2)).toString());
  };

  const handleResistanceBlur = () => {
    const Rval = parseFloat(tempResistance);
    if (!selectedConnection || isNaN(Rval) || Rval <= 0) {
      setTempResistance(resistance.toString());
      return;
    }
    let length = 0;
    selectedConnection.points.forEach((_, i, arr) => {
      if (i < arr.length - 2 && i % 2 === 0) {
        length += Math.hypot(arr[i + 2] - arr[i], arr[i + 3] - arr[i + 1]);
      }
    });
    length /= 1000;
    const rho = materialProperties[selectedConnection.material].resistivity;
    const newW = (rho * length) / (Rval * traceThickness);
    handleWidthChange(newW);
    setResistance(Rval);
  };

  const handleNodeClick = (node) => {
    if (isAddingLabel) return;
    if (!isDrawingOutline) {
      setSelectedLabel(null);
      if (!selectedNode) {
        setSelectedNode(node);
        setSelectedConnection(null);
        setActivePath([node.x, node.y]);
      } else if (selectedNode.id !== node.id) {
        const [ax, ay] = showGrid ? snapToGrid(node.x, node.y) : [node.x, node.y];
        const pts = [...activePath, ax, ay];
        const conn = {
          id: Date.now(),
          type: "connection",
          points: pts,
          node1Id: selectedNode.id,
          node2Id: node.id,
          material: selectedMaterial,
          width: traceWidth,
          color: materialProperties[selectedMaterial].color,
          layer: "f_lig"
        };
        axios.post("http://127.0.0.1:5050/shapes", conn).then(() => setShapes((prev) => [...prev, conn]));
        setSelectedNode(null);
        setActivePath([]);
      }
    }
  };

  const handleConnectionClick = (conn) => {
    setSelectedConnection(conn);
    setSelectedNode(null);
    setSelectedLabel(null);
    setTraceWidth(conn.width);
    const R = calculateResistance(conn.points, conn.material, conn.width);
    setResistance(Number(R.toFixed(2)));
    setTempResistance(Number(R.toFixed(2)).toString());
  };

  const handleStageClick = (e) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    const [x, y] = showGrid ? snapToGrid(pos.x, pos.y) : [pos.x, pos.y];
    if (isAddingLabel) {
      const text = window.prompt("Enter label text:", "");
      if (text) {
        setLabels((prev) => [...prev, { id: Date.now(), x, y, text, fontSize: labelFontSize }]);
      }
      setIsAddingLabel(false);
      return;
    }
    if (isDrawingOutline) {
      setOutlinePath((prev) => [...prev, x, y]);
    } else if (selectedNode) {
      setActivePath((prev) => [...prev, x, y]);
    } else if (e.target === stage) {
      setSelectedNode(null);
      setSelectedConnection(null);
      setSelectedLabel(null);
      setActivePath([]);
      setOutlinePath([]);
      setIsDrawingOutline(false);
    }
  };

  const handleMouseMove = (e) => {
    if (!selectedNode && !isDrawingOutline && !isAddingLabel) return;
    const stage = e.target.getStage();
    if (!stage) return;
    setMousePosition(stage.getPointerPosition());
  };

  const handleNodeDrag = (e, node) => {
    let x = e.target.x(),
      y = e.target.y();
    if (showGrid) [x, y] = snapToGrid(x, y);
    setShapes((prev) =>
      prev.map((s) => {
        if (s.id === node.id) return { ...s, x, y };
        if (s.type === "connection") {
          const pts = [...s.points];
          if (s.node1Id === node.id) {
            pts[0] = x;
            pts[1] = y;
          }
          if (s.node2Id === node.id) {
            pts[pts.length - 2] = x;
            pts[pts.length - 1] = y;
          }
          return { ...s, points: pts };
        }
        return s;
      })
    );
  };

  const handleDelete = () => {
    if (selectedNode) {
      const nid = selectedNode.id;
      setShapes((prev) =>
        prev.filter(
          (s) =>
            s.id !== nid &&
            !(s.type === "connection" && (s.node1Id === nid || s.node2Id === nid))
        )
      );
      setSelectedNode(null);
    } else if (selectedConnection) {
      setShapes((prev) => prev.filter((s) => s.id !== selectedConnection.id));
      setSelectedConnection(null);
    } else if (selectedLabel) {
      setLabels((prev) => prev.filter((l) => l.id !== selectedLabel.id));
      setSelectedLabel(null);
    }
  };

  const finishOutline = () => {
    if (outlinePath.length < 4) {
      setOutlinePath([]);
      setIsDrawingOutline(false);
      return;
    }
    const [sx, sy] = outlinePath;
    const closed = [...outlinePath, sx, sy];
    const shape = { id: Date.now(), type: "outline", points: closed, width: traceWidth, color: "limegreen", layer: "outline" };
    setShapes((prev) => [...prev, shape]);
    setOutlinePath([]);
    setIsDrawingOutline(false);
  };

  const drawGrid = () => {
    const lines = [];
    for (let i = 0; i <= 600; i += gridSpacing)
      lines.push(<Line key={`gx${i}`} points={[i, 0, i, 400]} stroke="#ddd" strokeWidth={0.5} />);
    for (let j = 0; j <= 400; j += gridSpacing)
      lines.push(<Line key={`gy${j}`} points={[0, j, 600, j]} stroke="#ddd" strokeWidth={0.5} />);
    return lines;
  };

  const exportPNG = () => {
    const uri = stageRef.current.toDataURL();
    const link = document.createElement("a");
    link.download = "diagram.png";
    link.href = uri;
    link.click();
  };

  const exportSVG = () => {
    const uri = stageRef.current.toDataURL();
    const w = stageRef.current.width(),
      h = stageRef.current.height();
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><image href="${uri}" width="${w}" height="${h}"/></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "diagram.svg";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h2>ECAD Tool – Grid, Lines, Labels & Outline</h2>
      <div className="controls">
        {/* Buttons row */}
        <div className="controls-row controls-buttons">
          <button onClick={exportPNG}>Export PNG</button>
          <button onClick={exportSVG}>Export SVG</button>
          <button onClick={() => addNode("power")}>Add Power Node</button>
          <button onClick={() => addNode("ground")}>Add Ground Node</button>
          <button onClick={handleDelete} disabled={!selectedNode && !selectedConnection && !selectedLabel}>
            Delete Selected
          </button>
          <button onClick={() => (isDrawingOutline ? finishOutline() : setIsDrawingOutline(true))}>
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
        </div>
        {/* Checkboxes row */}
        <div className="controls-row controls-checkboxes">
          <label>
            <input
              type="checkbox"
              checked={activeLayers.footprint}
              onChange={() => setActiveLayers((l) => ({ ...l, footprint: !l.footprint }))}
            />
            Footprint
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeLayers.f_lig}
              onChange={() => setActiveLayers((l) => ({ ...l, f_lig: !l.f_lig }))}
            />
            F.LIG
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeLayers.outlineLayer}
              onChange={() => setActiveLayers((l) => ({ ...l, outlineLayer: !l.outlineLayer }))}
            />
            Outline
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeLayers.labelLayer}
              onChange={() => setActiveLayers((l) => ({ ...l, labelLayer: !l.labelLayer }))}
            />
            Labels
          </label>
          <label>
            <input type="checkbox" checked={showGrid} onChange={() => setShowGrid((g) => !g)} /> Show Grid
          </label>
        </div>
        {/* Settings row */}
        <div className="controls-row controls-settings">
          <label>
            Grid Spacing: {gridSpacing}px
            <input type="range" min={10} max={50} value={gridSpacing} onChange={(e) => setGridSpacing(Number(e.target.value))} />
          </label>
          <label>
            Material:
            <select value={selectedMaterial} onChange={(e) => setSelectedMaterial(e.target.value)}>
              <option value="copper">copper</option>
              <option value="aluminum">aluminum</option>
              <option value="gold">gold</option>
              <option value="silver">silver</option>
            </select>
          </label>
          <label>
            Line Type:
            <select value={lineType} onChange={(e) => setLineType(e.target.value)}>
              <option value="linear">Linear</option>
              <option value="chamfer">Chamfer</option>
              <option value="fillet">Fillet</option>
              <option value="bezier">Bezier</option>
            </select>
          </label>
          <label>
            Font Size:
            <select value={labelFontSize} onChange={(e) => setLabelFontSize(Number(e.target.value))}>
              {[12, 14, 16, 18, 20, 24].map((sz) => (
                <option key={sz} value={sz}>
                  {sz}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trace Width: {traceWidth.toFixed(6)} m
            <input
              type="range"
              min={0.001}
              max={0.05}
              step={0.001}
              disabled={!selectedConnection}
              value={traceWidth}
              onChange={(e) => handleWidthChange(Number(e.target.value))}
            />
          </label>
          <label>
            Resistance (Ω):
            <input
              type="text"
              value={tempResistance}
              disabled={!selectedConnection}
              onChange={(e) => setTempResistance(e.target.value)}
              onBlur={handleResistanceBlur}
            />
          </label>
        </div>
      </div>

      <Stage
        ref={stageRef}
        width={600}
        height={400}
        onClick={handleStageClick}
        onMouseMove={handleMouseMove}
        style={{ border: "1px solid #ccc" }}
      >
        {showGrid && <Layer>{drawGrid()}</Layer>}

        {activeLayers.labelLayer && (
          <Layer>
            {labels.map((lbl) => {
              const pad = 4;
              const w = lbl.text.length * (lbl.fontSize * 0.6) + pad * 2;
              const h = lbl.fontSize + pad * 2;
              const isSel = selectedLabel?.id === lbl.id;
              return (
                <React.Fragment key={lbl.id}>
                  {isSel && <Rect x={lbl.x - pad} y={lbl.y - pad} width={w} height={h} stroke="black" strokeWidth={1} />}
                  <Text
                    x={lbl.x}
                    y={lbl.y}
                    text={lbl.text}
                    fontSize={lbl.fontSize}
                    fill="black"
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

        {activeLayers.f_lig && (
          <Layer>
            {shapes
              .filter((s) => s.layer === "f_lig")
              .map((line) => {
                const pts =
                  lineType === "chamfer"
                    ? getChamferPoints(line.points)
                    : lineType === "fillet"
                    ? getFilletPoints(line.points)
                    : line.points;
                const baseW = (line.width || 0.005) * 1000;
                const isSel = selectedConnection?.id === line.id;
                const common = {
                  points: pts,
                  hitStrokeWidth: HIT_STROKE,
                  lineJoin: lineType === "linear" ? "miter" : "round",
                  strokeCap: lineType === "linear" ? undefined : "round",
                  bezier: lineType === "bezier",
                  tension: lineType === "bezier" ? 1 : undefined,
                  onClick: () => handleConnectionClick(line)
                };
                return (
                  <React.Fragment key={line.id}>
                    {isSel && <Line {...common} stroke="black" strokeWidth={baseW + 2} />}
                    <Line {...common} stroke={line.color} strokeWidth={baseW} />
                  </React.Fragment>
                );
              })}
            {selectedNode && activePath.length > 0 && (
              <>
                <Line points={activePath} stroke="green" strokeWidth={2} dash={[5, 5]} />
                {mousePosition && (
                  <Line points={[...activePath, mousePosition.x, mousePosition.y]} stroke="green" strokeWidth={2} dash={[5, 5]} />
                )}
              </>
            )}
          </Layer>
        )}

        {activeLayers.footprint && (
          <Layer>
            {shapes
              .filter((s) => s.layer === "footprint")
              .map((node) => (
                <Circle
                  key={node.id}
                  x={node.x}
                  y={node.y}
                  radius={node.radius}
                  fill={node.color}
                  stroke={selectedNode?.id === node.id ? "black" : "transparent"}
                  strokeWidth={3}
                  hitStrokeWidth={HIT_STROKE}
                  draggable
                  onClick={() => handleNodeClick(node)}
                  onDragMove={(e) => handleNodeDrag(e, node)}
                />
              ))}
          </Layer>
        )}

        {activeLayers.outlineLayer && (
          <Layer>
            {shapes
              .filter((s) => s.layer === "outline")
              .map((o) => {
                const pts = o.points;
                const w = (o.width || 0.005) * 1000;
                const isSel = selectedConnection?.id === o.id;
                return (
                  <React.Fragment key={o.id}>
                    {isSel && <Line points={pts} stroke="black" strokeWidth={w + 2} />}
                    <Line
                      points={pts}
                      stroke="limegreen"
                      strokeWidth={w}
                      hitStrokeWidth={HIT_STROKE}
                      lineJoin={lineType === "linear" ? "miter" : "round"}
                      strokeCap={lineType === "linear" ? undefined : "round"}
                      bezier={lineType === "bezier"}
                      tension={lineType === "bezier" ? 1 : undefined}
                      onClick={() => handleConnectionClick(o)}
                    />
                  </React.Fragment>
                );
              })}
            {isDrawingOutline && outlinePath.length > 0 && (
              <>
                <Line
                  points={outlinePath}
                  stroke="limegreen"
                  strokeWidth={traceWidth * 1000}
                  dash={[5, 5]}
                  lineJoin={lineType === "linear" ? "miter" : "round"}
                  strokeCap={lineType === "linear" ? undefined : "round"}
                  bezier={lineType === "bezier"}
                  tension={lineType === "bezier" ? 1 : undefined}
                />
                {mousePosition && (
                  <Line
                    points={[...outlinePath, mousePosition.x, mousePosition.y]}
                    stroke="limegreen"
                    strokeWidth={traceWidth * 1000}
                    dash={[5, 5]}
                    lineJoin={lineType === "linear" ? "miter" : "round"}
                    strokeCap={lineType === "linear" ? undefined : "round"}
                    bezier={lineType === "bezier"}
                    tension={lineType === "bezier" ? 1 : undefined}
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

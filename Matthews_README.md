# Matthew's README

**ECAD (Electronic Computer-Aided Design) Tool** is a React-based web application for creating, editing, and exporting simple electronic schematics and PCB outlines. It uses **react-konva** for Canvas rendering and **axios** for backend communication. The application supports grid snapping, trace drawing with various corner styles (linear, chamfer, fillet, bezier), dynamic trace resistance calculations based on material and width, labels, and export to PNG and vector SVG with optional background image.

## Key Features

- **Grid & Snapping**: Configurable grid spacing, real-world scaling (20 cm × 15 cm canvas), coordinate labels in cm, grid toggle.
- **Nodes & Connections**: Add power/ground nodes, draw traces between nodes with click-to-start and click-to-finish, preview active paths, intermediate routing points.
- **Trace Styles**:
  - **Linear**: Straight-line segments.
  - **Chamfer**: Beveled corners with adjustable chamfer length.
  - **Fillet**: Rounded corners with fixed radius.
  - **Bezier**: Curved spline segments.
- **Materials & Resistance**: Choose copper, aluminum, gold, or silver; calculate and display electrical resistance based on trace geometry and material; adjust width ↔ resistance.
- **Outline Drawing**: Freeform PCB outline loops with same corner styles as traces.
- **Labels**: Place text annotations with adjustable font size and selectable deletion.
- **Background Image**: Load an image underneath the design, specify real-world size (cm), toggle visibility.
- **Export**:
  - **PNG**: Bitmap export at screen resolution.
  - **SVG**: True vector export with real-world dimensions, optional background inclusion.

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/ecad-tool.git
   cd ecad-tool
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Start the backend** (e.g., a simple JSON server on port 5050 for `/shapes` REST API).
4. **Run the app**:
   ```bash
   npm start
   ```
5. Open `http://localhost:3000` in your browser.

## Project Structure

```
/src
  ├─ App.js            # Main React component
  ├─ App.css           # Basic styling
  ├─ components/       # (future) reusable UI components
  └─ utils/            # (future) geometry & math helpers
/public
  ├─ index.html        # HTML template
...
```

## Usage

- **Add Nodes**: Click "Add Power Node" or "Add Ground Node" → click canvas.
- **Draw Trace**: Click on a node → move to next node or intermediate points → click to finish.
- **Switch Styles**: Select Line Type from dropdown.
- **Adjust Width/Resistance**: Click a trace → use slider or input to update.
- **Draw Outline**: Click "Add Outline" → click points around shape → click "Finish Outline".
- **Place Label**: Click "Add Label" → click canvas → enter text.
- **Toggle Layers**: Use checkboxes to show/hide footprint, traces, outline, labels, background image, grid.
- **Load Image**: Click "Load Image" → select file → enter real-world size in cm.
- **Export**: Click "Export PNG" or "Export SVG" → choose include background or not.

## Next Steps & Extensibility

To extend the ECAD Tool, consider the following enhancements:

### 1. Implement Different Types of Sensors (Capacitors)

- **Data Model**: Extend `/shapes` REST objects to include sensor/capacitor type, value (e.g., capacitance), orientation, footprint outline.
- **UI**:
  - Add buttons/dropdowns: "Add Capacitor", "Add Sensor" with subtypes (e.g., ceramic, electrolytic).
  - Prompt user for parameters (e.g., capacitance in μF) when placing.
- **Rendering**:
  - Create new Konva shapes to visually represent capacitors/sensors (two parallel plates, polarity marking).
  - Snap placement to grid.
- **Properties Panel**:
  - On click, show modal/panel to edit capacitance value, footprint dimensions, material.
- **Integration**:
  - Store sensor objects in `shapes` with new `type: "capacitor"` or `type: "sensor"` and render accordingly.

### 2. Implement Copper Tab Plating

- **Data Model**: Add boolean flag `plated: true/false` to trace objects; optional `platingThickness` property.
- **UI**:
  - Add toggle in Controls: "Enable Copper Plating" and input for thickness in μm.
  - When active, all new traces get plating attributes.
- **Rendering**:
  - In SVG export, output additional `<path>` or `<polyline>` with expanded stroke width to represent plating layer.
  - In Canvas, draw outer contour with plating color (e.g., darker copper) behind the original trace.
- **Calculations**:
  - If plating added, include plating layer in resistance computation (parallel conduction).
  - Update `calculateResistance` to combine base copper and plating conduction.

## Contributing

1. Fork the repository  
2. Create a feature branch: `git checkout -b feature/new-sensor`  
3. Commit your changes  
4. Push and open a Pull Request  

---

This README equips a new developer with the context to understand, run, and extend the ECAD Tool. Happy coding!

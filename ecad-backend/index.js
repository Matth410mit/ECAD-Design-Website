const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

let shapes = [];

// Get all shapes
app.get("/shapes", (req, res) => {
    res.json(shapes);
});

// Add a shape
app.post("/shapes", (req, res) => {
    const shape = req.body;
    shapes.push(shape);
    res.json({ message: "Shape added", shape });
});

// Update material of a connection
app.put("/shapes/:id", (req, res) => {
    const shapeId = parseInt(req.params.id);
    shapes = shapes.map((shape) =>
        shape.id === shapeId ? { ...shape, material: req.body.material, color: req.body.color } : shape
    );
    res.json({ message: "Shape updated" });
});

// Start server
app.listen(5050, () => console.log(`Server running on port 5050`));

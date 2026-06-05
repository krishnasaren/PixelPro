# PixelForge — Professional Image Editor

A full-featured, browser-based image editor with **pixel-level editing**, a built-in **code editor**, layers, filters, and more. Inspired by Canva + Photoshop, built with Python (Flask) backend and pure JavaScript canvas frontend.

---

## Windows Quick Start

### 1. Install Python (first time only)
Download from https://python.org — check **"Add Python to PATH"** during install.

### 2. Install dependencies (first time only)
Double-click `setup.bat`

### 3. Launch PixelForge
Double-click `start.bat`  
Browser opens at **http://localhost:5000** automatically.

---

## Features

### Tools
| Tool | Shortcut | Description |
|------|----------|-------------|
| Move | V | Pan layers and canvas |
| Select | M | Rectangular marquee selection |
| Lasso | L | Freehand selection |
| Magic Wand | W | Select by color region |
| Crop | C | Crop canvas |
| Brush | B | Paint with soft/hard edges |
| Eraser | E | Erase with soft/hard edges |
| Fill | G | Flood fill with color |
| Gradient | drag | Linear gradient fill |
| Text | T (dbl-click) | Add text to canvas |
| Rectangle | U | Draw rectangles |
| Ellipse | — | Draw ellipses |
| Line | — | Draw straight lines |
| Eyedropper | I | Sample any pixel color |
| Zoom | Z | Zoom in/out |
| Pan | H | Pan the canvas view |
| **Pixel Editor** | **X** | **Edit individual pixels** |

### Pixel Editor (Key Feature)
- Press **X** or click the pixel grid icon in the toolbox
- Zoom to 8× or higher — individual pixels become visible squares
- **Click** any pixel to paint it with the primary color
- **Hover** over pixels to see live RGBA values in the Pixel panel
- **Shift+Click** to add pixels to a selection
- **Batch edit**: select multiple pixels → change their RGBA values → click Apply
- **Select Same Color**: finds and selects all pixels matching the hovered color
- Full RGBA sliders + hex input in the Pixel Inspector panel

### Code Editor
- Press **Ctrl+`** or click **Code Editor** in the toolbar
- Write JavaScript that manipulates the raw pixel array
- Available API:
  ```js
  getPixel(x, y)          // returns {r, g, b, a}
  setPixel(x, y, r,g,b,a) // paint a pixel
  pixels                  // Uint8ClampedArray (flat RGBA data)
  width, height           // canvas dimensions
  ```
- 7 built-in examples in the **Code** menu (Invert, Grayscale, Pixelate, Noise, Edge Detect, Wave, Checkerboard)
- Python execution via Flask backend (POST /api/code/execute)

### Layers
- Unlimited layers with blend modes (normal, multiply, screen, overlay…)
- Per-layer opacity slider
- Visibility toggle, rename, reorder (drag or ↑↓ buttons)
- Merge Down, Flatten, Duplicate

### Filters (real-time preview)
- Brightness / Contrast
- Hue / Saturation / Lightness
- Gaussian Blur
- Sharpen
- Add Noise
- Vignette
- Quick: Grayscale, Invert, Sepia, Mirror

### Export
- PNG (lossless, transparency)
- JPEG (quality slider)
- WebP (quality slider)
- SVG (embedded raster)

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Undo | Ctrl+Z |
| Redo | Ctrl+Y |
| New | Ctrl+N |
| Open | Ctrl+O |
| Save project | Ctrl+S |
| Export | Ctrl+E |
| Select All | Ctrl+A |
| Deselect | Esc |
| Copy | Ctrl+C |
| Cut | Ctrl+X |
| Paste | Ctrl+V |
| Zoom In | Ctrl++ |
| Zoom Out | Ctrl+- |
| Fit Screen | Ctrl+0 |
| Actual Size | Ctrl+1 |
| Toggle Grid | Ctrl+' |
| Code Editor | Ctrl+` |
| New Layer | Ctrl+Shift+N |
| Brush size − | [ |
| Brush size + | ] |
| Swap colors | X |

---

## Flask API (for advanced use)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server status |
| `/api/filter/brightness` | POST | Brightness adjust |
| `/api/filter/contrast` | POST | Contrast adjust |
| `/api/filter/saturation` | POST | Saturation adjust |
| `/api/filter/blur` | POST | Gaussian blur |
| `/api/filter/sharpen` | POST | Sharpen |
| `/api/filter/grayscale` | POST | Grayscale convert |
| `/api/filter/invert` | POST | Color invert |
| `/api/filter/sepia` | POST | Sepia tone |
| `/api/filter/noise` | POST | Add noise |
| `/api/filter/vignette` | POST | Vignette effect |
| `/api/filter/hsl` | POST | Hue/Sat/Light adjust |
| `/api/image/resize` | POST | Resize canvas |
| `/api/image/rotate` | POST | Rotate image |
| `/api/image/flip` | POST | Flip H or V |
| `/api/image/info` | POST | Get image statistics |
| `/api/code/execute` | POST | Run Python on image |
| `/api/export` | POST | Export with format/quality |
| `/api/templates` | GET | List canvas templates |

All POST endpoints accept `{"image": "data:image/png;base64,..."}` and return `{"image": "..."}`.

---

## Project Structure

```
pixelforge/
├── index.html        Landing page
├── editor.html       Full image editor (92KB, all-in-one)
├── app.py            Flask backend + API server
├── requirements.txt  Python dependencies
├── setup.bat         Windows: install dependencies
├── start.bat         Windows: launch server + open browser
└── README.md         This file
```

---

## Tech Stack
- **Frontend**: Vanilla JavaScript, HTML5 Canvas API, CSS3
- **Backend**: Python 3, Flask, Pillow (PIL), NumPy
- **No build step** — pure HTML/JS, runs directly in browser

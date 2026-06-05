from waitress import serve
from app import app


print(f'\n  PixelForge Server v2.0')
print(f'  ─────────────────────')
print(f'  Open:  http://localhost:5000')
print(f'  Editor: http://localhost:5000/editor')
print(f'  Press Ctrl+C to stop\n')
serve(app, host="0.0.0.0", port=5000, threads=8)
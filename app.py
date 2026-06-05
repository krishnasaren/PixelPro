from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw
import io, base64, json, traceback, os, numpy as np, zipfile, math
from rembg import remove as rembg_remove

try:
    from markdown import markdown
    MD_OK = True
except ImportError:
    MD_OK = False

app = Flask(__name__, static_folder='.')
CORS(app)
BASE = os.path.dirname(os.path.abspath(__file__))

# ─── Routes ──────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory(BASE, 'index.html')

@app.route('/editor')
@app.route('/editor.html')
def editor():
    return send_from_directory(BASE, 'editor.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(BASE, filename)

# ─── Helpers ─────────────────────────────────────────────────
def b64_to_img(b64):
    if ',' in b64:
        b64 = b64.split(',')[1]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGBA')

def img_to_b64(img, fmt='PNG', quality=95):
    buf = io.BytesIO()
    if fmt in ('JPEG','JPG'):
        img = img.convert('RGB')
        img.save(buf, 'JPEG', quality=quality, optimize=True)
        mime = 'image/jpeg'
    elif fmt == 'WEBP':
        img.save(buf, 'WEBP', quality=quality)
        mime = 'image/webp'
    elif fmt == 'GIF':
        img.save(buf, 'GIF')
        mime = 'image/gif'
    elif fmt == 'ICO':
        img_s = img.convert('RGBA').resize((64,64), Image.LANCZOS)
        img_s.save(buf, 'ICO')
        mime = 'image/x-icon'
    else:
        img.save(buf, 'PNG', optimize=True)
        mime = 'image/png'
    buf.seek(0)
    return f'data:{mime};base64,' + base64.b64encode(buf.read()).decode()

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, v))

def apply_to_rgb(img, fn):
    r, g, b, a = img.split()
    rgb = Image.merge('RGB', (r, g, b))
    rgb = fn(rgb)
    r2, g2, b2 = rgb.split()
    return Image.merge('RGBA', (r2, g2, b2, a))

# ─── Health ──────────────────────────────────────────────────
@app.route('/api/health')
def health():
    return jsonify({
        'PixelPro':'149.0.7827.53(OfficialBuild) (64 - bit)(cohort: 149.0.7827.53Rollout)',
        'Revision': '9d2c8156a72129edca4785abb98866fad60ea338 - refs / branch - heads / 7827 @ {  # 1980}',
        'OS':'Windows 11 Version 25 H2(Build 26200.8524)',
        'Variations':'eyJkaXNhYmxlLWZlYXR1cmVzIjoiQWRqdXN0UHJlY29ubmVjdFJldHJ5SW50',
        'Active Variations':'b1755f03 - 7133e271',
        'status': 'ok', 'version': '3.0','API' : 47,'Tools':241,'Context':'2D'})

# ─── Basic Filters ───────────────────────────────────────────
@app.route('/api/filter/brightness', methods=['POST'])
def filter_brightness():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        v = float(d.get('value', 1.0))
        result = apply_to_rgb(img, lambda rgb: ImageEnhance.Brightness(rgb).enhance(v))
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/contrast', methods=['POST'])
def filter_contrast():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        result = apply_to_rgb(img, lambda rgb: ImageEnhance.Contrast(rgb).enhance(float(d.get('value', 1.0))))
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/saturation', methods=['POST'])
def filter_saturation():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        result = apply_to_rgb(img, lambda rgb: ImageEnhance.Color(rgb).enhance(float(d.get('value', 1.0))))
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/sharpen', methods=['POST'])
def filter_sharpen():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        result = apply_to_rgb(img, lambda rgb: ImageEnhance.Sharpness(rgb).enhance(float(d.get('factor', 2.0))))
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/blur', methods=['POST'])
def filter_blur():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        radius = float(d.get('radius', 2.0))
        result = img.filter(ImageFilter.GaussianBlur(radius=radius))
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/hsl', methods=['POST'])
def filter_hsl():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        hue = float(d.get('hue', 0))
        sat = float(d.get('saturation', 0))
        lgt = float(d.get('lightness', 0))
        arr = np.array(img, dtype=np.float32) / 255.0
        r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
        mx = np.maximum(np.maximum(r,g),b)
        mn = np.minimum(np.minimum(r,g),b)
        l = (mx + mn) / 2
        d2 = mx - mn
        s = np.where(d2==0, 0, np.where(l<0.5, d2/(mx+mn+1e-9), d2/(2-mx-mn+1e-9)))
        h = np.zeros_like(r)
        mask = d2 > 0
        rm = mask & (mx==r); h[rm] = ((g[rm]-b[rm])/(d2[rm]+1e-9)) % 6
        gm = mask & (mx==g); h[gm] = (b[gm]-r[gm])/(d2[gm]+1e-9) + 2
        bm = mask & (mx==b); h[bm] = (r[bm]-g[bm])/(d2[bm]+1e-9) + 4
        h = h / 6.0
        h = (h + hue/360.0) % 1.0
        s = np.clip(s + sat/100.0, 0, 1)
        l = np.clip(l + lgt/100.0, 0, 1)
        q = np.where(l<0.5, l*(1+s), l+s-l*s)
        p = 2*l - q
        def hue2rgb(p, q, t):
            t = (t % 1 + 1) % 1
            return np.where(t<1/6, p+(q-p)*6*t, np.where(t<1/2, q, np.where(t<2/3, p+(q-p)*(2/3-t)*6, p)))
        nr = hue2rgb(p, q, h+1/3)
        ng = hue2rgb(p, q, h)
        nb = hue2rgb(p, q, h-1/3)
        out = np.stack([nr*255, ng*255, nb*255, arr[:,:,3]*255], axis=2)
        result = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/curves', methods=['POST'])
def filter_curves():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        pts = d.get('points', [[0,0],[255,255]])
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        lut = [0]*256
        for i in range(256):
            for j in range(len(xs)-1):
                if xs[j] <= i <= xs[j+1]:
                    t = (i - xs[j]) / max(1, xs[j+1] - xs[j])
                    lut[i] = int(clamp(ys[j] + t*(ys[j+1]-ys[j])))
                    break
            else: lut[i] = int(clamp(ys[-1]))
        r2, g2, b2, a = img.split()
        r2 = r2.point(lut); g2 = g2.point(lut); b2 = b2.point(lut)
        result = Image.merge('RGBA', (r2, g2, b2, a))
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/vignette', methods=['POST'])
def filter_vignette():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        strength = float(d.get('strength', 0.5))
        softness = float(d.get('softness', 0.5))
        w, h = img.size
        Y, X = np.ogrid[:h, :w]
        dist = np.sqrt(((X-w/2)/(w/2))**2 + ((Y-h/2)/(h/2))**2)
        vgn = 1 - np.clip((dist - softness) / (1 - softness + 0.001), 0, 1) * strength
        arr = np.array(img, dtype=np.float64)
        arr[:,:,:3] *= vgn[:,:,np.newaxis]
        result = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/noise', methods=['POST'])
def filter_noise():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        amt = int(d.get('amount', 25))
        arr = np.array(img, dtype=np.int16)
        noise = np.random.randint(-amt, amt+1, arr.shape[:2] + (3,), dtype=np.int16)
        arr[:,:,:3] = np.clip(arr[:,:,:3] + noise, 0, 255)
        result = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/pixelate', methods=['POST'])
def filter_pixelate():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        sz = max(2, int(d.get('size', 8)))
        w, h = img.size
        small = img.resize((max(1,w//sz), max(1,h//sz)), Image.NEAREST)
        result = small.resize((w,h), Image.NEAREST)
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ─── NEW Filters ─────────────────────────────────────────────

@app.route('/api/filter/levels', methods=['POST'])
def filter_levels():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        black = int(d.get('black', 0))
        white = int(d.get('white', 255))
        gamma = float(d.get('gamma', 1.0))
        arr = np.array(img, dtype=np.float32)
        rgb = arr[:,:,:3]
        rgb = (rgb - black) / max(1, white - black) * 255.0
        if gamma != 1.0:
            rgb = np.sign(rgb) * (np.abs(rgb)/255.0) ** (1.0/gamma) * 255.0
        arr[:,:,:3] = np.clip(rgb, 0, 255)
        result = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/color_balance', methods=['POST'])
def filter_color_balance():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        shadows_r = float(d.get('shadows_r', 0))
        shadows_g = float(d.get('shadows_g', 0))
        shadows_b = float(d.get('shadows_b', 0))
        mids_r = float(d.get('mids_r', 0))
        mids_g = float(d.get('mids_g', 0))
        mids_b = float(d.get('mids_b', 0))
        highs_r = float(d.get('highs_r', 0))
        highs_g = float(d.get('highs_g', 0))
        highs_b = float(d.get('highs_b', 0))
        arr = np.array(img, dtype=np.float32)
        for y in range(arr.shape[0]):
            for x in range(arr.shape[1]):
                for c, (sh, mi, hi) in enumerate(zip([shadows_r,shadows_g,shadows_b],[mids_r,mids_g,mids_b],[highs_r,highs_g,highs_b])):
                    v = arr[y,x,c] / 255.0
                    shadow_w = max(0, 1 - v*2)
                    mid_w = max(0, 1 - abs(v - 0.5)*2)
                    high_w = max(0, v*2 - 1)
                    arr[y,x,c] = np.clip(arr[y,x,c] + sh*shadow_w + mi*mid_w + hi*high_w, 0, 255)
        # Vectorized version for performance
        arr = np.array(img, dtype=np.float32)
        lum = arr[:,:,:3] / 255.0
        shadow_w = np.clip(1 - lum*2, 0, 1)
        mid_w = np.clip(1 - np.abs(lum - 0.5)*2, 0, 1)
        high_w = np.clip(lum*2 - 1, 0, 1)
        arr[:,:,0] = np.clip(arr[:,:,0] + shadows_r*shadow_w[:,:,0] + mids_r*mid_w[:,:,0] + highs_r*high_w[:,:,0], 0, 255)
        arr[:,:,1] = np.clip(arr[:,:,1] + shadows_g*shadow_w[:,:,1] + mids_g*mid_w[:,:,1] + highs_g*high_w[:,:,1], 0, 255)
        arr[:,:,2] = np.clip(arr[:,:,2] + shadows_b*shadow_w[:,:,2] + mids_b*mid_w[:,:,2] + highs_b*high_w[:,:,2], 0, 255)
        result = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/motion_blur', methods=['POST'])
def filter_motion_blur():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        angle = float(d.get('angle', 0))
        distance = int(d.get('distance', 15))
        arr = np.array(img, dtype=np.float32)
        result_arr = np.zeros_like(arr)
        rad = math.radians(angle)
        dx = math.cos(rad); dy = math.sin(rad)
        for i in range(distance):
            t = i / max(1, distance-1) - 0.5
            ox = int(round(t * distance * dx))
            oy = int(round(t * distance * dy))
            shifted = np.roll(np.roll(arr, ox, axis=1), oy, axis=0)
            result_arr += shifted
        result_arr /= distance
        result = Image.fromarray(np.clip(result_arr, 0, 255).astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/radial_blur', methods=['POST'])
def filter_radial_blur():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        amount = int(d.get('amount', 8))
        arr = np.array(img, dtype=np.float32)
        h_img, w_img = arr.shape[:2]
        result_arr = np.zeros_like(arr)
        cx, cy = w_img/2, h_img/2
        for i in range(1, amount+1):
            scale = 1.0 + i * 0.01
            tmp = Image.fromarray(arr.astype(np.uint8), 'RGBA')
            nw = int(w_img * scale); nh = int(h_img * scale)
            tmp = tmp.resize((nw, nh), Image.BILINEAR)
            ox = (nw - w_img) // 2; oy = (nh - h_img) // 2
            tmp_arr = np.array(tmp, dtype=np.float32)
            result_arr += tmp_arr[oy:oy+h_img, ox:ox+w_img]
        result_arr = (arr * amount/2 + result_arr) / (amount + amount/2)
        result = Image.fromarray(np.clip(result_arr, 0, 255).astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/duotone', methods=['POST'])
def filter_duotone():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        def hex2rgb(h):
            h = h.lstrip('#')
            return tuple(int(h[i:i+2], 16) for i in (0,2,4))
        c1 = hex2rgb(d.get('color1', '#000000'))
        c2 = hex2rgb(d.get('color2', '#ffffff'))
        arr = np.array(img, dtype=np.float32)
        gray = (arr[:,:,0]*0.299 + arr[:,:,1]*0.587 + arr[:,:,2]*0.114) / 255.0
        out = np.zeros_like(arr)
        out[:,:,0] = c1[0] + (c2[0]-c1[0]) * gray
        out[:,:,1] = c1[1] + (c2[1]-c1[1]) * gray
        out[:,:,2] = c1[2] + (c2[2]-c1[2]) * gray
        out[:,:,3] = arr[:,:,3]
        result = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/film_grain', methods=['POST'])
def filter_film_grain():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        amount = float(d.get('amount', 30))
        arr = np.array(img, dtype=np.float32)
        grain = np.random.normal(0, amount, arr.shape[:2])
        arr[:,:,0] = np.clip(arr[:,:,0] + grain, 0, 255)
        arr[:,:,1] = np.clip(arr[:,:,1] + grain, 0, 255)
        arr[:,:,2] = np.clip(arr[:,:,2] + grain, 0, 255)
        result = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/glitch', methods=['POST'])
def filter_glitch():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        amount = int(d.get('amount', 10))
        arr = np.array(img, dtype=np.uint8)
        h_img, w_img = arr.shape[:2]
        result = arr.copy()
        # Chromatic aberration
        result[:,:,0] = np.roll(arr[:,:,0], amount, axis=1)
        result[:,:,2] = np.roll(arr[:,:,2], -amount, axis=1)
        # Horizontal glitch lines
        for _ in range(8):
            y = np.random.randint(0, h_img)
            h_slice = min(np.random.randint(2, 8), h_img - y)
            shift = np.random.randint(-30, 30)
            result[y:y+h_slice] = np.roll(result[y:y+h_slice], shift, axis=1)
        result_img = Image.fromarray(result, 'RGBA')
        return jsonify({'image': img_to_b64(result_img)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/halftone', methods=['POST'])
def filter_halftone():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        dot_size = int(d.get('dot_size', 8))
        arr = np.array(img.convert('L'), dtype=np.float32) / 255.0
        w_img, h_img = img.size
        result = Image.new('RGBA', (w_img, h_img), (255,255,255,255))
        draw = ImageDraw.Draw(result)
        for y in range(0, h_img, dot_size):
            for x in range(0, w_img, dot_size):
                region = arr[y:y+dot_size, x:x+dot_size]
                brightness = float(region.mean())
                r = (1 - brightness) * dot_size * 0.6
                cx, cy = x + dot_size//2, y + dot_size//2
                if r > 0.5:
                    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(0,0,0,255))
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/pencil_sketch', methods=['POST'])
def filter_pencil_sketch():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        blur_r = float(d.get('blur', 12))
        gray = img.convert('L')
        gray_arr = np.array(gray, dtype=np.float32)
        blurred = np.array(Image.fromarray(gray_arr.astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=blur_r)), dtype=np.float32)
        # Dodge blend
        sketch = np.clip(gray_arr / (256 - blurred + 1) * 255, 0, 255)
        sketch_img = Image.fromarray(sketch.astype(np.uint8), 'L').convert('RGBA')
        # Preserve original alpha
        r2, g2, b2, _ = sketch_img.split()
        _, _, _, a = img.split()
        result = Image.merge('RGBA', (r2, g2, b2, a))
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/tilt_shift', methods=['POST'])
def filter_tilt_shift():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        focus_y = float(d.get('focus_y', 0.5))
        blur_r = float(d.get('blur', 6))
        blur_band = float(d.get('band', 0.15))
        arr = np.array(img, dtype=np.float32)
        blurred = np.array(img.filter(ImageFilter.GaussianBlur(radius=blur_r)), dtype=np.float32)
        h_img = arr.shape[0]
        result = np.zeros_like(arr)
        for y in range(h_img):
            rel = abs(y / h_img - focus_y)
            t = np.clip((rel - blur_band) / (1 - blur_band + 0.001), 0, 1)
            result[y] = arr[y] * (1 - t) + blurred[y] * t
        result_img = Image.fromarray(np.clip(result, 0, 255).astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result_img)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/oil_paint', methods=['POST'])
def filter_oil_paint():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        radius = int(d.get('radius', 4))
        intensity = int(d.get('intensity', 8))
        arr = np.array(img, dtype=np.uint8)
        result = arr.copy()
        h_img, w_img = arr.shape[:2]
        for y in range(radius, h_img-radius, 2):
            for x in range(radius, w_img-radius, 2):
                region = arr[y-radius:y+radius+1, x-radius:x+radius+1, :3]
                hist = np.zeros(intensity+1, dtype=np.float32)
                avg = np.zeros((intensity+1, 3), dtype=np.float32)
                for c in range(3):
                    vals = (region[:,:,c].astype(np.float32) / 255 * intensity).astype(int).clip(0, intensity)
                    for v in vals.flat:
                        hist[v] += 1
                        avg[v] += 0
                pixels = region.reshape(-1, 3).astype(np.float32)
                quant = (pixels[:,0]*0.299 + pixels[:,1]*0.587 + pixels[:,2]*0.114) / 255 * intensity
                quant_int = quant.astype(int).clip(0, intensity)
                np.add.at(hist, quant_int, 1)
                for c in range(3):
                    np.add.at(avg[:,c], quant_int, pixels[:,c])
                max_bin = np.argmax(hist)
                if hist[max_bin] > 0:
                    result[y,x,:3] = np.clip(avg[max_bin,:3] / hist[max_bin], 0, 255).astype(np.uint8)
        result_img = Image.fromarray(result, 'RGBA')
        return jsonify({'image': img_to_b64(result_img)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/exposure', methods=['POST'])
def filter_exposure():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        exposure = float(d.get('exposure', 0))
        shadows = float(d.get('shadows', 0))
        highlights = float(d.get('highlights', 0))
        arr = np.array(img, dtype=np.float32)
        rgb = arr[:,:,:3] / 255.0
        # Exposure (EV stops)
        rgb = rgb * (2 ** exposure)
        # Shadows (boost darks)
        rgb = rgb + shadows * (1 - rgb) * (1 - rgb)
        # Highlights (pull highlights)
        rgb = rgb + highlights * rgb * (1 - rgb)
        arr[:,:,:3] = np.clip(rgb * 255, 0, 255)
        result = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/vibrance', methods=['POST'])
def filter_vibrance():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        v = float(d.get('value', 50))
        arr = np.array(img, dtype=np.float32)
        rgb = arr[:,:,:3] / 255.0
        # Vibrance: boost less saturated colors more
        mx = rgb.max(axis=2); mn = rgb.min(axis=2)
        sat = mx - mn
        boost = (1 - sat[:,:,np.newaxis]) * (v / 100)
        mn3 = mn[:,:,np.newaxis]
        rgb = mn3 + (rgb - mn3) * (1 + boost)
        arr[:,:,:3] = np.clip(rgb * 255, 0, 255)
        result = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ─── Image ops ───────────────────────────────────────────────
@app.route('/api/image/resize', methods=['POST'])
def resize_image():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        w = int(d.get('width', img.width))
        h = int(d.get('height', img.height))
        result = img.resize((w, h), Image.LANCZOS)
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/image/rotate', methods=['POST'])
def rotate_image():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        angle = float(d.get('angle', 0))
        result = img.rotate(-angle, expand=True, resample=Image.BICUBIC)
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/image/flip', methods=['POST'])
def flip_image():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        direction = d.get('direction', 'horizontal')
        result = img.transpose(Image.FLIP_LEFT_RIGHT if direction == 'horizontal' else Image.FLIP_TOP_BOTTOM)
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/image/info', methods=['POST'])
def image_info():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        arr = np.array(img)
        return jsonify({'width': img.width, 'height': img.height,
            'mean_r': float(arr[:,:,0].mean()), 'mean_g': float(arr[:,:,1].mean()),
            'mean_b': float(arr[:,:,2].mean()), 'pixels': img.width * img.height})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ─── Code execution ──────────────────────────────────────────
@app.route('/api/code/execute', methods=['POST'])
def execute_code():
    try:
        d = request.json
        code = d.get('code', '')
        img = b64_to_img(d['image'])
        arr = np.array(img, dtype=np.uint8)
        width, height = img.width, img.height
        pixels_flat = arr.reshape(-1)
        def get_pixel(x, y):
            x, y = int(x), int(y)
            if 0<=x<width and 0<=y<height:
                p = arr[y, x]
                return {'r':int(p[0]),'g':int(p[1]),'b':int(p[2]),'a':int(p[3])}
            return {'r':0,'g':0,'b':0,'a':0}
        def set_pixel(x, y, r, g, b, a=255):
            x, y = int(x), int(y)
            if 0<=x<width and 0<=y<height:
                arr[y,x] = [clamp(r),clamp(g),clamp(b),clamp(a)]
        logs = []
        def log(*args): logs.append(' '.join(str(a) for a in args))
        namespace = {'pixels': pixels_flat, 'arr': arr, 'width': width, 'height': height,
            'np': np, 'Image': Image, 'get_pixel': get_pixel, 'set_pixel': set_pixel,
            'print': log, 'output': None}
        exec(compile(code, '<pixelforge>', 'exec'), namespace)
        np.copyto(arr.reshape(-1), namespace['pixels'])
        result_arr = namespace.get('output', arr)
        if isinstance(result_arr, np.ndarray):
            result = Image.fromarray(np.clip(result_arr, 0, 255).astype(np.uint8))
        else:
            result = Image.fromarray(arr, 'RGBA')
        return jsonify({'image': img_to_b64(result), 'log': '\n'.join(logs) if logs else 'OK'})
    except Exception as e:
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 400

# ─── Remove BG ───────────────────────────────────────────────
@app.route('/api/removebg', methods=['POST'])
def remove_bg():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        result = rembg_remove(img)
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ─── Export ──────────────────────────────────────────────────
@app.route('/api/export', methods=['POST'])
def export_image():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        fmt = d.get('format', 'PNG').upper()
        quality = int(d.get('quality', 95))
        return jsonify({'image': img_to_b64(img, fmt, quality), 'format': fmt})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/export/layers_zip', methods=['POST'])
def export_layers_zip():
    try:
        d = request.json
        layers_data = d.get('layers', [])
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for i, layer in enumerate(layers_data):
                img = b64_to_img(layer['data'])
                img_buf = io.BytesIO()
                img.save(img_buf, 'PNG')
                img_buf.seek(0)
                safe_name = ''.join(c if c.isalnum() or c in '-_' else '_' for c in layer.get('name','layer'))
                zf.writestr(f'{i:02d}_{safe_name}.png', img_buf.read())
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode()
        return jsonify({'data': f'data:application/zip;base64,{b64}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ─── Templates ───────────────────────────────────────────────
@app.route('/api/templates')
def get_templates():
    templates = [
        {'id':'blank_800','name':'Blank Web','w':800,'h':600,'bg':'#ffffff','category':'Web'},
        {'id':'blank_1080','name':'Social Square','w':1080,'h':1080,'bg':'#ffffff','category':'Social'},
        {'id':'banner','name':'Banner','w':1200,'h':630,'bg':'#1a1a2e','category':'Social'},
        {'id':'hd','name':'Full HD','w':1920,'h':1080,'bg':'#ffffff','category':'Video'},
        {'id':'icon','name':'Icon 64px','w':64,'h':64,'bg':'transparent','category':'Design'},
        {'id':'a4','name':'A4 Print','w':2480,'h':3508,'bg':'#ffffff','category':'Print'},
    ]
    return jsonify({'templates': templates})



@app.route('/docs')
def docs():
    md_path = os.path.join(BASE, '../README.md')

    with open(md_path, 'r', encoding='utf-8') as f:
        md = f.read()

    html = markdown(
        md,
        extensions=[
            # Core
            'extra',
            'toc',
            'tables',
            'fenced_code',
            'codehilite',
            'attr_list',
            'def_list',
            'abbr',
            'admonition',

            # PyMdown
            'pymdownx.superfences',
            'pymdownx.highlight',
            'pymdownx.inlinehilite',
            'pymdownx.emoji',
            'pymdownx.tasklist',
            'pymdownx.magiclink',
            'pymdownx.tabbed',
            'pymdownx.details',
            'pymdownx.mark',
            'pymdownx.caret',
            'pymdownx.tilde',
            'pymdownx.keys',
            'pymdownx.smartsymbols',
            'pymdownx.betterem',
            'pymdownx.saneheaders',
            'pymdownx.arithmatex'
        ],
        extension_configs={
            'pymdownx.highlight': {
                'anchor_linenums': True,
                'linenums': True,
                'guess_lang': True
            },
            'pymdownx.tasklist': {
                'custom_checkbox': True
            }
        }
    )

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>PixelForge Docs</title>

      <link rel="stylesheet"
       href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.8.1/github-markdown-light.min.css">

      <link rel="stylesheet"
       href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-light.min.css">

      <style>
      html {{
          background:#FFFFFFFF;
      }}

      body {{
          margin:0;
          padding:40px;
      }}

      .markdown-body {{
          max-width:1100px;
          margin:auto;
          padding:40px;
          border-radius:16px;
      }}
      </style>
    </head>
    <body>
      <article class="markdown-body">
        {html}
      </article>
    </body>
    </html>
    """


@app.route('/api/filter/cartoon', methods=['POST'])
def filter_cartoon():
    try:
        import cv2
        d = request.json
        img = b64_to_img(d['image'])
        arr = np.array(img.convert('RGB'))
        # Bilateral filter for smooth regions
        smooth = cv2.bilateralFilter(arr, 9, 75, 75)
        # Edge detection
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        edges = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 9, 2)
        edges_rgb = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        # Combine
        cartoon = cv2.bitwise_and(smooth, edges_rgb)
        result = Image.fromarray(np.dstack([cartoon, np.array(img)[:,:,3]]), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except ImportError:
        # Fallback: JS-only cartoon (posterize + edge)
        return jsonify({'error': 'opencv not installed, use JS cartoon filter'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/denoise', methods=['POST'])
def filter_denoise():
    try:
        import cv2
        d = request.json
        img = b64_to_img(d['image'])
        strength = float(d.get('strength', 10))
        arr = np.array(img)
        rgb = arr[:,:,:3]
        denoised = cv2.fastNlMeansDenoisingColored(rgb, None, strength, strength, 7, 21)
        result = Image.fromarray(np.dstack([denoised, arr[:,:,3]]), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except ImportError:
        return jsonify({'error': 'opencv not installed'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/inpaint', methods=['POST'])
def filter_inpaint():
    try:
        import cv2
        d = request.json
        img = b64_to_img(d['image'])
        # mask: white pixels = area to inpaint
        mask_b64 = d.get('mask')
        if not mask_b64:
            return jsonify({'error': 'mask required'}), 400
        mask_img = b64_to_img(mask_b64).convert('L')
        arr = np.array(img.convert('RGB'))
        mask_arr = np.array(mask_img)
        _, mask_bin = cv2.threshold(mask_arr, 127, 255, cv2.THRESH_BINARY)
        result_arr = cv2.inpaint(arr, mask_bin, 3, cv2.INPAINT_TELEA)
        alpha = np.array(img)[:,:,3]
        result = Image.fromarray(np.dstack([result_arr, alpha]), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except ImportError:
        return jsonify({'error': 'opencv not installed'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/auto_enhance', methods=['POST'])
def filter_auto_enhance():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        arr = np.array(img, dtype=np.float32)
        rgb = arr[:,:,:3]
        # Auto levels: stretch each channel to 0-255
        for c in range(3):
            mn, mx = rgb[:,:,c].min(), rgb[:,:,c].max()
            if mx > mn:
                rgb[:,:,c] = (rgb[:,:,c] - mn) / (mx - mn) * 255
        # Auto contrast boost
        arr[:,:,:3] = np.clip(rgb, 0, 255)
        result = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        # Slight sharpness boost
        result = apply_to_rgb(result, lambda r: ImageEnhance.Sharpness(r).enhance(1.3))
        result = apply_to_rgb(result, lambda r: ImageEnhance.Contrast(r).enhance(1.1))
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/upscale', methods=['POST'])
def filter_upscale():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        scale = float(d.get('scale', 2.0))
        nw = int(img.width * scale)
        nh = int(img.height * scale)
        # Lanczos upscale + sharpness pass
        result = img.resize((nw, nh), Image.LANCZOS)
        result = apply_to_rgb(result, lambda r: ImageEnhance.Sharpness(r).enhance(1.4))
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/colorize', methods=['POST'])
def filter_colorize():
    """Simple AI-style colorization: sepia + hue shift based on luminance zones"""
    try:
        d = request.json
        img = b64_to_img(d['image'])
        arr = np.array(img, dtype=np.float32)
        gray = arr[:,:,0]*0.299 + arr[:,:,1]*0.587 + arr[:,:,2]*0.114
        out = np.zeros_like(arr)
        # Sky zone (bright) → blue, midtone → green, dark → brown
        out[:,:,0] = np.clip(gray*0.8  + (1-gray/255)*40, 0, 255)
        out[:,:,1] = np.clip(gray*0.85 + (gray/255)*30,   0, 255)
        out[:,:,2] = np.clip(gray*0.9  + (gray/255)*60,   0, 255)
        out[:,:,3] = arr[:,:,3]
        result = Image.fromarray(out.astype(np.uint8), 'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/replace_color', methods=['POST'])
def filter_replace_color_srv():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        def hex2rgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
        tr,tg,tb = hex2rgb(d.get('target','#ff0000'))
        rr,rg,rb = hex2rgb(d.get('replace','#000000'))
        tol = float(d.get('tolerance',40)) * 3
        arr = np.array(img, dtype=np.int16)
        diff = np.abs(arr[:,:,0]-tr) + np.abs(arr[:,:,1]-tg) + np.abs(arr[:,:,2]-tb)
        mask = diff < tol
        arr[mask,0]=rr; arr[mask,1]=rg; arr[mask,2]=rb
        result = Image.fromarray(np.clip(arr,0,255).astype(np.uint8),'RGBA')
        return jsonify({'image': img_to_b64(result), 'count': int(mask.sum())})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/export/pdf', methods=['POST'])
def export_pdf():
    try:
        d = request.json
        img = b64_to_img(d['image']).convert('RGB')
        buf = io.BytesIO()
        img.save(buf, 'PDF')
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode()
        return jsonify({'data': f'data:application/pdf;base64,{b64}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/filter/glow', methods=['POST'])
def filter_glow_srv():
    try:
        d = request.json
        img = b64_to_img(d['image'])
        radius = float(d.get('radius', 8))
        intensity = float(d.get('intensity', 0.6))
        arr = np.array(img, dtype=np.float32)
        blurred = np.array(img.filter(ImageFilter.GaussianBlur(radius=radius)), dtype=np.float32)
        rgb_orig = arr[:,:,:3]/255; rgb_blur = blurred[:,:,:3]/255 * intensity
        screen = 1-(1-rgb_orig)*(1-rgb_blur)
        arr[:,:,:3] = np.clip(screen*255,0,255)
        result = Image.fromarray(arr.astype(np.uint8),'RGBA')
        return jsonify({'image': img_to_b64(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400




# ═══════════════════════════════════════════════════════════
# ADVANCED FEATURES — Panorama, HDR, RAW, Face Retouch, Batch
# ═══════════════════════════════════════════════════════════

# ── PANORAMA STITCHING ───────────────────────────────────
@app.route('/api/panorama', methods=['POST'])
def panorama_stitch():
    try:
        import cv2
        d = request.json
        images_b64 = d.get('images', [])
        if len(images_b64) < 2:
            return jsonify({'error': 'Need at least 2 images'}), 400
        imgs_cv = []
        for b64 in images_b64:
            pil = b64_to_img(b64).convert('RGB')
            arr = np.array(pil)
            imgs_cv.append(cv2.cvtColor(arr, cv2.COLOR_RGB2BGR))
        stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
        status, pano = stitcher.stitch(imgs_cv)
        if status != cv2.Stitcher_OK:
            codes = {1:'ERR_NEED_MORE_IMGS', 2:'ERR_HOMOGRAPHY_EST_FAIL', 3:'ERR_CAMERA_PARAMS_ADJUST_FAIL'}
            return jsonify({'error': f'Stitching failed: {codes.get(status, status)}. Try with more overlap between images.'}), 400
        pano_rgb = cv2.cvtColor(pano, cv2.COLOR_BGR2RGB)
        # Auto-crop black borders
        gray = cv2.cvtColor(pano, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 1, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            x, y, w, h = cv2.boundingRect(max(contours, key=cv2.contourArea))
            pano_rgb = pano_rgb[y:y+h, x:x+w]
        h_img, w_img = pano_rgb.shape[:2]
        result = Image.fromarray(pano_rgb).convert('RGBA')
        return jsonify({'image': img_to_b64(result), 'width': w_img, 'height': h_img})
    except ImportError:
        return jsonify({'error': 'opencv-python not installed. Run: pip install opencv-python-headless'}), 400
    except Exception as e:
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 400

# ── HDR MERGE ────────────────────────────────────────────
@app.route('/api/hdr', methods=['POST'])
def hdr_merge():
    try:
        import cv2
        d = request.json
        images_b64 = d.get('images', [])
        exposures_in = d.get('exposures', [])
        method = d.get('method', 'mertens')
        autores = d.get('autoresize',False)
        if len(images_b64) < 2:
            return jsonify({'error': 'Need at least 2 images'}), 400
        imgs_cv = []
        for idx, b64 in enumerate(images_b64):
            try:
                pil = b64_to_img(b64).convert('RGB')
                arr = np.array(pil, dtype=np.uint8)
                imgs_cv.append(cv2.cvtColor(arr, cv2.COLOR_RGB2BGR))
            except Exception as e:
                return jsonify({
                    "error": f"Image {idx} invalid",
                    "detail": str(e),
                    "preview": str(b64)[:200]
                }), 400
        exposures = np.array(exposures_in if exposures_in else
                             [2**i for i in range(-(len(imgs_cv)//2), len(imgs_cv)//2 + 1)][:len(imgs_cv)],
                             dtype=np.float32)
        sizes = [(img.shape[1], img.shape[0]) for img in imgs_cv]
        if autores == False:
            if len(set(sizes)) > 1:
                return jsonify({
                    "error": "All HDR images must have the same dimensions",
                    "sizes": sizes
                }), 400
        h, w = imgs_cv[0].shape[:2]

        for i in range(len(imgs_cv)):
            if imgs_cv[i].shape[:2] != (h, w):
                imgs_cv[i] = cv2.resize(
                    imgs_cv[i],
                    (w, h),
                    interpolation=cv2.INTER_AREA
                )


        if method == 'mertens':
            # Exposure fusion (no camera response needed, looks great)
            merge = cv2.createMergeMertens()
            hdr = merge.process(imgs_cv)
            hdr_8u = np.clip(hdr * 255, 0, 255).astype(np.uint8)
        else:
            # Debevec HDR + Reinhard tone mapping
            calibrate = cv2.createCalibrateDebevec()
            response = calibrate.process(imgs_cv, times=exposures)
            merge = cv2.createMergeDebevec()
            hdr_float = merge.process(imgs_cv, times=exposures, response=response)
            tonemap = cv2.createTonemapReinhard(gamma=1.5, intensity=0, light_adapt=0.8, color_adapt=0)
            ldr = tonemap.process(hdr_float)
            hdr_8u = np.clip(ldr * 255, 0, 255).astype(np.uint8)
        rgb = cv2.cvtColor(hdr_8u, cv2.COLOR_BGR2RGB)
        result = Image.fromarray(rgb).convert('RGBA')
        return jsonify({'image': img_to_b64(result)})
    except ImportError:
        return jsonify({'error': 'opencv-python not installed. Run: pip install opencv-python-headless'}), 400
    except Exception as e:
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 400

# ── RAW FILE OPEN ────────────────────────────────────────
@app.route('/api/raw/open', methods=['POST'])
def raw_open():
    try:
        import rawpy
        d = request.json
        file_b64 = d.get('file', '')
        filename = d.get('filename', 'image.cr2')
        exposure = float(d.get('exposure', 0))
        brightness = float(d.get('brightness', 1.0))
        contrast = float(d.get('contrast', 1.0))
        use_camera_wb = bool(d.get('use_camera_wb', True))
        no_auto_bright = bool(d.get('no_auto_bright', False))
        # Decode base64 to bytes
        if ',' in file_b64:
            file_b64 = file_b64.split(',')[1]
        raw_bytes = base64.b64decode(file_b64)
        # Write to temp file (rawpy needs file path)
        import tempfile, os
        suffix = os.path.splitext(filename)[1] or '.cr2'
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name
        try:
            with rawpy.imread(tmp_path) as raw:
                rgb = raw.postprocess(
                    use_camera_wb=use_camera_wb,
                    no_auto_bright=no_auto_bright,
                    exp_shift=2.0 ** exposure,
                    output_bps=8
                )
        finally:
            os.unlink(tmp_path)
        # Apply brightness/contrast
        result = Image.fromarray(rgb).convert('RGBA')
        if brightness != 1.0:
            result = apply_to_rgb(result, lambda r: ImageEnhance.Brightness(r).enhance(brightness))
        if contrast != 1.0:
            result = apply_to_rgb(result, lambda r: ImageEnhance.Contrast(r).enhance(contrast))
        return jsonify({'image': img_to_b64(result), 'width': result.width, 'height': result.height})
    except ImportError:
        return jsonify({'error': 'rawpy not installed. Run: pip install rawpy'}), 400
    except Exception as e:
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 400

# ── FACE RETOUCH ─────────────────────────────────────────
@app.route('/api/ai/face_retouch', methods=['POST'])
def face_retouch():
    try:
        import cv2
        d = request.json
        img = b64_to_img(d['image'])
        smooth = int(d.get('smooth', 15))       # bilateral filter strength
        brighten = float(d.get('brighten', 0))  # 0–1
        sharpen_eyes = bool(d.get('sharpen_eyes', False))
        teeth_whiten = bool(d.get('teeth_whiten', False))
        arr = np.array(img.convert('RGB'))
        bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        # Face detection
        face_cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        eye_cascade_path  = cv2.data.haarcascades + 'haarcascade_eye.xml'
        face_cascade = cv2.CascadeClassifier(face_cascade_path)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
        result_bgr = bgr.copy()
        if len(faces) == 0:
            # No face detected — apply globally as fallback
            d_val = max(1, smooth * 2 + 1)
            if d_val % 2 == 0: d_val += 1
            result_bgr = cv2.bilateralFilter(bgr, d_val, smooth * 3, smooth * 3)
        else:
            for (fx, fy, fw, fh) in faces:
                roi = result_bgr[fy:fy+fh, fx:fx+fw]
                # Skin smoothing: bilateral filter
                d_val = max(1, smooth * 2 + 1)
                if d_val % 2 == 0: d_val += 1
                smoothed = cv2.bilateralFilter(roi, d_val, smooth * 3, smooth * 3)
                # Blend: keep edges sharp
                roi_gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                edges = cv2.Canny(roi_gray, 30, 80)
                edges_3c = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR) / 255.0
                blended = (smoothed * (1 - edges_3c) + roi * edges_3c).astype(np.uint8)
                # Brighten skin
                if brighten > 0:
                    hsv = cv2.cvtColor(blended, cv2.COLOR_BGR2HSV).astype(np.float32)
                    hsv[:,:,2] = np.clip(hsv[:,:,2] * (1 + brighten), 0, 255)
                    blended = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
                result_bgr[fy:fy+fh, fx:fx+fw] = blended
                # Eye sharpening
                if sharpen_eyes:
                    eye_cascade = cv2.CascadeClassifier(eye_cascade_path)
                    face_gray = gray[fy:fy+fh, fx:fx+fw]
                    eyes = eye_cascade.detectMultiScale(face_gray, 1.1, 3)
                    for (ex, ey, ew, eh) in eyes:
                        eye_roi = result_bgr[fy+ey:fy+ey+eh, fx+ex:fx+ex+ew]
                        kernel = np.array([[0,-1,0],[-1,5,-1],[0,-1,0]])
                        result_bgr[fy+ey:fy+ey+eh, fx+ex:fx+ex+ew] = cv2.filter2D(eye_roi, -1, kernel)
                # Teeth whitening (bottom third of face)
                if teeth_whiten:
                    teeth_y = fy + int(fh * 0.65)
                    teeth_h = int(fh * 0.25)
                    teeth_roi = result_bgr[teeth_y:teeth_y+teeth_h, fx:fx+fw]
                    hsv_t = cv2.cvtColor(teeth_roi, cv2.COLOR_BGR2HSV).astype(np.float32)
                    # Only whiten bright/low-saturation pixels (teeth)
                    mask = (hsv_t[:,:,1] < 50) & (hsv_t[:,:,2] > 150)
                    hsv_t[:,:,2][mask] = np.clip(hsv_t[:,:,2][mask] * 1.15, 0, 255)
                    hsv_t[:,:,1][mask] = np.clip(hsv_t[:,:,1][mask] * 0.7, 0, 255)
                    result_bgr[teeth_y:teeth_y+teeth_h, fx:fx+fw] = cv2.cvtColor(hsv_t.astype(np.uint8), cv2.COLOR_HSV2BGR)
        rgb_result = cv2.cvtColor(result_bgr, cv2.COLOR_BGR2RGB)
        alpha = np.array(img)[:,:,3]
        result = Image.fromarray(np.dstack([rgb_result, alpha]), 'RGBA')
        face_count = len(faces) if len(faces) > 0 else 0
        return jsonify({'image': img_to_b64(result), 'faces_found': face_count})
    except ImportError:
        return jsonify({'error': 'opencv-python not installed. Run: pip install opencv-python-headless'}), 400
    except Exception as e:
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 400

# ── BATCH EXPORT (ZIP) ───────────────────────────────────
@app.route('/api/batch/export', methods=['POST'])
def batch_export():
    try:
        d = request.json
        files = d.get('files', [])  # [{name, data (base64)}]
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for item in files:
                name = item.get('name', 'output.png')
                b64 = item.get('data', '')
                if ',' in b64:
                    b64 = b64.split(',')[1]
                # Ensure PNG extension
                base = os.path.splitext(name)[0]
                zf.writestr(f'{base}_processed.png', base64.b64decode(b64))
        buf.seek(0)
        return jsonify({'data': 'data:application/zip;base64,' + base64.b64encode(buf.read()).decode()})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f'\n  PixelForge Pro v3.0')
    print(f'  Open:   http://localhost:{port}')
    print(f'  Editor: http://localhost:{port}/editor')
    print(f'  Press Ctrl+C to stop\n')
    app.run(debug=True, host='0.0.0.0', port=port)

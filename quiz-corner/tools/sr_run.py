"""AI picture sharpening, step 2 of 2: upscales a picture x4 with srvgg.onnx (onnxruntime, CPU, in tiles), then resizes to the given long side.
Usage: python3 -I tools/sr_run.py srvgg.onnx in.jpg out.jpg 2400   (used for the r1pic_/r3pic_ pictures, crew photos and logo)"""
# Real-ESRGAN (general x4v3) upscaling with tiles, then a high-quality resize to the target long side.
import sys, time, numpy as np, onnxruntime as ort
from PIL import Image
model, src, dst, longside = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
so = ort.SessionOptions(); so.intra_op_num_threads = 4
sess = ort.InferenceSession(model, so, providers=['CPUExecutionProvider'])
im = Image.open(src).convert('RGB'); a = np.asarray(im, np.float32) / 255.0
H, W, _ = a.shape; T, P = 192, 12; out = np.zeros((H * 4, W * 4, 3), np.float32)
t0 = time.time()
for y in range(0, H, T):
    for x in range(0, W, T):
        y0, x0, y1, x1 = max(y - P, 0), max(x - P, 0), min(y + T + P, H), min(x + T + P, W)
        tile = a[y0:y1, x0:x1].transpose(2, 0, 1)[None]
        r = sess.run(None, {'input': tile})[0][0].transpose(1, 2, 0)
        oy, ox = (y - y0) * 4, (x - x0) * 4; h, w = (min(y + T, H) - y) * 4, (min(x + T, W) - x) * 4
        out[y * 4:y * 4 + h, x * 4:x * 4 + w] = r[oy:oy + h, ox:ox + w]
big = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))
k = longside / max(big.size); fin = big.resize((round(big.size[0] * k), round(big.size[1] * k)), Image.LANCZOS) if k < 1 else big
fin.save(dst, quality=90, subsampling=2, optimize=True, progressive=True)
print(src.split('/')[-1], im.size, '->', fin.size, round(time.time() - t0, 1), 's')

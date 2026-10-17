"""AI picture sharpening (Real-ESRGAN realesr-general-x4v3) without PyTorch: step 1 of 2 — builds srvgg.onnx from the .pth.
Weights: https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth (BSD-3)
Usage: python3 -I tools/sr_build.py realesr-general-x4v3.pth srvgg.onnx <dir with the onnx package>"""
# Builds an ONNX model of Real-ESRGAN realesr-general-x4v3 (SRVGGNetCompact) from the .pth without torch.
import sys, zipfile, pickle, numpy as np
sys.path.insert(0, sys.argv[3])
import onnx
from onnx import helper, numpy_helper, TensorProto
pth, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(pth); root = z.namelist()[0].split('/')[0]
DT = {'FloatStorage': np.float32, 'HalfStorage': np.float16}
class StorageType:
    def __init__(self, name): self.name = name
def rebuild(storage, offset, size, stride, *a):
    arr = storage[offset: offset + int(np.prod(size)) if size else offset + 1]
    if not size: return arr[0]
    return np.lib.stride_tricks.as_strided(arr, shape=size, strides=[s * arr.itemsize for s in stride]).copy()
class U(pickle.Unpickler):
    def find_class(self, mod, name):
        if name == '_rebuild_tensor_v2': return rebuild
        if mod == 'torch' and name.endswith('Storage'): return StorageType(name)
        if mod == 'collections' and name == 'OrderedDict':
            import collections; return collections.OrderedDict
        return super().find_class(mod, name)
    def persistent_load(self, pid):
        _, st, key, loc, n = pid
        return np.frombuffer(z.read(f'{root}/data/{key}'), dtype=DT[st.name])
sd = U(z.open(f'{root}/data.pkl')).load()
if 'params' in sd: sd = sd['params']
print(len(sd), list(sd)[:4], list(sd)[-2:])
nodes, inits = [], []
x = 'input'; idx = 0; keys = sorted({int(k.split('.')[1]) for k in sd})
for i in keys:
    w = sd[f'body.{i}.weight'].astype(np.float32)
    if w.ndim == 4:
        inits += [numpy_helper.from_array(w, f'w{i}'), numpy_helper.from_array(sd[f'body.{i}.bias'].astype(np.float32), f'b{i}')]
        nodes.append(helper.make_node('Conv', [x, f'w{i}', f'b{i}'], [f'c{i}'], pads=[1, 1, 1, 1], kernel_shape=[3, 3])); x = f'c{i}'
    else:
        inits.append(numpy_helper.from_array(w.reshape(-1, 1, 1), f'p{i}'))
        nodes.append(helper.make_node('PRelu', [x, f'p{i}'], [f'a{i}'])); x = f'a{i}'
nodes.append(helper.make_node('DepthToSpace', [x], ['ps'], blocksize=4, mode='CRD'))
inits.append(numpy_helper.from_array(np.array([1, 1, 4, 4], np.float32), 'scales'))
nodes.append(helper.make_node('Resize', ['input', '', 'scales'], ['up'], mode='nearest'))
nodes.append(helper.make_node('Add', ['ps', 'up'], ['output']))
g = helper.make_graph(nodes, 'srvgg', [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, None, None])], [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, None, None])], inits)
m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 13)]); m.ir_version = 8
onnx.checker.check_model(m); onnx.save(m, out); print('saved', out)

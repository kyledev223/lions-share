"""
UV atlas for the crow, with xatlas. Run by build.py in its own process
(Blender's Python, outside Blender: xatlas crashes when loaded inside it):

  python -I unwrap.py <mesh.npz> <out.npz> <deps dir> <texture size>

mesh.npz holds V (n, 3) and F (t, 3). out.npz gets xatlas's vmap, idx, uvs.
xatlas is installed into <deps dir> on first use.
"""
import os
import subprocess
import sys
import time

src, out, deps, res = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
sys.path.insert(0, deps)
try:
    import xatlas
except ImportError:
    print("[crow] installing xatlas into", deps, flush=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--target", deps, "xatlas"], check=True)
    import xatlas

import numpy as np

d = np.load(src)
t = time.time()
atlas = xatlas.Atlas()
atlas.add_mesh(d["V"], d["F"])
co = xatlas.ChartOptions()
co.max_iterations = 1
po = xatlas.PackOptions()
po.resolution = res
po.padding = 4
po.bilinear = True
atlas.generate(co, po)
vmap, idx, uvs = atlas[0]
print("[crow] xatlas: %d charts, %d verts, %.0f%% of the texture used, %.0fs" % (atlas.chart_count, len(vmap), atlas.utilization * 100, time.time() - t), flush=True)
np.savez(out, vmap=vmap, idx=idx, uvs=uvs)

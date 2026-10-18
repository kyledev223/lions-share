"""
Blender side of `npm run mascot`. Run by scripts/mascot.mjs, not by hand:

  blender -b --factory-startup --python scripts/mascot/build.py -- <src dir> <out.glb> <preview dir> <work dir>

1. Takes the skinned mesh and rig from one Mixamo file (they all carry the
   same generated mesh, skinned to the same rig) and scales him to 1.9 m.
2. Unwraps it with xatlas (scripts/mascot/unwrap.py, cached in the preview dir).
3. Bakes the texture. The model comes white, so all colour comes from
   lion-apose.png, the image the model was generated from:
     - The image is projected onto the bind pose from the front,
       orthographically. The projection is fitted to the model's front
       silhouette (scale and offset, by overlap), then a smooth warp lines
       up the limbs' edges row by row and column by column.
     - Every vertex gets a region (mane, fur, suit, shirt, tie, shoes) from
       its bone weights plus the colour the projection gives it,
       where the front sees it. Unseen vertices (back, sides, under the
       arms) take the region of the nearest seen one across the surface.
     - Unseen areas are filled with region colours. Near the edge of what
       the front sees, they carry the photo's local shade and fade back to
       the region colour, so the seams blend.
     - Procedural detail in 3D (no UV seams): fine fabric noise on the suit,
       strands radiating out through the mane with golden tips, a fine grain
       on the fur of the face and hands.
     - A second texture holds ambient occlusion (R) and roughness (G) for
       PBR shading: glossy shoes, a silky tie, matte suit and fur.
4. Pulls the animation out of every Mixamo file as a named action.
5. Exports one .glb (mesh once + all clips; PNG textures, compressed later
   in scripts/mascot.mjs) and renders front/side/back previews.
"""
import hashlib
import math
import os
import subprocess
import sys

import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT_GLB, PREVIEW, WORK = (os.path.abspath(a) for a in argv[:4])
TEX = int(os.environ.get("MASCOT_TEX", "2048"))
HEIGHT = 1.9  # metres, head to soles; the scenes are laid out for this
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PYDEPS = os.path.join(ROOT, ".venv-assets", "blender-py")

# Slug -> clip file (already renamed by mascot.mjs). The first one found also provides the mesh.
CLIPS = ["idle", "sitting-idle", "presenting", "walking", "reaching", "looking-up", "toast", "typing", "looking-at-hand", "greeting"]

# Regions. Colours are sRGB; the fallback is half the named colour, half what the photo shows for that region.
LABELS = ["mane", "fur", "suit", "shirt", "tie", "shoe"]
NAMED = {
    "mane": (0.478, 0.310, 0.118),  # #7A4F1E, darker than the fur
    "fur": (0.753, 0.541, 0.243),  # #C08A3E, golden tan: face and hands
    "suit": (0.200, 0.205, 0.220),  # charcoal
    "shirt": (0.930, 0.935, 0.950),
    "tie": (0.898, 0.137, 0.184),  # #E5232F
    "shoe": (0.020, 0.020, 0.024),
}
ROUGH = {"mane": 0.7, "fur": 0.75, "suit": 0.82, "shirt": 0.62, "tie": 0.3, "shoe": 0.2}
MANE, FUR, SUIT, SHIRT, TIE, SHOE = range(len(LABELS))
LABEL_TINT = np.array([(0.55, 0.3, 0.05), (1, 0.75, 0.3), (0.35, 0.35, 0.35), (1, 1, 1), (0.9, 0.1, 0.15), (0.1, 0.5, 0.9)], np.float32)

def log(*a):
    print("[mascot]", *a, flush=True)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def save_png(name, arr):
    """arr (h, w, 3) floats, row 0 at the bottom (Blender's order)."""
    h, w = arr.shape[:2]
    im = bpy.data.images.new(name, w, h, alpha=False)
    im.pixels.foreach_set(np.concatenate([np.clip(arr, 0, 1).astype(np.float32), np.ones((h, w, 1), np.float32)], 2).ravel())
    path = name if os.path.isabs(name) else os.path.join(PREVIEW, name)
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    return im


# ---------------------------------------------------------------------------
# Scene and base rig
# ---------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30

clip_files = {c: os.path.join(SRC, c + ".fbx") for c in CLIPS if os.path.exists(os.path.join(SRC, c + ".fbx"))}
if not clip_files:
    raise SystemExit("no clip files found in " + SRC)
missing = [c for c in CLIPS if c not in clip_files]
if missing:
    log("WARNING: missing clips:", ", ".join(missing))
base_clip = next(iter(clip_files))
log("mesh and rig from", base_clip + ".fbx")

bpy.ops.import_scene.fbx(filepath=clip_files[base_clip])
arm = next(o for o in scene.objects if o.type == "ARMATURE")
mesh = next(o for o in scene.objects if o.type == "MESH")
arm.name = arm.data.name = "Lion"
mesh.name = mesh.data.name = "LionBody"
base_action = arm.animation_data.action if arm.animation_data else None
arm.data.pose_position = "REST"
bpy.context.view_layer.update()
me = mesh.data

# All triangles, so polygons, loops and the unwrap line up one to one.
import bmesh  # noqa: E402

bm = bmesh.new()
bm.from_mesh(me)
quads = [f for f in bm.faces if len(f.verts) != 3]
if quads:
    bmesh.ops.triangulate(bm, faces=quads)
bm.to_mesh(me)
bm.free()

# Smooth normals: the FBX carries custom split normals (every triangle corner its own vertex) and marks every edge sharp.
bpy.context.view_layer.objects.active = mesh
for o in scene.objects:
    o.select_set(o == mesh)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.customdata_custom_splitnormals_clear()
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.shade_smooth()
if "sharp_edge" in me.attributes:
    me.attributes.remove(me.attributes["sharp_edge"])


def bind_positions():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg).to_mesh()
    co = np.empty(len(ev.vertices) * 3, np.float64)
    ev.vertices.foreach_get("co", co)
    mesh.evaluated_get(dg).to_mesh_clear()
    M = np.array(mesh.matrix_world)
    co = co.reshape(-1, 3)
    return co @ M[:3, :3].T + M[:3, 3]


# Scale to 1.9 m (generated models and Mixamo hand him over ~50 units tall). The armature keeps
# the scale as an object transform, so the clips' hip translations scale with it.
P = bind_positions()
k = HEIGHT / (P[:, 2].max() - P[:, 2].min())
arm.scale = arm.scale * k
bpy.context.view_layer.update()
P = bind_positions()
F = np.empty(len(me.polygons) * 3, np.int64)
me.polygons.foreach_get("vertices", F)
F = F.reshape(-1, 3)
nv = len(P)
zmin, zmax = P[:, 2].min(), P[:, 2].max()
H = zmax - zmin
log("verts", nv, "tris", len(F), "bbox (m)", P.min(0).round(3), P.max(0).round(3))


def bone_world(name):
    return np.array(arm.matrix_world @ arm.data.bones["mixamorig:" + name].head_local)


# ---------------------------------------------------------------------------
# UVs: xatlas, out of process, cached by mesh contents.
# ---------------------------------------------------------------------------
key = hashlib.sha1(P.astype(np.float32).tobytes() + F.astype(np.int32).tobytes() + str(TEX).encode()).hexdigest()[:16]
uv_cache = os.path.join(PREVIEW, "uv-%s.npz" % key)
if not os.path.exists(uv_cache):
    mesh_npz = os.path.join(WORK, "mesh.npz")
    # xatlas's thresholds are absolute: at ~50 units tall it makes ~2k clean charts, at 1.9 it shatters into ~11k.
    np.savez(mesh_npz, V=(P * (50 / H)).astype(np.float32), F=F.astype(np.uint32))
    log("unwrapping with xatlas (a few minutes; cached afterwards)")
    subprocess.run([sys.executable, "-I", os.path.join(ROOT, "scripts", "mascot", "unwrap.py"), mesh_npz, uv_cache, PYDEPS, str(TEX)], check=True)
else:
    log("uv atlas from cache", os.path.basename(uv_cache))
for f in os.listdir(PREVIEW):  # older atlases
    if f.startswith("uv-") and f.endswith(".npz") and f != os.path.basename(uv_cache):
        os.remove(os.path.join(PREVIEW, f))
ua = np.load(uv_cache)
if not (ua["vmap"][ua["idx"]] == F).all():
    raise SystemExit("uv atlas does not match the mesh")
loop_uv = ua["uvs"][ua["idx"]].reshape(-1, 2).astype(np.float32)  # polygon i owns loops 3i..3i+2
uvl = me.uv_layers.new(name="UVMap")
uvl.data.foreach_set("uv", loop_uv.ravel())
me.uv_layers.active = uvl
vert_uv = np.zeros((nv, 2), np.float32)
vert_uv[F.ravel()] = loop_uv

# ---------------------------------------------------------------------------
# Source image: figure mask, then bleed the figure's colours into the background
# so samples right at the silhouette edge never pick up the grey backdrop.
# ---------------------------------------------------------------------------
src = bpy.data.images.load(os.path.join(SRC, "lion-apose.png"))
W, Hh = src.size
px = np.empty(W * Hh * 4, dtype=np.float32)
src.pixels.foreach_get(px)
rgb = px.reshape(Hh, W, 4)[:, :, :3].copy()  # sRGB values, row 0 = bottom
lum = rgb.mean(2)
sat = rgb.max(2) - rgb.min(2)


def dilate(m, r=1):
    o = m.copy()
    for _ in range(r):
        p = o.copy()
        p[1:] |= o[:-1]
        p[:-1] |= o[1:]
        p[:, 1:] |= o[:, :-1]
        p[:, :-1] |= o[:, 1:]
        o = p
    return o


def erode(m, r=1):
    return ~dilate(~m, r)


def blur(a, r):
    """Box blur, applied twice (roughly Gaussian), along both axes."""
    for _ in range(2):
        for ax in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(a.ndim)], mode="edge"), axis=ax)
            a = (np.take(c, range(2 * r + 1, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a


# Background: light, unsaturated, and connected to the border. Grown at half resolution.
s = 2
bg_like = ((lum > 0.42) & (sat < 0.08))[::s, ::s]
bg = np.zeros_like(bg_like)
bg[0, :] = bg[-1, :] = True
bg[:, 0] = bg[:, -1] = True
bg &= bg_like
for _ in range(3000):
    grown = dilate(bg) & bg_like
    if (grown == bg).all():
        break
    bg = grown
fg_half = erode(dilate(~bg, 1), 1)
fg_full = np.repeat(np.repeat(fg_half, s, 0), s, 1)[:Hh, :W]
fg = erode(fg_full, 2)  # stay off the anti-aliased edge
ys, xs = np.nonzero(fg)
log("figure bbox px x", xs.min(), xs.max(), "y", ys.min(), ys.max())

known = fg.copy()
col = np.where(known[..., None], rgb, 0)
for _ in range(48):
    acc = np.zeros_like(col)
    cnt = np.zeros(known.shape, np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        kk = np.roll(np.roll(known, dy, 0), dx, 1)
        c = np.roll(np.roll(col, dy, 0), dx, 1)
        acc += c * kk[..., None]
        cnt += kk
    new = (~known) & (cnt > 0)
    col[new] = acc[new] / cnt[new][:, None]
    known |= new
col[~known] = rgb[~known]
bled = col
fg_soft = blur(fg.astype(np.float32), 2)  # 1 well inside the figure, 0 outside


def sample(img, u, v):
    """Bilinear lookup; u, v in pixels (v from the bottom), pixel centres at +0.5."""
    h, w = img.shape[:2]
    x = np.clip(u - 0.5, 0, w - 1.001)
    y = np.clip(v - 0.5, 0, h - 1.001)
    x0 = x.astype(np.int64)
    y0 = y.astype(np.int64)
    fx = (x - x0)
    fy = (y - y0)
    if img.ndim == 3:
        fx, fy = fx[:, None], fy[:, None]
    a = img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx
    b = img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


# ---------------------------------------------------------------------------
# Fit the projection: model (x, z) -> image (u, v) in pixels, maximising the
# overlap between the model's front silhouette and the figure mask.
# ---------------------------------------------------------------------------
q = 4  # quarter resolution
mask_q = fg_full[::q, ::q]
mh, mw = mask_q.shape
rng = np.random.default_rng(1)
tri_pts = P[F]
bary = rng.dirichlet((1, 1, 1), size=(len(F), 2))
samples = np.concatenate([np.einsum("tsk,tkd->tsd", bary, tri_pts).reshape(-1, 3), P])
sx_, sz_ = samples[:, 0], samples[:, 2]


def silhouette(params, qq=q, shape=(mh, mw)):
    a, b, c, d = params  # u = a*x + b, v = c*z + d (pixels, v from bottom)
    u = ((a * sx_ + b) / qq).astype(np.int32)
    v = ((c * sz_ + d) / qq).astype(np.int32)
    ok = (u >= 0) & (u < shape[1]) & (v >= 0) & (v < shape[0])
    m = np.zeros(shape, bool)
    m[v[ok], u[ok]] = True
    return erode(dilate(m, 1), 1)


def iou(params):
    m = silhouette(params)
    return (m & mask_q).sum() / max(1, (m | mask_q).sum())


x0, x1 = P[:, 0].min(), P[:, 0].max()
a = (xs.max() - xs.min()) / (x1 - x0)
c = (ys.max() - ys.min()) / (zmax - zmin)
params = np.array([a, xs.min() - a * x0, c, ys.min() - c * zmin], dtype=np.float64)
best = iou(params)
log("projection fit, bbox start: IoU %.4f" % best)
steps = np.array([a * 0.02, 8.0, c * 0.02, 8.0])
for _ in range(14):
    improved = False
    for i in range(4):
        for sgn in (1, -1):
            trial = params.copy()
            trial[i] += sgn * steps[i]
            # Keep scale changes centred on the figure so they don't drag it sideways.
            if i == 0:
                trial[1] -= sgn * steps[0] * (x0 + x1) / 2
            if i == 2:
                trial[3] -= sgn * steps[2] * (zmin + zmax) / 2
            score = iou(trial)
            if score > best:
                best, params, improved = score, trial, True
    if not improved:
        steps *= 0.5
log("projection fit, refined: IoU %.4f" % best, "params", params.round(3))
pa, pb, pc, pd = params

# ---------------------------------------------------------------------------
# Warp: line up the edges of the model's silhouette with the figure's, row by
# row (dx) and column by column (dy), at half resolution. Where the two have
# the same number of runs, each run's ends map onto the other's; the field is
# interpolated between runs, filled across rows that don't match, smoothed,
# and capped. It is a displacement in image pixels, looked up at the globally
# projected point.
# ---------------------------------------------------------------------------
wq = 2
model_h = silhouette(params, wq, (Hh // wq, W // wq))
model_h = erode(dilate(model_h, 2), 2)
fig_h = fg_full[::wq, ::wq][: Hh // wq, : W // wq]


def runs(line, min_len=3):
    d = np.diff(np.concatenate([[0], line.astype(np.int8), [0]]))
    st, en = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]
    keep = (en - st) >= min_len
    return st[keep], en[keep]


def edge_field(model, fig, axis):
    """Displacement along `axis` (1 = x per row, 0 = y per column) so model edges land on figure edges."""
    mm = model if axis == 1 else model.T
    ff = fig if axis == 1 else fig.T
    n, L = mm.shape
    out = np.zeros((n, L), np.float32)
    ok = np.zeros(n, bool)
    xs_ = np.arange(L)
    for i in range(n):
        ms, me_ = runs(mm[i])
        fs, fe = runs(ff[i])
        if len(ms) == 0 or len(ms) != len(fs):
            continue
        # Runs must pair up plausibly (overlap or nearly).
        if np.any(np.abs((ms + me_) - (fs + fe)) / 2 > 12) or np.any(np.abs((me_ - ms) - (fe - fs)) > 14):
            continue
        kx = np.concatenate([ms, me_]).astype(np.float64)
        kd = np.concatenate([fs - ms, fe - me_]).astype(np.float64)
        o = np.argsort(kx)
        out[i] = np.interp(xs_, kx[o], kd[o])
        ok[i] = True
    if ok.sum() < 2:
        return np.zeros_like(model, np.float32)
    # Rows that didn't match: interpolate from the nearest that did.
    idx_ok = np.nonzero(ok)[0]
    for j in range(L):
        out[~ok, j] = np.interp(np.nonzero(~ok)[0], idx_ok, out[ok, j])
    out = blur(out, 4)
    out = np.clip(out, -10, 10)
    return out if axis == 1 else out.T


dx_h = edge_field(model_h, fig_h, 1)
dy_h = edge_field(model_h, fig_h, 0)
# Back to full resolution, in full-res pixels.
dx_f = np.repeat(np.repeat(dx_h, wq, 0), wq, 1)[:Hh, :W] * wq
dy_f = np.repeat(np.repeat(dy_h, wq, 0), wq, 1)[:Hh, :W] * wq
dx_f = np.pad(dx_f, ((0, Hh - dx_f.shape[0]), (0, W - dx_f.shape[1])), mode="edge")
dy_f = np.pad(dy_f, ((0, Hh - dy_f.shape[0]), (0, W - dy_f.shape[1])), mode="edge")
log("warp: |dx| p95 %.1f px, |dy| p95 %.1f px" % (np.percentile(np.abs(dx_f), 95), np.percentile(np.abs(dy_f), 95)))


def project(p):
    """Bind-pose world points (n, 3) -> image pixel coords (u, v), warp included."""
    u = pa * p[:, 0] + pb
    v = pc * p[:, 2] + pd
    return u + sample(dx_f, u, v), v + sample(dy_f, u, v)


# Overlay for checking the fit by eye: the photo, the figure's edge in green,
# the model's edge (after the warp) in red, at half resolution.
uu, vv = project(samples)
oq = 2
oh, ow = Hh // oq, W // oq
warped = np.zeros((oh, ow), bool)
ui, vi = (uu / oq).astype(int), (vv / oq).astype(int)
ok = (ui >= 0) & (ui < ow) & (vi >= 0) & (vi < oh)
warped[vi[ok], ui[ok]] = True
warped = erode(dilate(warped, 2), 2)
fig_o = fg_full[::oq, ::oq][:oh, :ow]
log("projection fit, warped: IoU %.4f" % ((warped & fig_o).sum() / max(1, (warped | fig_o).sum())))
ov = rgb[::oq, ::oq][:oh, :ow] * 0.55
ov[fig_o & ~erode(fig_o, 1)] = (0.1, 1, 0.1)
ov[warped & ~erode(warped, 1)] = (1, 0.15, 0.1)
save_png("projection-fit.png", ov)

if os.environ.get("MASCOT_STOP") == "fit":
    raise SystemExit(0)

# ---------------------------------------------------------------------------
# Bakes: bind-pose position and normal per texel, visibility from the front,
# ambient occlusion.
# ---------------------------------------------------------------------------
mat = bpy.data.materials.new("LionSkin")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
N = nt.nodes.new
L = nt.links.new
out_node = N("ShaderNodeOutputMaterial")
emit = N("ShaderNodeEmission")
diff = N("ShaderNodeBsdfDiffuse")
diff.inputs["Color"].default_value = (1, 1, 1, 1)
geo = N("ShaderNodeNewGeometry")
lo = P.min(0) - 0.01
span = (P.max(0) + 0.01) - lo
pos_n = N("ShaderNodeVectorMath")
pos_n.operation = "MULTIPLY_ADD"
L(geo.outputs["Position"], pos_n.inputs[0])
pos_n.inputs[1].default_value = tuple(1 / span)
pos_n.inputs[2].default_value = tuple(-lo / span)
nrm_n = N("ShaderNodeVectorMath")
nrm_n.operation = "MULTIPLY_ADD"
L(geo.outputs["Normal"], nrm_n.inputs[0])
nrm_n.inputs[1].default_value = (0.5, 0.5, 0.5)
nrm_n.inputs[2].default_value = (0.5, 0.5, 0.5)
attr_fill = N("ShaderNodeVertexColor")
attr_fill.layer_name = "fill"
attr_par = N("ShaderNodeVertexColor")
attr_par.layer_name = "params"
target = N("ShaderNodeTexImage")
nt.nodes.active = target
me.materials.clear()
me.materials.append(mat)

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 1
scene.render.bake.margin = 16
scene.render.bake.margin_type = "EXTEND"
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0
scene.world = world


def bake(name, kind, source=None, samples=1):
    img = bpy.data.images.new(name, TEX, TEX, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    target.image = img
    for l in list(nt.links):
        if l.to_node == out_node:
            nt.links.remove(l)
    if kind == "EMIT":
        for l in list(emit.inputs["Color"].links):
            nt.links.remove(l)
        L(source, emit.inputs["Color"])
        L(emit.outputs[0], out_node.inputs["Surface"])
    else:
        L(diff.outputs[0], out_node.inputs["Surface"])
    scene.cycles.samples = samples
    log("baking", name)
    if kind == "EMIT":
        bpy.ops.object.bake(type="EMIT")
    elif kind == "AO":
        bpy.ops.object.bake(type="AO")
    else:
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT"})
    a = np.empty(TEX * TEX * 4, np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(TEX, TEX, 4)[..., :3]


pos_map = bake("pos", "EMIT", pos_n.outputs[0]).reshape(-1, 3) * span + lo
nrm_map = bake("nrm", "EMIT", nrm_n.outputs[0]).reshape(-1, 3) * 2 - 1

# Visibility from the front: a sun shining along +Y, hard shadows. Lit = the
# projection can see it; the N·L falloff fades it out toward the silhouette.
sun_data = bpy.data.lights.new("front", "SUN")
sun_data.energy = 1.0
sun_data.angle = 0.0
sun = bpy.data.objects.new("front", sun_data)
sun.rotation_euler = (math.radians(90), 0, 0)
scene.collection.objects.link(sun)
vis_map = bake("vis", "DIFFUSE", samples=16).mean(2)
vis_map = (vis_map / max(1e-6, np.percentile(vis_map, 99.5))).ravel()
bpy.data.objects.remove(sun)

world.light_settings.distance = 0.12  # metres: creases, folds, under the collar and the mane
ao_map = bake("ao", "AO", samples=96).mean(2)
ao_map = blur(ao_map, 1).ravel()

# ---------------------------------------------------------------------------
# Per vertex: what the front sees, and which region it is.
# ---------------------------------------------------------------------------
def texel(uv):
    t = np.clip((uv * TEX).astype(np.int64), 0, TEX - 1)
    return t[:, 1] * TEX + t[:, 0]


vvis = vis_map[texel(vert_uv)]
pu, pv = project(P)
vcol = sample(bled, pu, pv)
vin = sample(fg_soft, pu, pv)
seen = (vvis > 0.3) & (vin > 0.9)

gname = {g.index: g.name.replace("mixamorig:", "") for g in mesh.vertex_groups}
wts = {}
for v in me.vertices:
    for g in v.groups:
        wts.setdefault(gname[g.group], np.zeros(nv))[v.index] = g.weight
Wsum = lambda *names: sum((wts.get(n, np.zeros(nv)) for n in names), np.zeros(nv))
headw = Wsum("Head", "Neck", "HeadTop_End")
handw = Wsum(*[n for n in wts if "Hand" in n])
footw = Wsum("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftToe_End", "RightToe_End")
rel = (P[:, 2] - zmin) / H

# The collar line and the top of the shoes, read off the image: the lowest
# row of fur above the shirt, the highest row of shoe below the trousers.
def img_rel(row):
    return ((row - pd) / pc - zmin) / H


cx_img = int(pa * 0 + pb)
strip = slice(max(0, cx_img - 30), cx_img + 30)
# Only the figure counts (the light studio backdrop would pass for shirt), only neutral whites
# (not the cream fur of the chin), and only below the head bone.
shirtish = fg[:, strip] & (lum[:, strip] > 0.72) & (sat[:, strip] < 0.1)
head_row = int(pc * bone_world("Head")[2] + pd)
white_rows = np.nonzero(shirtish.mean(1)[:head_row] > 0.3)[0]
collar_rel = img_rel(white_rows.max()) if len(white_rows) else 0.84
foot_x = int(pa * bone_world("LeftFoot")[0] + pb)
foot_col = rgb[:, foot_x - 25: foot_x + 25]
glossy = (foot_col.max(2) < 0.13).mean(1) > 0.5  # shoes are near black, trousers a shade lighter
shoe_rows = np.nonzero(glossy[: int(pc * (zmin + H * 0.15) + pd)])[0]
shoe_rel = img_rel(shoe_rows.max()) if len(shoe_rows) else 0.07
log("collar at %.3f of his height, shoes up to %.3f" % (collar_rel, shoe_rel))

vl = vcol.mean(1)
vs = vcol.max(1) - vcol.min(1)
is_white = (vl > 0.55) & (vs < 0.12)
# The tie is a strong red; tan fur is warm too but much less red against green (r - g about 0.2).
is_red = (vcol[:, 0] - vcol[:, 1] > 0.32) & (vcol[:, 0] > 0.45) & (vcol[:, 1] < 0.35)
is_tan = (vcol[:, 0] > vcol[:, 1]) & (vcol[:, 1] > vcol[:, 2]) & (vcol[:, 0] - vcol[:, 2] > 0.15) & ~is_red

# The face: the front of the head, within reach of the muzzle (the head's most forward point).
hb = bone_world("Head")
head_pts = P[headw > 0.5]
muzzle = head_pts[np.argmin(head_pts[:, 1])]
front_d = np.hypot(P[:, 0] - muzzle[0], P[:, 2] - (muzzle[2] + 0.02))
face_geo = (headw > 0.3) & (P[:, 1] < hb[1]) & (front_d < 0.095)

lab = np.full(nv, SUIT, np.int64)
# Head and neck: mane all round, golden fur on the face. Where the front sees tan,
# the lighter half is fur and the darker half is mane.
head = (headw > 0.5) & (rel > collar_rel - 0.02)
tan_head = seen & head & is_tan
split = np.median(vl[tan_head]) if tan_head.sum() > 50 else 0.4
lab[head] = MANE
lab[head & face_geo] = FUR
lab[head & seen & is_tan & (vl > split) & (front_d < 0.13)] = FUR
lab[head & seen & is_tan & (vl < split * 0.9)] = MANE
lab[(headw > 0.3) & (rel > collar_rel + 0.01) & (lab == SUIT)] = MANE
# Body: shirt, tie (and the pocket square), suit; hands are fur.
body = ~head
lab[body & is_white] = SHIRT
lab[body & is_red & (rel > 0.5)] = TIE
lab[(handw > 0.6) & ~is_white] = FUR
lab[(footw > 0.3) & (rel < shoe_rel + 0.004)] = SHOE
# Unseen vertices only keep the geometric part of that (hands, shoes, head); the colour part spreads from seen ones below.
geo_only = np.full(nv, -1, np.int64)
geo_only[headw > 0.5] = MANE
geo_only[(headw > 0.3) & (rel > collar_rel + 0.01)] = MANE
geo_only[face_geo] = FUR
geo_only[handw > 0.6] = FUR
geo_only[(footw > 0.3) & (rel < shoe_rel + 0.004)] = SHOE

# Mesh adjacency.
E = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
E = np.unique(np.sort(E, 1), axis=0)
ea = np.concatenate([E[:, 0], E[:, 1]])
eb = np.concatenate([E[:, 1], E[:, 0]])

# Seen vertices: majority filter so stray dark folds or highlights don't flip a region.
K = len(LABELS)
for _ in range(3):
    cnt = np.zeros((nv, K))
    np.add.at(cnt, (ea, lab[eb]), 1)
    cnt[np.arange(nv), lab] += 1.5
    lab = np.where(seen, cnt.argmax(1), lab)

# Unseen: take the nearest seen vertex's label across the surface (breadth-first),
# unless geometry already says what it is (head, hands, shoes) and the seen label disagrees.
final = np.where(seen, lab, -1)
for _ in range(4000):
    m = (final[ea] < 0) & (final[eb] >= 0)
    if not m.any():
        break
    final[ea[m]] = final[eb[m]]
final[final < 0] = SUIT
override = (~seen) & (geo_only >= 0) & (final != geo_only) & ~((geo_only == MANE) & (final == FUR) & (front_d < 0.13))
# The shirt collar only shows as a thin band right at the collar line, not up the back of his head.
collar_band = (geo_only == MANE) & (final == SHIRT) & (rel < collar_rel + 0.012)
override &= ~collar_band
final[override] = geo_only[override]
# The tie and the shirt front don't wrap round his back, and nor does the face:
# behind the head it is all mane.
back = (~seen) & (P[:, 1] > np.median(P[:, 1]))
final[back & np.isin(final, [TIE])] = SUIT
final[back & (headw > 0.5) & (final == FUR)] = MANE
armw = Wsum("LeftForeArm", "RightForeArm") + handw
unseen_shirt = (~seen) & (final == SHIRT)
final[unseen_shirt & (rel < collar_rel - 0.012) & (armw < 0.3)] = SUIT
# Behind the neck the mane hangs over the collar, so no shirt shows there.
nape = unseen_shirt & (rel > collar_rel - 0.03) & (armw < 0.3)
final[nape] = np.where(headw[nape] > 0.2, MANE, SUIT)
final[(~seen) & (final == SHOE) & (rel > shoe_rel + 0.008)] = SUIT
# Fur that spread round the back of a sleeve (away from the hands and head) is sleeve.
final[(~seen) & (final == FUR) & (handw < 0.3) & (headw < 0.3)] = SUIT
for _ in range(2):
    cnt = np.zeros((nv, K))
    np.add.at(cnt, (ea, final[eb]), 1)
    cnt[np.arange(nv), final] += 1.5
    final = np.where(seen, final, cnt.argmax(1))
final[(~seen) & (final == SHIRT) & (rel < collar_rel - 0.012) & (armw < 0.3)] = SUIT
final[(~seen) & (final == SHOE) & (rel > shoe_rel + 0.008)] = SUIT
lab = final
log("regions", {LABELS[i]: int((lab == i).sum()) for i in range(K)}, "seen %.0f%%" % (seen.mean() * 100))

# Fallback colour per region: half the named colour, half the photo's median for it.
base = np.zeros((K, 3))
for i, name in enumerate(LABELS):
    sel = seen & (lab == i)
    photo = np.median(vcol[sel], 0) if sel.sum() > 50 else np.array(NAMED[name])
    base[i] = np.array(NAMED[name]) * 0.5 + photo * 0.5
    log("region %-8s named %s photo %s" % (name, np.round(NAMED[name], 3), np.round(photo, 3)))

# Seam matching: the photo's local shade (low-passed, capped) where seen, spread
# smoothly into the unseen part of the same region (a harmonic fill), and faded
# back to the plain region colour over ~6 cm of surface.
same = lab[ea] == lab[eb]
sa, sb = ea[same], eb[same]
deg = np.bincount(sa, minlength=nv).astype(np.float64)


def nbr_mean(x, only=None):
    """Mean of each vertex's same-region neighbours (optionally only those in `only`)."""
    m = np.ones(len(sa), bool) if only is None else only[sb]
    out = np.stack([np.bincount(sa[m], x[sb[m], c], minlength=nv) for c in range(x.shape[1])], 1)
    cnt = np.bincount(sa[m], minlength=nv).astype(np.float64)
    return out, cnt


off = np.where(seen[:, None], vcol - base[lab], 0.0)
for _ in range(30):  # low-pass the seen offsets (lose the folds, keep the overall shade)
    acc, cnt = nbr_mean(off, seen)
    off = np.where(seen[:, None], (off + acc) / (1 + cnt)[:, None], off)
off = np.clip(off, -0.08, 0.08)
for _ in range(500):  # harmonic fill: unseen = average of its neighbours, seen held fixed
    acc, cnt = nbr_mean(off)
    upd = (~seen) & (cnt > 0)
    off[upd] = acc[upd] / cnt[upd][:, None]
# Surface distance from the nearest seen vertex.
elen = np.linalg.norm(P[sa] - P[sb], axis=1)
dist = np.where(seen, 0.0, np.inf)
for _ in range(2000):
    cand = np.full(nv, np.inf)
    np.minimum.at(cand, sa, dist[sb] + elen)
    nd = np.minimum(dist, cand)
    if np.array_equal(nd, dist):
        break
    dist = nd
dist[~np.isfinite(dist)] = 1.0
off *= np.exp(-dist / 0.06)[:, None]
fill = np.clip(base[lab] + off, 0, 1)

ca = me.color_attributes.new("fill", "FLOAT_COLOR", "POINT")
ca.data.foreach_set("color", np.concatenate([fill, np.ones((nv, 1))], 1).astype(np.float32).ravel())
onehot = np.zeros((nv, 4))
onehot[:, 0] = np.array([ROUGH[n] for n in LABELS])[lab]
onehot[:, 1] = lab == MANE
onehot[:, 2] = lab == SUIT
onehot[:, 3] = lab == FUR
pa_ = me.color_attributes.new("params", "FLOAT_COLOR", "POINT")
pa_.data.foreach_set("color", onehot.astype(np.float32).ravel())
labcol = me.color_attributes.new("labels", "FLOAT_COLOR", "POINT")
labcol.data.foreach_set("color", np.concatenate([LABEL_TINT[lab], np.ones((nv, 1))], 1).astype(np.float32).ravel())

fill_map = bake("fill", "EMIT", attr_fill.outputs["Color"]).reshape(-1, 3)
# Roughness, mane mask, suit mask; then the fur mask and the label preview separately.
par_map = bake("params", "EMIT", attr_par.outputs["Color"]).reshape(-1, 3)
attr_par.layer_name = "labels"
lab_map = bake("labels", "EMIT", attr_par.outputs["Color"])
fur_attr = me.color_attributes.new("furmask", "FLOAT_COLOR", "POINT")
fur_attr.data.foreach_set("color", np.repeat(onehot[:, 3:4], 4, 1).astype(np.float32).ravel())
attr_par.layer_name = "furmask"
fur_map = bake("furmask", "EMIT", attr_par.outputs["Color"])[..., 0].ravel()
save_png("bake-regions.png", lab_map)


def turntable(prefix, color_type, attribute=None):
    """Front, side, back, three-quarter renders of the bind pose, flat-lit (the texture as it is)."""
    eng = scene.render.engine
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "FLAT"
    sh.color_type = color_type
    if attribute:
        me.color_attributes.active_color = me.color_attributes[attribute]
    sh.background_type = "WORLD"
    world.color = (0.02, 0.025, 0.04)
    scene.render.resolution_x, scene.render.resolution_y = 700, 1100
    cam = scene.camera
    if cam is None:
        cd = bpy.data.cameras.new("cam")
        cd.type = "ORTHO"
        cd.ortho_scale = H * 1.08
        cam = bpy.data.objects.new("cam", cd)
        scene.collection.objects.link(cam)
        scene.camera = cam
    mid = Vector((0, 0, (zmin + zmax) / 2))
    for name, ang in (("front", 0), ("side", 90), ("back", 180), ("three-quarter", 35)):
        rr = math.radians(ang)
        cam.location = mid + Vector((math.sin(rr) * 6, -math.cos(rr) * 6, 0))
        cam.rotation_euler = (math.radians(90), 0, rr)
        scene.render.filepath = os.path.join(PREVIEW, "%s-%s.png" % (prefix, name))
        bpy.ops.render.render(write_still=True)
    scene.render.engine = eng


turntable("regions", "VERTEX", "labels")

# ---------------------------------------------------------------------------
# Procedural detail, in 3D on the bind pose so it crosses UV seams cleanly.
# ---------------------------------------------------------------------------
def vnoise(p, seed):
    """Smooth value noise on the integer lattice, in [0, 1]. p (n, 3)."""
    i = np.floor(p).astype(np.int64)
    f = p - i
    f = f * f * (3 - 2 * f)

    def h(ix, iy, iz):
        n = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
        n = (n ^ (n >> 13)) * 1274126177
        n = n ^ (n >> 16)
        return (n & 0xFFFF).astype(np.float64) / 65535.0

    x, y, z = i[:, 0], i[:, 1], i[:, 2]
    fx, fy, fz = f[:, 0], f[:, 1], f[:, 2]
    c00 = h(x, y, z) * (1 - fx) + h(x + 1, y, z) * fx
    c10 = h(x, y + 1, z) * (1 - fx) + h(x + 1, y + 1, z) * fx
    c01 = h(x, y, z + 1) * (1 - fx) + h(x + 1, y, z + 1) * fx
    c11 = h(x, y + 1, z + 1) * (1 - fx) + h(x + 1, y + 1, z + 1) * fx
    return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz


mane_m = par_map[:, 1]
suit_m = par_map[:, 2]
detail = fill_map.copy()

# Suit: a fine woven grain (two scales) and a faint diagonal twill.
sel = suit_m > 0.02
p = pos_map[sel]
grain = 0.6 * vnoise(p * 900, 1) + 0.4 * vnoise(p * 260, 2) - 0.5
twill = np.sin((p[:, 0] * 0.7 + p[:, 2]) * 2 * math.pi * 260) * 0.5
detail[sel] *= (1 + (grain * 0.16 + twill * 0.035) * suit_m[sel])[:, None]

# Mane: strands radiating out from the face, darker at the roots, golden at the tips.
root_pt = hb + (muzzle - hb) * 0.4
sel = mane_m > 0.02
p = pos_map[sel] - root_pt
r = np.linalg.norm(p, axis=1) + 1e-6
d = p / r[:, None]
# Noise on the direction from the root (across the strands) and slow along the distance (down them).
strand = 0.5 * vnoise(d * 45 + r[:, None] * np.array([0, 0, 3.0]), 3) + 0.3 * vnoise(d * 110 + r[:, None] * np.array([0, 0, 7.0]), 4) + 0.2 * vnoise(d * 240 + r[:, None] * np.array([0, 0, 15.0]), 5)
strand = smoothstep(0.2, 0.8, strand)
tips = np.array([0.07, 0.045, 0.01]) * (strand ** 3)[:, None]
mm = mane_m[sel][:, None]
detail[sel] = detail[sel] * (1 + (0.4 * strand - 0.2)[:, None] * mm) + tips * mm

# Fur on the face and hands: a fine grain with a few warm flecks.
sel = fur_map > 0.02
p = pos_map[sel]
fine = vnoise(p * 700, 5) - 0.5
detail[sel] *= (1 + fine * 0.22 * fur_map[sel])[:, None]
detail[sel] += np.array([0.03, 0.02, 0.004]) * smoothstep(0.6, 0.9, vnoise(p * 180, 6))[:, None] * fur_map[sel][:, None]

# ---------------------------------------------------------------------------
# Compose: the photo where the front sees it, the filled colours elsewhere.
# ---------------------------------------------------------------------------
tu, tv = project(pos_map)
proj = sample(bled, tu, tv)
inside = sample(fg_soft, tu, tv)
w = smoothstep(0.22, 0.55, vis_map) * smoothstep(0.6, 0.95, inside)
skin = detail * (1 - w[:, None]) + proj * w[:, None]
skin = np.clip(skin, 0, 1).reshape(TEX, TEX, 3)

rough = np.clip(par_map[:, 0] + (vnoise(pos_map * 300, 9) - 0.5) * 0.08, 0.05, 1)
orm = np.stack([np.clip(0.25 + 0.75 * ao_map, 0, 1), rough, np.zeros_like(rough)], 1).reshape(TEX, TEX, 3)

skin_path = os.path.join(WORK, "lion-skin.png")
orm_path = os.path.join(WORK, "lion-orm.png")
skin_img = save_png(skin_path, skin)
save_png(orm_path, orm)
save_png("lion-skin.png", skin)
save_png("lion-orm.png", orm)
save_png("bake-visibility.png", np.repeat(w.reshape(TEX, TEX, 1), 3, 2))
log("texture written")

if os.environ.get("MASCOT_STOP") == "texture":
    raise SystemExit(0)

# Final material: textured PBR. The site adds the hologram on top.
skin_img.reload()
skin_img.colorspace_settings.name = "sRGB"
nt.nodes.clear()
o = N("ShaderNodeOutputMaterial")
bsdf = N("ShaderNodeBsdfPrincipled")
t = N("ShaderNodeTexImage")
t.image = skin_img
L(t.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.6
L(bsdf.outputs[0], o.inputs["Surface"])
for name in ("fill", "params", "labels", "furmask"):
    me.color_attributes.remove(me.color_attributes[name])

# ---------------------------------------------------------------------------
# Clips: one action per file, named by slug.
# ---------------------------------------------------------------------------
actions = {}
if base_action:
    base_action.name = base_clip
    actions[base_clip] = base_action
for slug, path in clip_files.items():
    if slug in actions:
        continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    a_obj = next(o for o in new if o.type == "ARMATURE")
    act = a_obj.animation_data.action
    act.name = slug
    actions[slug] = act
    for o in new:
        data = o.data
        bpy.data.objects.remove(o)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Armature):
                bpy.data.armatures.remove(data)
for slug, act in actions.items():
    act.use_fake_user = True
    log("clip %-16s frames %d-%d" % (slug, act.frame_range[0], act.frame_range[1]))

# Every action needs to be playable on the kept rig: give the rig an NLA strip per action.
arm.data.pose_position = "POSE"
ad = arm.animation_data or arm.animation_data_create()
ad.action = None
for slug, act in actions.items():
    track = ad.nla_tracks.new()
    track.name = slug
    track.strips.new(slug, int(act.frame_range[0]), act)

# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------
for o in scene.objects:
    o.select_set(o in (arm, mesh))
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_anim_slide_to_zero=True,
    export_force_sampling=True,
    export_optimize_animation_size=True,
    export_reset_pose_bones=True,
    export_def_bones=False,
    export_skins=True,
    export_morph=False,
    export_image_format="AUTO",
    export_materials="EXPORT",
    export_yup=True,
    export_apply=False,
)
log("exported", OUT_GLB)

# ---------------------------------------------------------------------------
# Turntable previews (bind pose): front, side, back, three-quarter.
# ---------------------------------------------------------------------------
ad.action = None
for tr in ad.nla_tracks:
    tr.mute = True
arm.data.pose_position = "REST"
turntable("turntable", "TEXTURE")
log("previews rendered")

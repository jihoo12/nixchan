# Builds Lantern Mart's neighbours and its two street stalls, and exports each as a .glb:
#
#   nix develop .#blender -c blender -b -P tools/lantern-mart/build.py -- <out-dir> [preview-dir]
#
# (The game keeps them in src/games/lantern-mart/models/.)
#
#   mochi.glb   Mochi, the cat who minds the till inside the mart, in its mint vest
#   pip.glb     Pip, a penguin waiting at the bus stop for the night bus, in a scarf and earmuffs
#   gomi.glb    Gomsun, the bear who sells bungeoppang (fish-shaped pastries) from a cart
#   yeoul.glb   Yeoul, the fox who runs the pojangmacha (a street-food tent): fish cakes and tteokbokki
#   stalls.glb  the bungeoppang cart, the tent, and the two treats Nixchan can buy (static meshes)
#
# As with Pebble on the island (tools/island-otter), everything is modelled in three.js coordinates
# in metres (y up, feet on y = 0, facing +z) and exported without the y-up conversion. Materials carry
# the real colours; the game turns the characters' into toon materials with an ink line, and the
# stalls' into lit ones (a material whose name starts with Glow is drawn unlit, Tarp and Glass see
# through). Each character has the same small rig, all bones pointing straight up with no roll, so a
# pose is just rotations about the world's axes: Hips (body and clothes skinned between it and
# Chest), Chest, Head, ArmL, ArmR and Tail. The clips are Idle, Wave, Talk, Happy and Work, all looping.
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'models')
PREVIEW = os.path.abspath(argv[1]) if len(argv) > 1 else None
TAU = 2 * math.pi
UP = Vector((0, 1, 0))


def linear(hex_color):
    c = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


class Scene:
    """A fresh, empty Blender scene with a palette of named materials."""

    def __init__(self, colors):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.scene = bpy.context.scene
        self.mats = {}
        for name, hex_color in colors.items():
            mat = bpy.data.materials.new(name)
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get('Principled BSDF')
            bsdf.inputs['Base Color'].default_value = (*linear(hex_color), 1)
            bsdf.inputs['Roughness'].default_value = 0.85
            self.mats[name] = mat


S = None  # the Scene being built


class Part:
    """One mesh object, built up from primitives with bmesh."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def mat(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def paint(self, verts, name, smooth=True):
        index = self.mat(name)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = index
            f.smooth = smooth
        return verts

    def done(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(S.mats[m])
        obj = bpy.data.objects.new(self.name, me)
        S.scene.collection.objects.link(obj)
        return obj


def ball(part, centre, radius, mat, scale=(1, 1, 1), seg=(20, 12), matrix=None):
    verts = bmesh.ops.create_uvsphere(part.bm, u_segments=seg[0], v_segments=seg[1], radius=radius)['verts']
    m = Matrix.Translation(centre) @ Matrix.Diagonal((*scale, 1))
    if matrix is not None:
        m = matrix @ m
    bmesh.ops.transform(part.bm, matrix=m, verts=verts)
    return part.paint(verts, mat)


def rod(part, a, b, r0, r1, mat, segments=10, smooth=True):
    a, b = Vector(a), Vector(b)
    axis = b - a
    verts = bmesh.ops.create_cone(part.bm, cap_ends=True, segments=segments, radius1=r0, radius2=r1, depth=axis.length)['verts']
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(part.bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=verts)
    return part.paint(verts, mat, smooth)


def box(part, centre, size, mat, rot=(0, 0, 0)):
    verts = bmesh.ops.create_cube(part.bm, size=1)['verts']
    m = Matrix.Translation(centre) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
    bmesh.ops.transform(part.bm, matrix=m, verts=verts)
    return part.paint(verts, mat, smooth=False)


def blob_chain(part, points, radius, mat, steps=10):
    """Spheres along a line of points, for a limb or a tail; melted together by a remesh after."""
    for i in range(steps + 1):
        t = i / steps
        k = min(int(t * (len(points) - 1)), len(points) - 2)
        u = t * (len(points) - 1) - k
        p = Vector(points[k]).lerp(Vector(points[k + 1]), u)
        ball(part, p, radius(t), mat, seg=(14, 8))


def melt(obj, voxel=0.014, iterations=5, ratio=0.35):
    """Voxel-remesh a part built from overlapping blobs into one smooth skin (of its first material)."""
    for kind, settings in (
        ('REMESH', {'mode': 'VOXEL', 'voxel_size': voxel}),
        ('LAPLACIANSMOOTH', {'iterations': iterations, 'lambda_factor': 0.8, 'use_volume_preserve': True}),
        ('DECIMATE', {'ratio': ratio}),
    ):
        mod = obj.modifiers.new(kind.lower(), kind)
        for key, value in settings.items():
            setattr(mod, key, value)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.clear()
    old = obj.data
    obj.data = me
    me.name = obj.name
    bpy.data.meshes.remove(old)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))


def export(path, animations):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=False,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials='EXPORT',
        export_skins=animations,
        export_animations=animations,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
    )
    tris = sum(len(f.vertices) - 2 for o in S.scene.objects if o.type == 'MESH' for f in o.data.polygons)
    print(f'lantern-mart: wrote {path} ({tris} triangles, {os.path.getsize(path) // 1024} KiB)')


def preview_setup(scale, target, size=(360, 420)):
    sc = S.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 12
    sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = size
    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.52, 0.66, 1)
    sc.world = world
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3
    sc.collection.objects.link(sun)
    sun.rotation_euler = (0.6, 0.4, 0)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = scale
    sc.collection.objects.link(cam)
    sc.camera = cam
    target = Vector(target)

    def shoot(path, location):
        back = (Vector(location) - target).normalized()
        x = UP.cross(back).normalized()
        cam.matrix_world = Matrix((x, back.cross(x), back)).transposed().to_4x4()
        cam.matrix_world.translation = target + back * 6
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)

    return shoot


# =====================================================================================
# The neighbours
# =====================================================================================

HIP = Vector((0, 0.36, 0))
CHEST = Vector((0, 0.62, 0))
NECK = Vector((0, 0.8, 0))
HEAD = Vector((0, 0.98, 0.02))
SHOULDER = {1: Vector((0.2, 0.66, 0.04)), -1: Vector((-0.2, 0.66, 0.04))}
TAIL_ROOT = Vector((0, 0.2, -0.22))


def head_point(a, y, lift, radii=(0.25, 0.22, 0.23)):
    """A point on the head's ellipsoid, `a` radians round from straight ahead at height `y` above its
    middle, pushed out by `lift`, and the outward direction there."""
    rx, ry, rz = radii
    t = max(-0.999, min(0.999, y / ry))
    ring = math.sqrt(1 - t * t)
    p = Vector((math.sin(a) * rx * ring, y, math.cos(a) * rz * ring))
    n = Vector((p.x / rx**2, p.y / ry**2, p.z / rz**2)).normalized()
    return HEAD + p + n * lift, n


class Body:
    """The torso, melted from blobs, and a way of laying things onto it (clothes)."""

    def __init__(self, fur, belly, width=1.0, penguin=False):
        p = Part('Body')
        if penguin:
            # One egg from the feet up to the neck, broadest low down.
            ball(p, (0, 0.42, 0), 1, fur, scale=(0.31, 0.42, 0.28))
            ball(p, (0, 0.7, 0), 1, fur, scale=(0.22, 0.2, 0.21))
        else:
            ball(p, HIP, 1, fur, scale=(0.3 * width, 0.36, 0.27 * width))
            ball(p, CHEST, 1, fur, scale=(0.23 * width, 0.22, 0.21 * width))
            for side in (1, -1):
                ball(p, (side * 0.13 * width, 0.05, 0.1), 1, fur, scale=(0.08, 0.05, 0.12))
        self.body = p.done()
        melt(self.body)
        p = Part('Belly')
        if penguin:
            ball(p, (0, 0.44, 0.1), 1, belly, scale=(0.25, 0.36, 0.2))
        else:
            ball(p, (0, 0.5, 0.15 * width), 1, belly, scale=(0.2 * width, 0.28, 0.13))
        self.belly = p.done()
        melt(self.belly, voxel=0.012)
        self.width = width
        self.parts = [self.body, self.belly]
        depsgraph = bpy.context.evaluated_depsgraph_get()
        self.trees = [BVHTree.FromObject(o, depsgraph) for o in self.parts]

    def onto(self, a, y, lift):
        """The point on the body at `a` radians round from straight ahead and height `y`, lifted off
        its surface by `lift`, with the surface's normal there."""
        d = Vector((math.sin(a), 0, math.cos(a)))
        origin = Vector((0, y, 0)) + d * 1.0
        best = None
        for tree in self.trees:
            hit, normal, _, _ = tree.ray_cast(origin, -d)
            if hit is not None and (best is None or (hit - origin).length < (best[0] - origin).length):
                best = (hit, normal)
        if best is None:
            return Vector((0, y, 0)) + d * (0.2 + lift), d
        hit, normal = best
        n = normal.normalized()
        if n.dot(d) < 0:
            n = -n
        return hit + n * lift, n

    def garment(self, name, bottom, top, reach, lift, paint, rows=20, cols=24, thick=0.01, rim=None):
        """A cloth panel laid onto the body: rows from height bottom(s) to top(s), and columns across
        s from -1 to 1, which is reach(y) radians either side of straight ahead (or from `a0`)."""
        p = Part(name)
        bm = p.bm
        front, back = [], []
        for i in range(rows + 1):
            t = i / rows
            rf, rb = [], []
            for j in range(cols + 1):
                s = -1 + 2 * j / cols
                y = lerp(bottom(s), top(s), t)
                a = reach(s, y)
                out, n = self.onto(a, y, lift)
                rf.append(bm.verts.new(out))
                rb.append(bm.verts.new(out - n * thick))
            front.append(rf)
            back.append(rb)
        for i in range(rows):
            for j in range(cols):
                f = bm.faces.new((front[i][j], front[i][j + 1], front[i + 1][j + 1], front[i + 1][j]))
                f.material_index = p.mat(paint(i, j))
                b = bm.faces.new((back[i + 1][j], back[i + 1][j + 1], back[i][j + 1], back[i][j]))
                b.material_index = p.mat(paint(i, j))
        edge = p.mat(rim or paint(0, 0))
        for i in range(rows):
            for j in (0, cols):
                bm.faces.new((front[i][j], front[i + 1][j], back[i + 1][j], back[i][j])).material_index = edge
        for j in range(cols):
            for i in (0, rows):
                bm.faces.new((front[i][j], back[i][j], back[i][j + 1], front[i][j + 1])).material_index = edge
        for f in bm.faces:
            f.smooth = True
        return p


def tube_along(p, points, r, mat):
    for a, b in zip(points, points[1:]):
        rod(p, a, b, r, r, mat, 8)
        ball(p, b, r, mat, seg=(8, 6))


def eyes(p, kind, radii=(0.25, 0.22, 0.23), lift=0.0):
    """Dot (or happy closed) eyes and pink cheeks; `lift` sets them out over a face patch."""
    for side in (1, -1):
        at, n = head_point(side * 0.4, 0.035, lift, radii)
        if kind == 'smile':
            # Happy closed eyes, a little upturned arc each.
            pts = []
            for k in range(6):
                u = -1 + 2 * k / 5
                q, _ = head_point(side * 0.4 + u * 0.13, 0.035 + 0.025 * (1 - u * u), 0.004 + lift, radii)
                pts.append(q)
            tube_along(p, pts, 0.008, 'Eye')
        else:
            ball(p, at, 0.032, 'Eye', seg=(14, 8))
            ball(p, at + n * 0.02 + Vector((0.012, 0.016, 0)), 0.01, 'Shine', seg=(8, 6))
        cheek, _ = head_point(side * 0.68, -0.05, 0.004, radii)
        ball(p, cheek, 1, 'Blush', scale=(0.04, 0.022, 0.015), seg=(12, 6))


def ears(p, kind, fur, inner, tip=None):
    for side in (1, -1):
        if kind == 'round':
            base, _ = head_point(side * 1.0, 0.13, -0.01)
            ball(p, base, 1, fur, scale=(0.065, 0.065, 0.04), seg=(14, 8))
            ball(p, base + Vector((0, -0.005, 0.02)), 1, inner, scale=(0.04, 0.04, 0.025), seg=(12, 6))
        elif kind in ('cat', 'fox'):
            big = kind == 'fox'
            base, _ = head_point(side * 0.75, 0.15, -0.03)
            tip_at = base + Vector((side * (0.07 if big else 0.06), 0.19 if big else 0.14, -0.02))
            rod(p, base, tip_at, 0.08 if big else 0.07, 0.006, fur, 12)
            # The inside of the ear, a flatter cone just in front.
            rod(p, base + Vector((0, 0.01, 0.025)), tip_at + Vector((0, -0.04, 0.02)), 0.05 if big else 0.042, 0.004, inner, 10)
            if tip:
                rod(p, base.lerp(tip_at, 0.62), tip_at + (tip_at - base) * 0.03, 0.035, 0.006, tip, 10)


def build_character(spec):
    global S
    S = Scene(spec['colors'])
    c = spec
    fur, belly = c['fur'], c['belly']
    body = Body(fur, belly, c.get('width', 1.0), penguin=c['kind'] == 'penguin')
    skinned = list(body.parts)

    # ---------- clothes ----------
    if 'vest' in c:
        # Mochi's shop vest: all the way round from the waist up to under the arms, open at the front
        # over the cream chest, with a coral hem and a name badge.
        vest = body.garment(
            'Vest',
            bottom=lambda s: 0.36,
            top=lambda s: 0.74 - 0.12 * smoothstep(0.55, 0.85, 1 - abs(s)),
            reach=lambda s, y: 0.22 + (math.pi - 0.22) * (s * 0.5 + 0.5),
            lift=0.018,
            paint=lambda i, j: c['vest'] if i > 1 else 'Trim',
            cols=20,
        )
        # The other half, mirrored round her back.
        vest_obj = vest.done()
        me = vest_obj.data
        bm2 = bmesh.new()
        bm2.from_mesh(me)
        geom = bmesh.ops.duplicate(bm2, geom=bm2.verts[:] + bm2.edges[:] + bm2.faces[:])['geom']
        new_verts = [g for g in geom if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.scale(bm2, vec=(-1, 1, 1), verts=new_verts)
        bmesh.ops.reverse_faces(bm2, faces=[g for g in geom if isinstance(g, bmesh.types.BMFace)])
        bmesh.ops.remove_doubles(bm2, verts=bm2.verts[:], dist=0.004)
        bm2.to_mesh(me)
        bm2.free()
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        skinned.append(vest_obj)
        p = Part('Badge')
        at, n = body.onto(0.42, 0.62, 0.03)
        tilt = Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4()
        verts = bmesh.ops.create_cube(p.bm, size=1)['verts']
        bmesh.ops.transform(p.bm, matrix=Matrix.Translation(at) @ tilt @ Matrix.Diagonal((0.07, 0.04, 0.01, 1)), verts=verts)
        p.paint(verts, 'Badge', smooth=False)
        verts = bmesh.ops.create_cube(p.bm, size=1)['verts']
        bmesh.ops.transform(p.bm, matrix=Matrix.Translation(at + n * 0.006) @ tilt @ Matrix.Diagonal((0.05, 0.008, 0.004, 1)), verts=verts)
        p.paint(verts, 'Trim', smooth=False)
        skinned.append(p.done())

    if 'apron' in c:
        hem, waist, top = c.get('apron_hem', 0.12), 0.45, c.get('apron_top', 0.72)

        def half(y):
            skirt = 1.15 - 0.1 * smoothstep(hem, waist, y)
            bib = 0.6 - 0.08 * smoothstep(waist + 0.05, top, y)
            return lerp(skirt, bib, smoothstep(waist - 0.03, waist + 0.06, y))

        stripe = c.get('apron_stripe')
        apron = body.garment(
            'Apron',
            bottom=lambda s: hem - 0.03 * (1 - s * s),
            top=lambda s: top - 0.05 * abs(s) ** 6,
            reach=lambda s, y: s * half(y),
            lift=0.024,
            paint=(lambda i, j: stripe if stripe and (i in (2, 3)) else c['apron']),
            rows=22,
            cols=18,
            rim=c.get('apron_rim', c['apron']),
        )
        # A big front pocket.
        pocket, pn = body.onto(0, 0.27, 0.034)
        tilt = Vector((0, 0, 1)).rotation_difference(pn).to_matrix().to_4x4()
        ball(apron, pocket, 1, c.get('pocket', c['apron']), scale=(0.12, 0.065, 0.01), seg=(20, 8), matrix=Matrix.Translation(pocket) @ tilt @ Matrix.Translation(-pocket))
        tie = c.get('apron_rim', c['apron'])
        for side in (1, -1):
            corner, _ = body.onto(side * 0.5, top - 0.02, 0.024)
            tube_along(apron, [corner, Vector((side * 0.13, 0.79, 0.1)), Vector((side * 0.15, 0.82, -0.02)), Vector((side * 0.08, 0.81, -0.12)), Vector((0, 0.8, -0.14))], 0.011, tie)
        tube_along(apron, [body.onto(-math.pi + TAU * k / 32, waist, 0.03)[0] for k in range(33)], 0.013, tie)
        knot, _ = body.onto(math.pi, waist, 0.045)
        ball(apron, knot, 0.022, tie, seg=(10, 8))
        for side in (1, -1):
            loop = [knot + Vector((side * x, y, -0.015 - 0.02 * x)) for x, y in ((0.02, 0.01), (0.06, 0.04), (0.1, 0.03), (0.09, -0.01), (0.05, -0.02), (0.02, -0.005))]
            tube_along(apron, loop, 0.012, tie)
        skinned.append(apron.done())

    if 'scarf' in c:
        p = Part('Scarf')
        ring = [body.onto(-math.pi + TAU * k / 28, 0.76, 0.035)[0] for k in range(29)]
        for k, (a, b) in enumerate(zip(ring, ring[1:])):
            rod(p, a, b, 0.045, 0.045, c['scarf'] if k % 4 < 2 else c['scarf2'], 10)
        # Two ends hanging down the front, a little apart, with a fringe.
        for side, length in ((1, 0.2), (-1, 0.26)):
            start, _ = body.onto(side * 0.35, 0.74, 0.05)
            end = start + Vector((side * 0.02, -length, 0.04))
            box(p, (start + end) / 2, (0.075, length, 0.022), c['scarf'], rot=(-0.15, 0, side * 0.08))
            box(p, end + Vector((0, -0.01, 0)), (0.075, 0.03, 0.024), c['scarf2'], rot=(-0.15, 0, side * 0.08))
        skinned.append(p.done())

    # ---------- head ----------
    p = Part('Head')
    radii = c.get('head', (0.25, 0.22, 0.23))
    ball(p, HEAD, 1, c.get('head_fur', fur), scale=radii)
    kind = c['kind']
    if kind == 'penguin':
        # White face round the eyes, an orange beak.
        for side in (1, -1):
            at, _ = head_point(side * 0.38, 0.01, -0.03, radii)
            ball(p, at, 1, belly, scale=(0.11, 0.12, 0.065))
        tip, _ = head_point(0, -0.05, 0.11, radii)
        base, _ = head_point(0, -0.05, -0.02, radii)
        rod(p, base, tip, 0.06, 0.008, 'Beak', 14)
        ball(p, base + Vector((0, 0, 0.03)), 1, 'Beak', scale=(0.065, 0.03, 0.05), seg=(14, 8))
    else:
        muzzle_out = {'cat': 0.13, 'bear': 0.15, 'fox': 0.17}[kind]
        size = {'cat': (0.1, 0.065, 0.075), 'bear': (0.12, 0.085, 0.09), 'fox': (0.085, 0.06, 0.13)}[kind]
        muzzle = HEAD + Vector((0, -0.07, muzzle_out + (0.02 if kind == 'fox' else 0)))
        ball(p, muzzle, 1, c.get('muzzle', belly), scale=size)
        nose_z = muzzle.z + size[2] - 0.005
        ball(p, Vector((0, muzzle.y + 0.03, nose_z)), 1, 'Nose', scale=(0.035, 0.025, 0.025) if kind != 'bear' else (0.045, 0.03, 0.03), seg=(14, 8))
        if kind == 'fox':
            # White cheeks either side of the muzzle.
            for side in (1, -1):
                at, _ = head_point(side * 0.75, -0.1, -0.03, radii)
                ball(p, at, 1, belly, scale=(0.09, 0.07, 0.08))
        ears(p, {'cat': 'cat', 'fox': 'fox', 'bear': 'round'}[kind], c.get('ear', fur), c.get('ear_inner', 'Blush'), c.get('ear_tip'))
        if kind == 'cat':
            for side in (1, -1):
                for k, tilt in enumerate((-0.15, 0, 0.15)):
                    root = HEAD + Vector((side * 0.1, -0.07 + k * 0.02, 0.18))
                    rod(p, root, root + Vector((side * 0.12, tilt * 0.35, -0.03)), 0.004, 0.003, 'Whisker', 5)
            # An orange patch over one ear, as calicos have.
            at, _ = head_point(0.9, 0.15, -0.025, radii)
            ball(p, at, 1, 'Patch', scale=(0.12, 0.09, 0.1), seg=(14, 8))
    # Pip's eyes sit on the white patches round them, which stand a little proud of the head.
    eyes(p, c.get('eyes', 'dot'), radii, lift=0.03 if kind == 'penguin' else 0.0)

    hat = c.get('hat')
    if hat == 'beanie':
        top_y = HEAD.y + radii[1]
        ball(p, HEAD + Vector((0, 0.06, -0.01)), 1, c['beanie'], scale=(radii[0] + 0.02, radii[1] - 0.02, radii[2] + 0.02), seg=(24, 12))
        rod(p, HEAD + Vector((0, 0.06, -0.01)), HEAD + Vector((0, 0.12, -0.01)), radii[0] + 0.035, radii[0] + 0.025, c['beanie2'], 24)
        ball(p, Vector((0, top_y + 0.06, -0.01)), 0.07, c['beanie2'], seg=(14, 10))
    elif hat == 'towel':
        # A twisted towel tied round the head, knotted at the side.
        ring = []
        for k in range(33):
            a = TAU * k / 32
            q, n = head_point(a, 0.08, 0.02, radii)
            ring.append(q)
        for k, (a, b) in enumerate(zip(ring, ring[1:])):
            rod(p, a, b, 0.03, 0.03, c['towel'] if k % 3 else c['towel2'], 10)
        knot, _ = head_point(-1.5, 0.08, 0.04, radii)
        ball(p, knot, 0.04, c['towel'], seg=(12, 8))
        for dz in (0.05, -0.05):
            rod(p, knot, knot + Vector((-0.08, -0.04, dz)), 0.022, 0.014, c['towel'], 8)
    elif hat == 'earmuffs':
        for side in (1, -1):
            at, _ = head_point(side * math.pi / 2, 0.0, 0.03, radii)
            ball(p, at, 1, c['muff'], scale=(0.045, 0.08, 0.08), seg=(16, 10))
        arc = [HEAD + Vector((math.cos(math.pi * k / 12) * (radii[0] + 0.03), math.sin(math.pi * k / 12) * (radii[1] + 0.03), -0.02)) for k in range(13)]
        tube_along(p, arc, 0.013, c['muff_band'])
    head = p.done()

    # ---------- arms and tail ----------
    arms = {}
    for side, name in ((1, 'ArmL'), (-1, 'ArmR')):
        p = Part(name)
        s = SHOULDER[side] + Vector((side * 0.12 * (c.get('width', 1.0) - 1), 0, 0))
        if kind == 'penguin':
            # A flipper: one long flattened blob hanging at her side.
            mid = s + Vector((side * 0.06, -0.17, 0.0))
            rot = Euler((0, 0, side * 0.22), 'XYZ').to_matrix().to_4x4()
            ball(p, mid, 1, fur, scale=(0.045, 0.2, 0.1), matrix=Matrix.Translation(mid) @ rot @ Matrix.Translation(-mid))
            arms[side] = p.done()
        else:
            paw = s + Vector((side * 0.06, -0.2, 0.12))
            blob_chain(p, [s, s + Vector((side * 0.05, -0.1, 0.05)), paw], lambda t: 0.065 - 0.012 * t, c.get('arm', fur), steps=8)
            ball(p, paw + Vector((0, -0.02, 0.01)), 0.062, c.get('paw', fur))
            arms[side] = p.done()
            melt(arms[side], voxel=0.012, iterations=4)
            if c.get('sleeve'):
                # Sleeve cuffs, so the arms read as part of the outfit.
                q = Part(name + 'Cuff')
                rod(q, s + Vector((side * 0.005, -0.02, 0.0)), s + Vector((side * 0.035, -0.09, 0.035)), 0.078, 0.074, c['sleeve'], 14)
                cuff = q.done()
                arms[side] = (arms[side], cuff)

    tails = []
    tail_kind = c['tail']
    if tail_kind == 'long':
        p = Part('Tail')
        r = TAIL_ROOT
        blob_chain(p, [r, r + Vector((0.05, 0.02, -0.15)), r + Vector((0.1, 0.2, -0.25)), r + Vector((0.06, 0.38, -0.22))], lambda t: 0.045 - 0.008 * t, fur, steps=14)
        t = p.done()
        melt(t, voxel=0.01, iterations=4)
        tails.append(t)
        p = Part('TailTip')
        ball(p, r + Vector((0.06, 0.38, -0.22)), 0.042, 'Patch', seg=(12, 8))
        tails.append(p.done())
    elif tail_kind == 'bushy':
        p = Part('Tail')
        r = TAIL_ROOT
        pts = [r, r + Vector((0.06, -0.02, -0.18)), r + Vector((0.14, 0.08, -0.34)), r + Vector((0.16, 0.24, -0.38))]
        blob_chain(p, pts, lambda t: 0.06 + 0.07 * math.sin(math.pi * min(1, t * 1.1)), fur, steps=14)
        t = p.done()
        melt(t, voxel=0.014)
        tails.append(t)
        p = Part('TailTip')
        ball(p, pts[-1] + Vector((0.005, 0.03, -0.005)), 1, belly, scale=(0.075, 0.09, 0.075), seg=(14, 10))
        tails.append(p.done())
    elif tail_kind == 'stub':
        p = Part('Tail')
        ball(p, TAIL_ROOT + Vector((0, 0.1, 0.0)), 0.07, fur, seg=(12, 8))
        tails.append(p.done())
    elif tail_kind == 'penguin':
        p = Part('Tail')
        ball(p, TAIL_ROOT + Vector((0, -0.06, 0.02)), 1, fur, scale=(0.1, 0.03, 0.09), seg=(12, 6))
        tails.append(p.done())
    if kind == 'penguin':
        p = Part('Feet')
        for side in (1, -1):
            ball(p, (side * 0.1, 0.025, 0.12), 1, 'Beak', scale=(0.07, 0.025, 0.1), seg=(12, 6))
        skinned.append(p.done())

    # ---------- the rig ----------
    joint = {'Hips': HIP, 'Chest': CHEST, 'Head': NECK, 'ArmL': SHOULDER[1], 'ArmR': SHOULDER[-1], 'Tail': TAIL_ROOT}
    parent = {'Hips': None, 'Chest': 'Hips', 'Head': 'Chest', 'ArmL': 'Chest', 'ArmR': 'Chest', 'Tail': 'Hips'}
    bone_len = 0.08
    rig_data = bpy.data.armatures.new('Rig')
    rig = bpy.data.objects.new(c['name'], rig_data)
    S.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, par in parent.items():
        eb = rig_data.edit_bones.new(name)
        eb.head = joint[name]
        eb.tail = joint[name] + Vector((0, bone_len, 0))
        eb.roll = 0
        if par:
            eb.parent = rig_data.edit_bones[par]
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'

    def attach(obj, bone):
        world = obj.matrix_basis.copy()
        obj.parent = rig
        obj.parent_type = 'BONE'
        obj.parent_bone = bone
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Translation(-(joint[bone] + Vector((0, bone_len, 0)))) @ world

    def skin(obj):
        obj.parent = rig
        hips = obj.vertex_groups.new(name='Hips')
        chest = obj.vertex_groups.new(name='Chest')
        for v in obj.data.vertices:
            k = smoothstep(0.42, 0.62, v.co.y)
            hips.add([v.index], 1 - k, 'REPLACE')
            chest.add([v.index], k, 'REPLACE')
        obj.modifiers.new('rig', 'ARMATURE').object = rig

    for obj in skinned:
        skin(obj)
    attach(head, 'Head')
    for side, bone in ((1, 'ArmL'), (-1, 'ArmR')):
        for obj in arms[side] if isinstance(arms[side], tuple) else (arms[side],):
            attach(obj, bone)
    for t in tails:
        attach(t, 'Tail')

    # ---------- the clips ----------
    rest_l, rest_r = c.get('rest', ((-0.25, 0, -0.2), (-0.25, 0, 0.2)))

    def euler(x=0.0, y=0.0, z=0.0):
        return Euler((x, y, z), 'XYZ').to_quaternion()

    def pose(hips=(0, 0, 0), lift=0.0, chest=(0, 0, 0), head=(0, 0, 0), arm_l=rest_l, arm_r=rest_r, tail=(0, 0, 0)):
        return {
            'Hips': (Vector((0, lift, 0)), euler(*hips)),
            'Chest': (Vector(), euler(*chest)),
            'Head': (Vector(), euler(*head)),
            'ArmL': (Vector(), euler(*arm_l)),
            'ArmR': (Vector(), euler(*arm_r)),
            'Tail': (Vector(), euler(*tail)),
        }

    sway = c.get('tail_sway', 0.3)

    def idle(t):
        ph = TAU * t
        b = math.sin(ph)
        return pose(hips=(0, 0, 0.02 * math.sin(ph)), chest=(0.03 * b, 0, 0), head=(0.02 * b, 0, 0.05 * math.sin(ph + 1)), tail=(0, sway * math.sin(ph), 0.1 * sway * math.sin(2 * ph)))

    def wave(t):
        ph = TAU * t
        return pose(chest=(0, -0.1, 0.04), head=(0, -0.08, -0.12), arm_r=(-0.2, 0, -2.5 + 0.35 * math.sin(2 * ph)), tail=(0, 1.6 * sway * math.sin(2 * ph), 0))

    def talk(t):
        ph = TAU * t
        return pose(
            chest=(0.04 * math.sin(2 * ph), 0.08 * math.sin(ph), 0),
            head=(0.1 * math.sin(2 * ph), 0.06 * math.sin(ph), 0.06 * math.sin(ph + 0.5)),
            arm_l=(-0.7 + 0.25 * math.sin(ph), 0, -0.35),
            arm_r=(-0.5 + 0.25 * math.sin(ph + 2), 0, 0.3),
            tail=(0, sway * math.sin(ph), 0),
        )

    def happy(t):
        ph = TAU * t
        hop = abs(math.sin(2 * ph))
        return pose(
            lift=0.05 * hop,
            chest=(-0.05, 0, 0.05 * math.sin(2 * ph)),
            head=(-0.1, 0, 0.12 * math.sin(2 * ph)),
            arm_l=(-0.3, 0, 2.3 + 0.2 * math.sin(4 * ph)),
            arm_r=(-0.3, 0, -2.3 - 0.2 * math.sin(4 * ph)),
            tail=(0, 2 * sway * math.sin(4 * ph), 0),
        )

    work = c['work'](pose, sway)
    fps = 30
    clips = {'Idle': (90, idle), 'Wave': (40, wave), 'Talk': (40, talk), 'Happy': (36, happy), 'Work': (c.get('work_frames', 60), work)}
    S.scene.render.fps = fps
    rig.animation_data_create()
    for name, (frames, fn) in clips.items():
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        last = {}
        for f in range(frames + 1):
            for b, (loc, q) in fn(f / frames).items():
                if b in last and last[b].dot(q) < 0:
                    q = -q
                last[b] = q
                pb = rig.pose.bones[b]
                pb.rotation_quaternion = q
                pb.keyframe_insert('rotation_quaternion', frame=f)
                if b == 'Hips':
                    pb.location = loc
                    pb.keyframe_insert('location', frame=f)
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, action)
        rig.animation_data.action = None

    def apply_pose(p):
        for b, (loc, q) in p.items():
            rig.pose.bones[b].location = loc
            rig.pose.bones[b].rotation_quaternion = q
        bpy.context.view_layer.update()

    apply_pose(idle(0))
    export(os.path.join(OUT, c['file']), animations=True)

    if PREVIEW:
        shoot = preview_setup(1.8, (0, 0.7, 0))
        rig.animation_data.use_nla = False
        for clip, t in (('Idle', 0), ('Work', 0.25), ('Wave', 0.25)):
            apply_pose(clips[clip][1](t))
            for view, location in (('front', (0, 0.9, 4)), ('side', (3.4, 1.2, 2))):
                shoot(os.path.join(PREVIEW, f"{c['name'].lower()}-{clip.lower()}-{view}.png"), location)


# ---------- who they are ----------


def work_till(pose, sway):
    # Scanning things at the till: the right paw sweeps across, the head nods along with it.
    def fn(t):
        ph = TAU * t
        return pose(
            chest=(0.08, 0.06 * math.sin(ph), 0),
            head=(0.18 + 0.04 * math.sin(2 * ph), 0.12 * math.sin(ph), 0),
            arm_l=(-0.85, 0, -0.25),
            arm_r=(-1.0 + 0.15 * math.sin(2 * ph), 0.5 * math.sin(ph), 0.25),
            tail=(0, sway * math.sin(ph), 0),
        )

    return fn


def work_shiver(pose, sway):
    # Waiting in the cold: a little bounce from foot to foot, flippers flapping to keep warm.
    def fn(t):
        ph = TAU * t
        return pose(
            hips=(0, 0, 0.08 * math.sin(ph)),
            lift=0.015 * abs(math.sin(ph)),
            chest=(0, 0, -0.04 * math.sin(ph)),
            head=(0.05, 0.25 * math.sin(ph * 0.5), 0),
            arm_l=(0, 0, 0.35 + 0.3 * abs(math.sin(2 * ph))),
            arm_r=(0, 0, -0.35 - 0.3 * abs(math.sin(2 * ph))),
            tail=(0, 0.3 * math.sin(ph), 0),
        )

    return fn


def work_flip(pose, sway):
    # Turning the bungeoppang moulds: both paws forward, the right one flipping over and back.
    def fn(t):
        ph = TAU * t
        flip = smoothstep(0.1, 0.35, t) * (1 - smoothstep(0.6, 0.85, t))
        return pose(
            chest=(0.12, -0.05, 0),
            head=(0.25, -0.05, 0),
            arm_l=(-1.1, 0, -0.3),
            arm_r=(-1.2 + 0.5 * flip, 0, 0.35 - 0.5 * flip),
            tail=(0, 0.2 * math.sin(ph), 0),
        )

    return fn


def work_stir(pose, sway):
    # Stirring the pot: the right paw goes round and round, the body leans into it.
    def fn(t):
        ph = TAU * t
        return pose(
            chest=(0.1 + 0.03 * math.sin(ph), 0.07 * math.cos(ph), 0),
            head=(0.2, 0.1 * math.cos(ph), 0.05 * math.sin(ph)),
            arm_l=(-0.6, 0, -0.3),
            arm_r=(-1.05 + 0.18 * math.sin(ph), 0.35 * math.cos(ph), 0.25),
            tail=(0, sway * math.sin(ph), 0),
        )

    return fn


CHARACTERS = [
    {
        'name': 'Mochi', 'file': 'mochi.glb', 'kind': 'cat', 'fur': 'Fur', 'belly': 'Cream', 'width': 0.95,
        'eyes': 'smile', 'tail': 'long', 'ear_inner': 'EarInner', 'vest': 'Vest', 'work': work_till, 'tail_sway': 0.35,
        'paw': 'Cream',
        'colors': {
            'Fur': '#f4ebe0', 'Cream': '#fffaf2', 'Patch': '#e89a52', 'Nose': '#e88f8f', 'Eye': '#2a2440',
            'Shine': '#ffffff', 'Blush': '#f5a3a8', 'EarInner': '#f3b7b4', 'Whisker': '#7d7591',
            'Vest': '#5fb9aa', 'Trim': '#e36c63', 'Badge': '#fff3d6',
        },
    },
    {
        'name': 'Pip', 'file': 'pip.glb', 'kind': 'penguin', 'fur': 'Feather', 'belly': 'White', 'tail': 'penguin',
        'head': (0.24, 0.21, 0.22), 'scarf': 'Scarf', 'scarf2': 'Scarf2', 'hat': 'earmuffs', 'muff': 'Muff', 'muff_band': 'Band',
        'rest': ((0, 0, 0.12), (0, 0, -0.12)), 'work': work_shiver, 'work_frames': 40,
        'colors': {
            'Feather': '#33395e', 'White': '#f6f4ff', 'Beak': '#f4a03f', 'Eye': '#1d1b3a', 'Shine': '#ffffff',
            'Blush': '#f59ab0', 'Scarf': '#f2c14e', 'Scarf2': '#e7835a', 'Muff': '#f6d7e6', 'Band': '#b7a0d8',
        },
    },
    {
        'name': 'Gomsun', 'file': 'gomi.glb', 'kind': 'bear', 'fur': 'Fur', 'belly': 'Cream', 'width': 1.12,
        'tail': 'stub', 'hat': 'beanie', 'beanie': 'Beanie', 'beanie2': 'BeanieRib', 'ear_inner': 'EarInner',
        'apron': 'Apron', 'apron_rim': 'ApronTie', 'apron_stripe': 'ApronStripe', 'pocket': 'ApronTie',
        'sleeve': 'Sweater', 'paw': 'Paw', 'work': work_flip, 'work_frames': 54, 'tail_sway': 0.15,
        'colors': {
            'Fur': '#8c5d40', 'Cream': '#e8cfa8', 'Paw': '#6f4630', 'Nose': '#2c2a3e', 'Eye': '#1d1b3a',
            'Shine': '#ffffff', 'Blush': '#f0939a', 'EarInner': '#c9997a', 'Beanie': '#d9564e', 'BeanieRib': '#f4ead9',
            'Apron': '#efb54f', 'ApronStripe': '#fff1cf', 'ApronTie': '#b8673c', 'Sweater': '#7aa38b',
        },
    },
    {
        'name': 'Yeoul', 'file': 'yeoul.glb', 'kind': 'fox', 'fur': 'Fur', 'belly': 'White', 'width': 0.92,
        'tail': 'bushy', 'hat': 'towel', 'towel': 'Towel', 'towel2': 'TowelStripe', 'ear_inner': 'EarInner', 'ear_tip': 'Dark',
        'apron': 'Apron', 'apron_rim': 'ApronTie', 'apron_hem': 0.1, 'paw': 'Dark', 'work': work_stir, 'tail_sway': 0.4,
        'colors': {
            'Fur': '#e3783a', 'White': '#fbf3e6', 'Dark': '#3b2f3d', 'Nose': '#2a2238', 'Eye': '#1d1b3a',
            'Shine': '#ffffff', 'Blush': '#f29a9a', 'EarInner': '#fbd6c0', 'Towel': '#f5f5fb', 'TowelStripe': '#5d86c9',
            'Apron': '#36406a', 'ApronTie': '#232a4a',
        },
    },
]

# =====================================================================================
# The stalls (static)
# =====================================================================================


def fish(p, centre, length, mat, dark, facing=0.0, upright=False):
    """A bungeoppang: a plump fish of batter with a fanned tail, a fin and rows of scales."""
    c = Vector(centre)
    if upright:
        rot = Euler((0, facing, math.pi / 2), 'XYZ').to_matrix().to_4x4()
    else:
        rot = Euler((0, facing, 0), 'XYZ').to_matrix().to_4x4()
    place = Matrix.Translation(c) @ rot
    L = length
    verts = bmesh.ops.create_uvsphere(p.bm, u_segments=16, v_segments=10, radius=1)['verts']
    bmesh.ops.transform(p.bm, matrix=place @ Matrix.Diagonal((L * 0.36, L * 0.13, L * 0.2, 1)), verts=verts)
    p.paint(verts, mat)
    # The tail: a flattened fan behind.
    verts = bmesh.ops.create_cone(p.bm, cap_ends=True, segments=10, radius1=L * 0.17, radius2=L * 0.02, depth=L * 0.3)['verts']
    tail = Matrix.Translation((-L * 0.42, 0, 0)) @ Euler((0, -math.pi / 2, 0), 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((1, 0.45, 1, 1))
    bmesh.ops.transform(p.bm, matrix=place @ tail, verts=verts)
    p.paint(verts, mat)
    # Scales: three rows of little bumps, and an eye.
    for row in (-1, 0, 1):
        for k in range(3):
            x = L * (-0.15 + 0.11 * k)
            bump = place @ Vector((x, L * 0.1, row * L * 0.07))
            ball(p, bump, L * 0.035, dark, seg=(8, 5))
    ball(p, place @ Vector((L * 0.24, L * 0.085, L * 0.06)), L * 0.025, dark, seg=(8, 5))


def eomuk(p, base, mat, stick, lean=(0, 0, 0)):
    """A fish-cake skewer: a long folded ribbon threaded on a stick."""
    rot = Euler(lean, 'XYZ').to_matrix().to_4x4()
    place = Matrix.Translation(Vector(base)) @ rot
    verts = bmesh.ops.create_cone(p.bm, cap_ends=True, segments=6, radius1=0.006, radius2=0.004, depth=0.34)['verts']
    bmesh.ops.transform(p.bm, matrix=place @ Matrix.Translation((0, 0.17, 0)) @ Euler((math.pi / 2, 0, 0), 'XYZ').to_matrix().to_4x4(), verts=verts)
    p.paint(verts, stick, smooth=False)
    for k in range(5):
        y = 0.12 + k * 0.035
        x = 0.028 if k % 2 else -0.028
        verts = bmesh.ops.create_cube(p.bm, size=1)['verts']
        bmesh.ops.transform(p.bm, matrix=place @ Matrix.Translation((x * 0.5, y, 0)) @ Euler((0, 0, 0.55 if k % 2 else -0.55), 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((0.075, 0.012, 0.055, 1)), verts=verts)
        p.paint(verts, mat, smooth=False)


def build_stalls():
    global S
    S = Scene({
        'CartRed': '#c9493f', 'CartCream': '#f6e3c3', 'Wood': '#9a6646', 'WoodDark': '#5f3d36', 'Iron': '#3a3a48',
        'Steel': '#9aa3b1', 'Tyre': '#2b2a36', 'Batter': '#e6a34f', 'BatterDark': '#a9622f', 'StripeA': '#d6463f',
        'StripeB': '#fbefd8', 'GlowLantern': '#ff8a5c', 'GlowBulb': '#ffe2a8', 'Glass': '#bfe3ef',
        'Tarp': '#f07a35', 'TarpEdge': '#c4542a', 'Pole': '#5d6576', 'Counter': '#8d5a45', 'CounterTop': '#c7ccd4',
        'Broth': '#c9874a', 'Sauce': '#d9443a', 'RiceCake': '#fff6e6', 'FishCake': '#e8b979', 'Stick': '#e8d2a8',
        'StoolRed': '#e0524a', 'StoolBlue': '#4f7fd0', 'Cup': '#f7efe2', 'Kettle': '#7fa7a0', 'Board': '#f8e7c4',
        'GlowSteam': '#fff4dc', 'Plastic': '#d9e5ef',
    })

    # ---------- the bungeoppang cart, footprint centred on the origin, customers on +z ----------
    p = Part('BungeoCart')
    box(p, (0, 0.56, 0), (1.8, 0.72, 0.84), 'CartRed')
    box(p, (0, 0.82, 0.425), (1.8, 0.08, 0.02), 'CartCream')
    box(p, (0, 0.27, 0.425), (1.8, 0.05, 0.02), 'CartCream')
    for x in (-0.6, 0, 0.6):
        box(p, (x, 0.55, 0.43), (0.5, 0.36, 0.015), 'WoodDark')
    box(p, (0, 0.95, 0), (1.9, 0.06, 0.92), 'Steel')
    for side in (-1, 1):
        rod(p, (side * 0.95, 0.24, 0.0), (side * 1.0, 0.24, 0.0), 0.24, 0.24, 'Tyre', 18)
        rod(p, (side * 1.0, 0.24, 0.0), (side * 1.015, 0.24, 0.0), 0.08, 0.08, 'Steel', 12)
    # A leg at each end so it stands level, and a push bar on the vendor's side.
    for x in (-0.75, 0.75):
        box(p, (x, 0.1, -0.3), (0.06, 0.2, 0.06), 'Iron')
    rod(p, (-0.9, 0.85, -0.55), (0.9, 0.85, -0.55), 0.02, 0.02, 'Steel', 8)
    for x in (-0.85, 0.85):
        rod(p, (x, 0.85, -0.55), (x, 0.85, -0.42), 0.018, 0.018, 'Steel', 8)
    # The cast-iron moulds: two rows of fish-shaped irons, a few open to show the batter cooking.
    box(p, (-0.28, 1.03, -0.02), (1.1, 0.1, 0.56), 'Iron')
    for row, z in enumerate((-0.15, 0.13)):
        for k in range(5):
            x = -0.72 + k * 0.22
            if (k + row) % 3 == 0:
                fish(p, (x, 1.1, z), 0.18, 'Batter', 'BatterDark', facing=0)
            else:
                box(p, (x, 1.1, z), (0.19, 0.035, 0.11), 'Iron')
                rod(p, (x - 0.09, 1.12, z), (x - 0.09, 1.2, z - 0.12), 0.008, 0.008, 'Steel', 6)
    # The glass case of finished fish on the right, warm and stacked up.
    box(p, (0.6, 0.99, 0.05), (0.56, 0.02, 0.46), 'WoodDark')
    for (x, z) in ((0.32, -0.18), (0.88, -0.18), (0.32, 0.28), (0.88, 0.28)):
        box(p, (x, 1.17, z), (0.025, 0.36, 0.025), 'Wood')
    box(p, (0.6, 1.36, 0.05), (0.6, 0.025, 0.5), 'Wood')
    for k in range(7):
        fish(p, (0.46 + (k % 3) * 0.14, 1.04 + (k // 3) * 0.055, -0.05 + (k % 2) * 0.16), 0.17, 'Batter', 'BatterDark', facing=0.2 * (k % 3 - 1))
    cart = p.done()
    p = Part('BungeoCartGlass')
    box(p, (0.6, 1.17, 0.29), (0.54, 0.34, 0.006), 'Glass')
    box(p, (0.6, 1.17, -0.19), (0.54, 0.34, 0.006), 'Glass')
    for x in (0.315, 0.885):
        box(p, (x, 1.17, 0.05), (0.006, 0.34, 0.46), 'Glass')
    p.done().parent = cart
    # A striped canopy on four poles, with a paper lantern hanging off its front.
    p = Part('BungeoCanopy')
    for x in (-0.88, 0.88):
        for z in (-0.4, 0.4):
            rod(p, (x, 0.96, z), (x, 2.1 + (0.06 if z < 0 else 0), z), 0.018, 0.018, 'Pole', 8)
    for k in range(10):
        x = -0.99 + 0.22 * k
        box(p, (x + 0.11, 2.16, 0), (0.22, 0.04, 1.12), 'StripeA' if k % 2 == 0 else 'StripeB', rot=(-0.1, 0, 0))
    # A scalloped valance along the front edge.
    for k in range(10):
        x = -0.88 + 0.196 * k
        ball(p, (x, 2.08, 0.565), 1, 'StripeA' if k % 2 == 0 else 'StripeB', scale=(0.1, 0.07, 0.015), seg=(12, 6))
    rod(p, (0.7, 2.06, 0.5), (0.7, 1.96, 0.5), 0.006, 0.006, 'Pole', 6)
    ball(p, (0.7, 1.84, 0.5), 1, 'GlowLantern', scale=(0.11, 0.14, 0.11))
    rod(p, (0.7, 1.99, 0.5), (0.7, 1.96, 0.5), 0.07, 0.07, 'WoodDark', 10)
    rod(p, (0.7, 1.72, 0.5), (0.7, 1.69, 0.5), 0.06, 0.06, 'WoodDark', 10)
    # A board on the canopy's front; the game paints the words.
    box(p, (-0.2, 1.88, 0.53), (1.05, 0.3, 0.03), 'Board')
    p.done().parent = cart

    # ---------- the pojangmacha tent, footprint centred on the origin, open toward +z ----------
    W, D = 3.4, 2.5
    p = Part('Pocha')
    for x in (-W / 2, W / 2):
        for z in (-D / 2, D / 2):
            rod(p, (x, 0, z), (x, 2.25 if z < 0 else 2.55, z), 0.03, 0.03, 'Pole', 8)
        rod(p, (x, 2.25, -D / 2), (x, 2.55, D / 2), 0.025, 0.025, 'Pole', 8)
    for z, y in ((-D / 2, 2.25), (D / 2, 2.55)):
        rod(p, (-W / 2, y, z), (W / 2, y, z), 0.025, 0.025, 'Pole', 8)
    # The counter across the front, steel-topped, with the pots on it.
    box(p, (0, 0.5, 0.25), (2.7, 1.0, 0.6), 'Counter')
    box(p, (0, 1.02, 0.27), (2.8, 0.05, 0.68), 'CounterTop')
    for x in (-0.9, 0, 0.9):
        box(p, (x, 0.5, 0.555), (0.8, 0.8, 0.01), 'WoodDark')
    # Fish cakes simmering in a long tray of broth, skewers leaning on the rim.
    box(p, (-0.55, 1.1, 0.25), (1.0, 0.12, 0.46), 'Steel')
    box(p, (-0.55, 1.155, 0.25), (0.94, 0.01, 0.4), 'Broth')
    for k in range(9):
        x = -0.95 + k * 0.1
        eomuk(p, (x, 1.1, 0.25 + (0.08 if k % 2 else -0.06)), 'FishCake', 'Stick', lean=(0.5 if k % 2 else -0.45, 0, 0.1 * (k % 3 - 1)))
    # Tteokbokki: rice cakes in a wide red pan.
    rod(p, (0.55, 1.05, 0.25), (0.55, 1.15, 0.25), 0.3, 0.3, 'Steel', 24)
    rod(p, (0.55, 1.15, 0.25), (0.55, 1.156, 0.25), 0.28, 0.28, 'Sauce', 24)
    for k in range(16):
        a = k * 2.4
        r = 0.05 + 0.2 * ((k * 37) % 10) / 10
        x, z = 0.55 + r * math.cos(a), 0.25 + r * math.sin(a)
        rod(p, (x - 0.03 * math.sin(a), 1.165, z + 0.03 * math.cos(a)), (x + 0.03 * math.sin(a), 1.165, z - 0.03 * math.cos(a)), 0.015, 0.015, 'RiceCake', 8)
    # Behind the counter: a little table with paper cups and a kettle of broth to pour.
    box(p, (0.9, 0.42, -0.8), (0.9, 0.84, 0.5), 'Wood')
    for k in range(4):
        rod(p, (0.6 + k * 0.08, 0.84, -0.8), (0.6 + k * 0.08, 0.84 + 0.2 + 0.0, -0.8), 0.035, 0.04, 'Cup', 10)
    rod(p, (1.15, 0.84, -0.8), (1.15, 1.06, -0.8), 0.1, 0.09, 'Kettle', 14)
    rod(p, (1.15, 1.06, -0.8), (1.15, 1.1, -0.8), 0.05, 0.03, 'Kettle', 10)
    rod(p, (1.22, 0.98, -0.8), (1.33, 1.06, -0.8), 0.015, 0.01, 'Kettle', 6)
    # Plastic stools for customers, out front under the roof.
    for k, x in enumerate((-0.95, 0.0, 0.95)):
        rod(p, (x, 0, 0.95), (x, 0.42, 0.95), 0.17, 0.14, 'StoolRed' if k != 1 else 'StoolBlue', 14)
        rod(p, (x, 0.42, 0.95), (x, 0.45, 0.95), 0.16, 0.16, 'StoolRed' if k != 1 else 'StoolBlue', 14)
    # A bare bulb hanging from the ridge.
    rod(p, (0, 2.5, 0.2), (0, 2.1, 0.2), 0.005, 0.005, 'Iron', 6)
    ball(p, (0, 2.05, 0.2), 0.06, 'GlowBulb', seg=(12, 8))
    # A menu board on the back wall; the game paints the words.
    box(p, (-0.55, 1.65, -D / 2 + 0.06), (1.3, 0.6, 0.03), 'Board')
    pocha = p.done()
    # The tarp: back and sides, a sloped roof, and the front flap rolled up.
    p = Part('PochaTarp')
    box(p, (0, 1.13, -D / 2 - 0.01), (W, 2.26, 0.02), 'Tarp')
    for side in (-1, 1):
        # Sides: a full wall at the back half, tied back in front so the counter shows.
        verts = []
        bm = p.bm
        corners = [(-D / 2, 0), (0.1, 0), (0.1, 2.36), (-D / 2, 2.25)]
        for dx in (0.0, 0.02):
            ring = [bm.verts.new((side * (W / 2 + dx), y, z)) for z, y in corners]
            verts.append(ring)
        bm.faces.new(verts[0])
        bm.faces.new(list(reversed(verts[1])))
        for k in range(4):
            a, b = verts[0][k], verts[0][(k + 1) % 4]
            c2, d = verts[1][(k + 1) % 4], verts[1][k]
            bm.faces.new((a, b, c2, d))
        for f in bm.faces:
            if f.material_index == 0:
                f.material_index = p.mat('Tarp')
        # The front half's flap, rolled up tight and strapped to the front pole.
        x = side * (W / 2 + 0.03)
        rod(p, (x, 0.35, D / 2 - 0.09), (x, 2.4, D / 2 - 0.09), 0.055, 0.07, 'Tarp', 12)
        for y in (0.9, 1.8):
            rod(p, (x, y - 0.03, D / 2 - 0.09), (x, y + 0.03, D / 2 - 0.09), 0.08, 0.08, 'TarpEdge', 12)
    slope = math.atan2(0.3, D)
    box(p, (0, 2.42, 0), (W + 0.16, 0.03, math.hypot(D, 0.3) + 0.12), 'Tarp', rot=(-slope, 0, 0))
    rod(p, (-W / 2 - 0.08, 2.5, D / 2 + 0.02), (W / 2 + 0.08, 2.5, D / 2 + 0.02), 0.08, 0.08, 'TarpEdge', 14)
    for f in p.bm.faces:
        f.smooth = False
    p.done().parent = pocha

    # ---------- the treats, as she holds them ----------
    p = Part('TreatBungeo')
    fish(p, (0, 0, 0), 0.2, 'Batter', 'BatterDark', upright=False)
    box(p, (-0.02, -0.035, 0), (0.12, 0.05, 0.075), 'Board')
    treat = p.done()
    treat.location = (0, -10, 0)
    p = Part('TreatEomuk')
    eomuk(p, (0, 0, 0), 'FishCake', 'Stick')
    rod(p, (0, -0.02, 0.0), (0, 0.06, 0.0), 0.035, 0.04, 'Cup', 12)
    p.done().location = (0, -10, 0)

    cart.location = (-2.5, 0, 0)
    pocha.location = (1.5, 0, 0)
    export(os.path.join(OUT, 'stalls.glb'), animations=False)
    if PREVIEW:
        shoot = preview_setup(6.5, (0, 1.2, 0), size=(640, 420))
        shoot(os.path.join(PREVIEW, 'stalls-front.png'), (0, 2.0, 6))
        shoot(os.path.join(PREVIEW, 'stalls-side.png'), (5, 3.5, 4))


only = set(argv[2:])
for spec in CHARACTERS:
    if not only or spec['name'].lower() in only:
        build_character(spec)
if not only or 'stalls' in only:
    build_stalls()

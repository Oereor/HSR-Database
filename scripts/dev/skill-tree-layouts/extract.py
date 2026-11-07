"""Extract draft trace layouts from game screenshots with OpenCV."""

import argparse
import hashlib
import json
from pathlib import Path

import cv2 as cv
import numpy as np


REPO = Path(__file__).resolve().parents[3]
PATHS = json.loads(Path(__file__).with_name("paths.json").read_text(encoding="utf-8"))
DEFAULT_INPUT = REPO.parent / "Codex-Prompt" / "Database-Skill-Tree-Images"
BASE_RADIUS = 556
RING_ANGLES = np.arange(360, dtype=np.float32) * np.float32(np.pi / 180)
NODE_ANGLES = np.arange(144, dtype=np.float32) * np.float32(2 * np.pi / 144)


def sample(gray, x, y, radius, angles):
    return cv.remap(
        gray, x + radius * np.cos(angles), y + radius * np.sin(angles),
        cv.INTER_LINEAR, borderMode=cv.BORDER_CONSTANT,
    )


def ring_response(gray, x, y, radius, angles, flank):
    ridge = sample(gray, x, y, radius, angles)
    inner = sample(gray, x, y, radius - flank, angles)
    outer = sample(gray, x, y, radius + flank, angles)
    height, width = gray.shape
    px = x + (radius + flank) * np.cos(angles)
    py = y + (radius + flank) * np.sin(angles)
    visible = (px >= 0) & (px < width - 1) & (py >= 0) & (py < height - 1)
    return np.where(visible, ridge - (inner + outer) * 0.5, 0)


def grid(xs, ys, radii):
    return np.stack(np.meshgrid(xs, ys, radii, indexing="ij"), axis=-1).reshape(-1, 3).astype(np.float32)


def score_rings(gray, candidates, flank):
    scores = []
    for batch in np.array_split(candidates, len(candidates) // 800 + 1):
        response = ring_response(gray, *batch.T[:, :, None], RING_ANGLES[::3], flank)
        scores.extend(np.median(response, axis=1))
    return np.asarray(scores)


def ellipse_seeds(gray, candidates, scale, flank):
    angles = RING_ANGLES[::6]
    harmonics = np.column_stack((
        np.ones(len(angles)), np.cos(angles), np.sin(angles),
        np.cos(2 * angles), np.sin(2 * angles),
    ))
    inverse = np.linalg.pinv(harmonics)
    offsets = np.arange(-18, 19, 3, dtype=np.float32) * scale
    proposals = []
    for batch in np.array_split(candidates, len(candidates) // 600 + 1):
        x, y, radii = batch.T[:, :, None]
        samples = (radii + offsets).reshape(-1, 1)
        responses = ring_response(
            gray, np.repeat(x, len(offsets), axis=0), np.repeat(y, len(offsets), axis=0),
            samples, angles, flank,
        ).reshape(len(batch), len(offsets), len(angles))
        peaks = responses.argmax(axis=1)
        radial_offsets = offsets[peaks]
        fits = radial_offsets @ inverse.T
        residuals = np.median(np.abs(radial_offsets - fits @ harmonics.T), axis=1)
        quality = np.median(responses.max(axis=1), axis=1) - 0.35 * residuals / scale
        centers = batch + fits[:, [1, 2, 0]]
        proposals.extend(zip(quality.tolist(), centers.tolist()))
    seeds = []
    for _, seed in sorted(proposals, reverse=True):
        if all(np.linalg.norm(np.subtract(seed, other)) >= 5 * scale for other in seeds):
            seeds.append(seed)
        if len(seeds) == 16:
            break
    return seeds


def circle_errors(points, center, radius):
    return np.linalg.norm(points - center, axis=1) - radius


def fit_circle(points):
    origin = points.mean(axis=0)
    relative = points - origin
    design = np.column_stack((2 * relative, np.ones(len(points))))
    dx, dy, k = np.linalg.lstsq(design, np.sum(relative ** 2, axis=1), rcond=None)[0]
    return origin + (dx, dy), float(np.sqrt(k + dx ** 2 + dy ** 2))


def ellipse_parameters(points):
    center, axes, angle = cv.fitEllipse(points.astype(np.float32))
    rx, ry = np.array(axes) / 2
    angle = (angle + 90) % 180 - 90
    if angle >= 45:
        rx, ry, angle = ry, rx, angle - 90
    elif angle < -45:
        rx, ry, angle = ry, rx, angle + 90
    return np.asarray(center), np.array([rx, ry]), angle


def rotation(angle):
    theta = np.deg2rad(angle)
    c, s = np.cos(theta), np.sin(theta)
    return np.array([[c, -s], [s, c]])


def ellipse_errors(points, center, axes, angle):
    local = (points - center) @ rotation(angle)
    norm = np.linalg.norm(local / axes, axis=1)
    return (norm - 1) * np.linalg.norm(local, axis=1) / np.maximum(norm, 1e-9)


def rms(values):
    return float(np.sqrt(np.mean(values ** 2)))


def detect_reference(gray):
    height, width = gray.shape
    short = min(height, width)
    scale = short / 1140
    clean = cv.GaussianBlur(cv.medianBlur(gray, 3), (0, 0), max(0.6, 1.2 * scale))
    flank = 5 * scale
    step = 6 * scale
    # Search an area of candidate centers. The image midpoint is just a grid bound.
    candidates = grid(
        np.arange(0.32 * short, width - 0.32 * short + step, step),
        np.arange(0.32 * short, height - 0.32 * short + step, step),
        np.arange(0.42 * short, 0.60 * short, 4 * scale),
    )
    scores = score_rings(clean, candidates, flank)
    x, y, radius = candidates[scores.argmax()]
    local = grid(
        x + np.arange(-6, 7) * scale,
        y + np.arange(-6, 7) * scale,
        radius + np.arange(-5, 6) * scale,
    )
    scores_local = score_rings(clean, local, flank)
    best = float(scores_local.max())
    x, y, radius = local[scores_local.argmax()]
    rivals = np.flatnonzero(np.linalg.norm(candidates - (x, y, radius), axis=1) >= 12 * scale)
    rival = rivals[scores[rivals].argmax()]
    diagnostic = {
        "ridgeContrast": round(best, 3),
        "competingCandidate": {
            "center": candidates[rival, :2].tolist(),
            "radius": float(candidates[rival, 2]),
            "ridgeContrast": round(float(scores[rival]), 3),
        },
    }
    if best >= 2.5:
        reference, fit = fit_reference(clean, (x, y, radius), scale, flank)
        diagnostic |= fit
        rival_x, rival_y, rival_r = candidates[rival]
        concentric_inner = np.hypot(rival_x - x, rival_y - y) < 5 * scale and rival_r < radius
        if reference is not None and (scores[rival] < 0.9 * best or concentric_inner):
            return reference, diagnostic
        diagnostic.setdefault("failure", "competing reference ridge")
    else:
        diagnostic["failure"] = "no continuous reference ridge"
    if best < 1.0:
        return None, diagnostic

    # A stretched ring can score poorly at every fixed radius. Rank wider
    # bands by the strength and angular coherence of their radial peaks.
    coarse = grid(
        np.arange(0.32 * short, width - 0.32 * short + step, 2 * step),
        np.arange(0.32 * short, height - 0.32 * short + step, 2 * step),
        np.arange(0.42 * short, 0.60 * short, 8 * scale),
    )
    seeds = ellipse_seeds(clean, coarse, scale, flank)
    ellipses = []
    for seed in seeds:
        reference, fit = fit_reference(clean, seed, scale, flank)
        if reference is not None and reference["shape"] == "ellipse":
            ellipses.append((fit["angularCoverage"], -fit["rmse"], reference, fit))
    if not ellipses:
        return None, diagnostic
    _, _, reference, fit = max(ellipses, key=lambda entry: entry[:2])
    axes, _ = geometry(reference)
    for _, _, other, _ in ellipses:
        if (
            np.linalg.norm(np.array(reference["center"]) - other["center"]) >= 8 * scale
            or np.linalg.norm(axes - other["axes"]) >= 8 * scale
        ):
            return None, diagnostic | {"failure": "competing elliptical reference fits"}
    diagnostic.pop("failure")
    return reference, diagnostic | fit | {"search": "wide radial band"}


def fit_reference(clean, seed, scale, flank):
    x, y, radius = seed
    # Sample a wider radial band to test for deformation. The second harmonics
    # find a consensus before the circle and ellipse are fitted to the same points.
    half_band = max(6 * scale, 0.038 * radius)
    radii = (radius + np.arange(-half_band, half_band, 0.25 * scale, dtype=np.float32))[:, None]
    responses = ring_response(clean, x, y, radii, RING_ANGLES, flank)
    peak = responses.argmax(axis=0)
    distance = radii[peak, 0]
    valid = (responses[peak, np.arange(len(peak))] > 4) & (peak > 0) & (peak < len(radii) - 1)
    directions = np.column_stack((np.cos(RING_ANGLES), np.sin(RING_ANGLES)))
    harmonics = np.column_stack((np.ones(len(peak)), directions, np.cos(2 * RING_ANGLES), np.sin(2 * RING_ANGLES)))
    weights = valid.astype(float)
    for _ in range(8):
        model = np.linalg.lstsq(harmonics * weights[:, None], distance * weights, rcond=None)[0]
        residual = np.abs(distance - harmonics @ model)
        weights = valid * np.minimum(1.0, (1.8 * scale) / np.maximum(residual, 1e-9))
    inliers = valid & (residual < 1.8 * scale)
    coverage = float(inliers.mean())
    sectors = int(np.count_nonzero(inliers.reshape(12, -1).mean(axis=1) >= 0.5))
    diagnostic = {"angularCoverage": round(coverage, 4), "supportedSectors": sectors}
    if coverage < 0.75 or sectors < 10:
        return None, diagnostic | {"failure": "reference ridge has insufficient angular support"}

    points = (np.array([x, y]) + distance[:, None] * directions)[inliers]
    center, radius = fit_circle(points)
    circle_residual = circle_errors(points, center, radius)
    circle_rmse = rms(circle_residual)
    ellipse_center, axes, angle = ellipse_parameters(points)
    ellipse_residual = ellipse_errors(points, ellipse_center, axes, angle)
    ellipse_rmse = rms(ellipse_residual)
    deformation = float(np.ptp(axes) / np.mean(axes))
    diagnostic |= {
        "circleRmse": round(circle_rmse, 4),
        "ellipseRmse": round(ellipse_rmse, 4),
        "relativeAxisDifference": round(deformation, 6),
    }
    reference = {"shape": "circle", "center": center.tolist(), "radius": radius}
    selected_rmse = circle_rmse
    quadrants = np.flatnonzero(inliers) // 90
    quadrant_support = sum(
        rms(ellipse_residual[quadrants == q]) < rms(circle_residual[quadrants == q])
        for q in range(4) if np.count_nonzero(quadrants == q) >= 45
    )
    if deformation >= 0.01 and ellipse_rmse <= 0.75 * circle_rmse and quadrant_support >= 3:
        reference = {
            "shape": "ellipse", "center": ellipse_center.tolist(),
            "axes": axes.tolist(), "angleDegrees": angle,
        }
        selected_rmse = ellipse_rmse
    diagnostic["rmse"] = round(selected_rmse, 4)
    if selected_rmse > 1.25 * scale:
        return None, diagnostic | {"failure": "reference fit has high residual"}
    return reference, diagnostic


def geometry(reference):
    if reference["shape"] == "circle":
        return np.full(2, reference["radius"]), np.eye(2)
    return np.asarray(reference["axes"]), rotation(reference["angleDegrees"])


def node_search(gray, proposal, offsets, radial_offsets, scale):
    x, y, radius = proposal
    trials = grid(x + offsets, y + offsets, radius + radial_offsets)
    x, y, radius = trials.T[:, :, None]
    inner = sample(gray, x, y, radius - 2 * scale, NODE_ANGLES)
    outer = sample(gray, x, y, radius + 2 * scale, NODE_ANGLES)
    gradient = inner - outer
    votes = np.clip(gradient / 20, -1, 1)
    support = np.abs(votes.mean(axis=1))
    strength = np.abs(np.clip(gradient / 120, -1, 1).mean(axis=1))
    quality = support + 0.08 * strength
    best = int(quality.argmax())
    polarity = np.sign(votes[best].sum())
    sector_floor = float((polarity * votes[best].reshape(12, -1).mean(axis=1)).min())
    return trials[best], float(support[best]), sector_floor, float(quality[best])


def refit_node(gray, x, y, radius, scale):
    radii = (radius + np.arange(-2.75, 2.76, 0.25, dtype=np.float32) * scale)[:, None]
    gradients = (
        sample(gray, x, y, radii - 1.5 * scale, NODE_ANGLES)
        - sample(gray, x, y, radii + 1.5 * scale, NODE_ANGLES)
    )
    gradients *= np.sign(np.median(gradients[len(radii) // 2]))
    peaks = gradients.argmax(axis=0)
    strengths = gradients[peaks, np.arange(len(peaks))]
    valid = (strengths >= 12) & (peaks > 0) & (peaks < len(radii) - 1)
    directions = np.column_stack((np.cos(NODE_ANGLES), np.sin(NODE_ANGLES)))
    points = np.array([x, y]) + radii[peaks] * directions
    for _ in range(2):
        if np.count_nonzero(valid) < 0.65 * len(valid):
            return x, y, radius
        center, fitted_radius = fit_circle(points[valid])
        valid &= np.abs(circle_errors(points, center, fitted_radius)) <= 1.5 * scale
    if np.linalg.norm(center - (x, y)) > 2 * scale or abs(fitted_radius - radius) > 2 * scale:
        return x, y, radius
    return float(center[0]), float(center[1]), fitted_radius


def detect_nodes(gray, reference):
    center = np.asarray(reference["center"])
    axes, basis = geometry(reference)
    scale = float(np.mean(axes) / BASE_RADIUS)
    # Undo an elliptical capture's deformation before running the circle detector.
    to_pixel = basis @ np.diag(axes / np.mean(axes))
    working = gray
    if reference["shape"] == "ellipse":
        transform = np.column_stack((to_pixel, center - to_pixel @ center))
        working = cv.warpAffine(gray, transform, gray.shape[::-1], flags=cv.INTER_LINEAR | cv.WARP_INVERSE_MAP)
    clean = cv.GaussianBlur(working, (0, 0), max(0.6, 0.9 * scale))
    hough_input = clean.astype(np.uint8)
    candidates = []
    for lower, upper in [(30, 36), (41, 50), (54, 63)]:
        proposals = cv.HoughCircles(
            hough_input, cv.HOUGH_GRADIENT, 1, 15 * scale,
            param1=95, param2=max(12, 19 * scale),
            minRadius=max(1, round(lower * scale)), maxRadius=round(upper * scale),
        )
        if proposals is not None:
            candidates.extend(proposals[0])
    scored = []
    coarse_offsets = np.arange(-2, 3) * scale
    fine_offsets = np.arange(-1, 1.01, 0.25) * scale
    for candidate in candidates:
        coarse, support, _, _ = node_search(clean, candidate, coarse_offsets, np.arange(-3, 4) * scale, scale)
        if support < 0.50:
            continue
        trial, support, floor, quality = node_search(clean, coarse, fine_offsets, fine_offsets, scale)
        x, y, r = map(float, trial)
        if support < 0.55 or np.linalg.norm(trial[:2] - center) > np.mean(axes) * 1.04:
            continue
        accepted = support >= 0.88
        # Prefer the continuous node border when a concentric glow also passed.
        scored.append((accepted, r < 52 * scale, quality, support, floor, x, y, r))
        if accepted and r >= 52 * scale:
            inner_offsets = np.arange(42, 51) * scale - r
            inner, inner_support, _, _ = node_search(clean, trial, coarse_offsets, inner_offsets, scale)
            if inner_support >= 0.82:
                inner, inner_support, floor, quality = node_search(clean, inner, fine_offsets, fine_offsets, scale)
                if inner_support >= 0.88:
                    scored.append((True, True, quality, inner_support, floor, *map(float, inner)))

    selected = []
    review = []
    for accepted, _, _, support, floor, x, y, radius in sorted(scored, reverse=True):
        if any(np.hypot(x - px, y - py) <= max(radius, pr) for px, py, pr in selected):
            continue
        if accepted:
            x, y, radius = refit_node(clean, x, y, radius, scale)
        selected.append((x, y, radius))
        pixel = center + to_pixel @ (np.array([x, y]) - center)
        position = (pixel - center) @ basis / axes
        node = {
            "pixel": {"center": pixel.tolist(), "radius": radius},
            "position": {"x": float(position[0]), "y": float(position[1])},
            "support": round(support, 4),
            "weakestSector": round(floor, 4),
            "status": "accepted" if support >= 0.94 else "review" if accepted else "unresolved",
        }
        if reference["shape"] == "ellipse":
            node["pixel"]["axes"] = (radius * axes / np.mean(axes)).tolist()
        review.append(node)
    return review


def order_nodes(nodes):
    rows = []
    for node in sorted(nodes, key=lambda n: (n["position"]["y"], n["position"]["x"])):
        if not rows or node["position"]["y"] - rows[-1][0]["position"]["y"] > 0.005:
            rows.append([])
        rows[-1].append(node)
    return [node for row in rows for node in sorted(row, key=lambda n: (n["position"]["x"], n["position"]["y"]))]


def draw_overlay(image, reference, nodes):
    overlay = image.copy()
    cyan, green, amber = (255, 232, 44), (88, 255, 100), (24, 176, 255)
    if reference is not None:
        center = tuple(round(v) for v in reference["center"])
        axes, _ = geometry(reference)
        axes = tuple(round(v) for v in axes)
        angle = reference.get("angleDegrees", 0)
        for start in range(0, 360, 6):
            cv.ellipse(overlay, center, axes, angle, start, start + 3, cyan, 2, cv.LINE_AA)
        cv.drawMarker(overlay, center, (0, 0, 0), cv.MARKER_CROSS, 32, 5, cv.LINE_AA)
        cv.drawMarker(overlay, center, cyan, cv.MARKER_CROSS, 32, 2, cv.LINE_AA)
    else:
        cv.putText(overlay, "Reference not found", (20, 35), cv.FONT_HERSHEY_SIMPLEX, 0.9, amber, 2, cv.LINE_AA)
    height, width = image.shape[:2]
    for node in nodes:
        x, y = (round(v) for v in node["pixel"]["center"])
        radius = node["pixel"]["radius"]
        axes = tuple(round(v) for v in node["pixel"].get("axes", (radius, radius)))
        color = green if node["status"] == "accepted" else amber
        label = node["id"]
        if node["status"] == "review":
            label += "?"
        cv.ellipse(overlay, (x, y), axes, reference.get("angleDegrees", 0), 0, 360, color, 1, cv.LINE_AA)
        cv.drawMarker(overlay, (x, y), (0, 0, 0), cv.MARKER_CROSS, 15, 4, cv.LINE_AA)
        cv.drawMarker(overlay, (x, y), color, cv.MARKER_CROSS, 15, 2, cv.LINE_AA)
        font = cv.FONT_HERSHEY_SIMPLEX
        (label_width, _), _ = cv.getTextSize(label, font, 0.65, 2)
        tx = min(x + axes[0] + 4, width - label_width - 4)
        if tx < x + axes[0]:
            tx = max(4, x - axes[0] - label_width - 4)
        ty = min(max(24, y - 6), height - 8)
        cv.putText(overlay, label, (tx, ty), font, 0.65, (0, 0, 0), 5, cv.LINE_AA)
        cv.putText(overlay, label, (tx, ty), font, 0.65, color, 2, cv.LINE_AA)
    return overlay


def round_numbers(value):
    if isinstance(value, dict):
        return {key: round_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [round_numbers(item) for item in value]
    return round(value, 8) if isinstance(value, float) else value


def write_json(path, value):
    path.write_text(json.dumps(round_numbers(value), indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")


def extract(path_info, input_dir, output, slug, reference_only=False):
    try:
        raw = (input_dir / path_info["file"]).read_bytes()
        image = cv.imdecode(np.frombuffer(raw, dtype=np.uint8), cv.IMREAD_COLOR)
    except OSError as error:
        return {"failure": str(error)}
    if image is None:
        return {"failure": "could not decode screenshot"}
    height, width = image.shape[:2]
    source = {"file": path_info["file"], "width": width, "height": height, "sha256": hashlib.sha256(raw).hexdigest()}
    gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY).astype(np.float32)
    reference, diagnostics = detect_reference(gray)
    result = {"source": source, "reference": reference, "referenceFit": diagnostics}
    if reference_only:
        if reference is None:
            result["failure"] = diagnostics.get("failure", "no reference ring")
        return result
    nodes = []
    candidates = []
    if reference is not None:
        detected = detect_nodes(gray, reference)
        nodes = order_nodes([node for node in detected if node["status"] != "unresolved"])
        for i, node in enumerate(nodes, 1):
            node["id"] = f"N{i:02d}"
        candidates = order_nodes([node for node in detected if node["status"] == "unresolved"])
        for i, node in enumerate(candidates, 1):
            node["id"] = f"R{i:02d}"
        result |= {"nodeCount": len(nodes), "nodes": nodes, "unresolvedCandidates": candidates}
    if reference is None or not nodes:
        result["failure"] = diagnostics.get("failure", "no nodes passed geometric checks")
    else:
        layout = {
            "schemaVersion": 1, "path": path_info["path"], "pathCode": path_info["pathCode"],
            "source": source, "reference": reference,
            "nodes": [
                {"id": node["id"], "anchorType": None, "position": node["position"], "pixel": node["pixel"]}
                for node in nodes
            ],
        }
        write_json(output / f"{slug}.json", layout)
    overlay = draw_overlay(image, reference, nodes + candidates)
    ok, encoded = cv.imencode(".png", overlay)
    if not ok:
        raise RuntimeError(f"could not encode overlay for {slug}")
    (output / f"{slug}.png").write_bytes(encoded.tobytes())
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, required=True, help="new directory inside this repository")
    parser.add_argument("--path", choices=PATHS, help="extract a single path for local diagnostics")
    parser.add_argument("--reference-only", action="store_true", help="calibrate screenshots without detecting nodes")
    args = parser.parse_args()
    output = args.output.resolve()
    formal_dir = REPO / "data" / "skill-tree-layouts"
    if not output.is_relative_to(REPO) or output.is_relative_to(formal_dir):
        parser.error("--output must be inside the repository and outside the formal layout directory")
    if output.exists() or output == args.input.resolve():
        parser.error("--output must be a new directory distinct from the screenshot directory")
    output.mkdir(parents=True)
    cv.setNumThreads(1)
    selected = [args.path] if args.path else PATHS
    results = {slug: extract(PATHS[slug], args.input, output, slug, args.reference_only) for slug in selected}
    write_json(output / "diagnostics.json", results)
    for slug, result in results.items():
        status = result.get("failure") or ("reference calibrated" if args.reference_only else
            f'{result["nodeCount"]} nodes, {len(result["unresolvedCandidates"])} unconfirmed candidates'
        )
        print(f"{slug}: {status}")
    return int(any("failure" in result for result in results.values()))


if __name__ == "__main__":
    raise SystemExit(main())

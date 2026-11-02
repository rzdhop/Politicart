// The ballot boxes on the road: a glass urne in a Marianne-blue frame, a
// tricolore band, a slot in its lid and a ballot envelope marked "?" turning
// inside (DEC-065). They replaced the plain golden octahedra.
//
// Every box of a circuit is drawn by four instanced meshes (the frame, the
// glass, the envelope and a glow disc on the road), so 36 to 60 boxes cost
// four draws, on "légers" as on "détaillés". Each box keeps its own
// `mesh`, a plain Object3D proxy never added to the scene: the simulation
// and the effects move, hide and scale it as they did the old mesh (items.js
// pickupItems, vfx.js deriveBoxes, netrace.js), and syncBallotBoxes() copies
// the proxies into the instances once per drawn frame, with a bob and a
// slow turn.
//
// The fake box (Sondage truqué, Fake news) is drawn by buildFakeBallotBox():
// the same urne with a tell for a sharp eye -- its "?" is upside down and it
// tilts as it turns.
import * as THREE from 'three';

import { canvasTexture } from './primitives.js';
import { G, disposable, getPoly } from './state.js';

/** The urne's outer size (m): width and depth, height. */
export const BOX_W = 2.0, BOX_H = 2.1;
/** How high over the road a box floats (m), and how far it bobs. */
export const BOX_Y = 1.4, BOB = 0.18;

const BLUE = 0x1f3a93, WHITE = 0xf6f1e4, RED = 0xc8102e, DARK = 0x1a1a24, GOLD = 0xf2c14e;

/** A box geometry of size (w, h, d) at (x, y, z), non-indexed, with a vertex colour. */
function part(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
/** Concatenate non-indexed geometries with positions, normals and colours. */
function concat(parts) {
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry(), pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/**
 * The frame of the urne, centred on its middle: twelve blue edges, a white
 * lid with a dark slot and gold hinges, a tricolore band round the middle of
 * the front and the back, and four feet.
 */
export function frameGeometry() {
  const w = BOX_W, h = BOX_H, t = 0.12, hw = w / 2, hh = h / 2, P = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(t, h, t, sx * hw, 0, sz * hw, BLUE));               // the four uprights
  for (const sy of [-1, 1]) for (const s of [-1, 1]) { P.push(part(w, t, t, 0, sy * hh, s * hw, BLUE)); P.push(part(t, t, w, s * hw, sy * hh, 0, BLUE)); }   // the eight rails
  P.push(part(w + 0.06, 0.1, w + 0.06, 0, hh + 0.08, 0, WHITE));                                                        // the lid
  P.push(part(0.9, 0.04, 0.16, 0, hh + 0.14, 0, DARK));                                                                  // its slot
  for (const x of [-0.6, 0.6]) P.push(part(0.18, 0.06, 0.1, x, hh + 0.14, -hw + 0.12, GOLD));                            // the hinges
  for (const z of [-hw - 0.01, hw + 0.01]) [BLUE, WHITE, RED].forEach((c, i) => P.push(part(w / 3 - 0.02, 0.22, 0.03, (i - 1) * (w / 3), -hh + 0.45, z, c)));   // the band
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(0.22, 0.12, 0.22, sx * (hw - 0.05), -hh - 0.1, sz * (hw - 0.05), DARK));   // the feet
  return concat(P);
}

let envelopeTex = null, fakeTex = null;
/** The envelope's face: cream paper, a gold border and a big "?" (upside down for the fake). */
function envelopeTexture(fake) {
  const draw = (c, w, h) => {
    c.fillStyle = '#fff6dc'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d9a520'; c.lineWidth = 10; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = '#e7d8b0'; c.beginPath(); c.moveTo(8, 8); c.lineTo(w / 2, h * 0.48); c.lineTo(w - 8, 8); c.closePath(); c.fill();   // the flap
    c.save(); c.translate(w / 2, h * 0.6); if (fake) c.rotate(Math.PI);
    c.fillStyle = '#1f3a93'; c.font = 'bold ' + Math.round(h * 0.62) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, 0);
    c.restore();
  };
  if (fake) return fakeTex || (fakeTex = canvasTexture(128, 96, draw));
  return envelopeTex || (envelopeTex = canvasTexture(128, 96, draw));
}

/** The four materials: the frame (vertex colours), the glass, the envelope and the glow on the road. */
function materials(fake = false) {
  return {
    frame: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xd8ecff, emissive: 0x3a2a00, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
    envelope: new THREE.MeshStandardMaterial({ map: envelopeTexture(fake), emissive: 0x4a3a10, emissiveIntensity: 0.6, roughness: 0.6, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.35, depthWrite: false }),
  };
}

/** Shared geometries (built once). */
let GEO = null;
function geometries() {
  if (GEO) return GEO;
  const low = getPoly() === 'low';
  const glow = new THREE.CircleGeometry(1.6, low ? 12 : 24); glow.rotateX(-Math.PI / 2);
  GEO = { frame: frameGeometry(), glass: new THREE.BoxGeometry(BOX_W - 0.08, BOX_H - 0.08, BOX_W - 0.08), envelope: new THREE.BoxGeometry(1.15, 0.82, 0.04), glow };
  return GEO;
}

/** The parts of a box, in draw order: the glass last so the envelope shows through it. */
const PARTS = ['glow', 'frame', 'envelope', 'glass'];

/**
 * Build the boxes at `spots` (`{ x, y, z }` each, y the road's height) into
 * `scene`: fills G.itemBoxes with `{ x, z, mesh, active, timer, y }` (mesh
 * the proxy) and G.boxBatch with the instanced meshes. Returns the batch.
 */
export function buildBallotBoxes(scene, spots) {
  const geo = geometries(), mats = materials(), n = Math.max(1, spots.length);
  for (const m of Object.values(mats)) disposable(m);   // freed with the circuit (race.js disposeScene); the shared geometries and textures stay
  const batch = {};
  for (const name of PARTS) {
    const m = new THREE.InstancedMesh(geo[name], mats[name], n); m.name = 'road:urne:' + name; m.frustumCulled = false;
    m.castShadow = name === 'frame'; m.renderOrder = name === 'glass' ? 2 : name === 'glow' ? 1 : 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = spots.length; batch[name] = m; scene.add(m);
  }
  G.itemBoxes = spots.map((p, i) => {
    const mesh = new THREE.Object3D(); mesh.position.set(p.x, p.y + BOX_Y, p.z); mesh.rotation.y = i * 0.7;
    return { x: p.x, z: p.z, y: p.y, mesh, active: true, timer: 0, phase: i * 1.37 };
  });
  G.boxBatch = batch;
  syncBallotBoxes(0);
  return batch;
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3(), SPIN = new THREE.Matrix4();
let clock = 0;
/**
 * Copy every box's proxy into the instances for this frame: its position
 * plus a bob, its turn, its scale (0 while taken). The envelope turns the
 * other way inside, and the glow on the road breathes. No-op without boxes.
 */
export function syncBallotBoxes(dt) {
  const b = G.boxBatch; if (!b || !G.itemBoxes) return;
  clock += dt;
  G.itemBoxes.forEach((box, i) => {
    const m = box.mesh, sc = m.visible ? m.scale.x : 0, bob = Math.sin(clock * 2.2 + (box.phase || 0)) * BOB;
    P.set(m.position.x, m.position.y + bob, m.position.z); E.set(0, m.rotation.y, 0); Q.setFromEuler(E); S.setScalar(sc);
    M.compose(P, Q, S); b.frame.setMatrixAt(i, M); b.glass.setMatrixAt(i, M);
    SPIN.makeRotationY(-clock * 2.6 - m.rotation.y * 2); M.multiply(SPIN); b.envelope.setMatrixAt(i, M);
    P.set(m.position.x, (box.y ?? m.position.y - BOX_Y) + 0.06, m.position.z); Q.identity(); S.setScalar(sc * (0.85 + 0.15 * Math.sin(clock * 3 + i)));
    M.compose(P, Q, S); b.glow.setMatrixAt(i, M);
  });
  for (const name of PARTS) b[name].instanceMatrix.needsUpdate = true;
}

/** The fake urne's materials, shared by every fake box of every race (a handful at most are ever on the road). */
let FAKE_MATS = null;

/**
 * The fake urne (Sondage truqué's hazard, the Fake news row), as a group of
 * ordinary meshes standing on its spot: the same box at the same height, its
 * "?" upside down, and a tilt as it turns (the group's `userData.tick`).
 */
export function buildFakeBallotBox() {
  const geo = geometries(), mats = FAKE_MATS || (FAKE_MATS = materials(true)), g = new THREE.Group(), inner = new THREE.Group();
  inner.position.y = BOX_Y; g.add(inner);
  for (const name of PARTS) { const m = new THREE.Mesh(geo[name], mats[name]); m.renderOrder = name === 'glass' ? 2 : 0; if (name === 'glow') { m.position.y = -BOX_Y + 0.06; g.add(m); } else inner.add(m); }
  const env = inner.children.find(m => m.geometry === geo.envelope);
  g.userData.tick = (dt, t) => { inner.rotation.y -= dt * 1.4; inner.rotation.z = Math.sin(t * 3.1) * 0.12; inner.position.y = BOX_Y + Math.sin(t * 2.2) * BOB; if (env) env.rotation.y += dt * 2.6; };
  return g;
}

// Pure gesture state machine, modeled on how 8pen actually worked. The
// four boundary lines ("arms") sit on the screen diagonals (45, 135,
// 225, 315 degrees), matching the original's X orientation, so the
// sectors between them are up (N), right (E), down (S), and left (W).
// A letter is (entry sector, rotation direction, crossings), where
// crossings is how many arms the finger crosses before returning to the
// center dot. Minimum is 1: an out-and-back that crosses no arm types
// nothing, which makes rotation direction unambiguous (the first
// crossing fixes it). 4 sectors x 2 directions x 4 crossings = 32
// letters. One extra full loop (crossings 5-8) selects the same letter
// as crossings-4 but as a capital, which is how 8pen reportedly did
// capitals. The center circle doubles as the spacebar two ways, both
// from the original: a tap that never leaves it, or a dip from the
// center into a sector and back with no arm crossed, which keeps whole
// sentences in one stroke. A stationary press-and-release out in a
// sector is a function tap; an outside press that slides into another
// sector, or into the center circle, commits a sector drag on lift.
// Both mappings live in main.js. No DOM or canvas dependency here, so this file is
// unit-testable on its own and is the piece meant to port to Swift once
// the design is proven.
// See gesture-keyboard-handoff.md and features.md.

function normalizeAngle(angleDeg) {
  return ((angleDeg % 360) + 360) % 360;
}

// Screen-coordinate sector ring for clockwise rotation (angle grows CW
// because the y axis points down): E [315,45) -> S -> W -> N.
export const SECTOR_ORDER_CW = ['E', 'S', 'W', 'N'];

// Shifting by +45 puts the diagonal arms on multiples of 90, so sector
// and crossing math reduce to plain floor division.
function shifted(angleDeg) {
  return normalizeAngle(angleDeg + 45);
}

export function angleToSector(angleDeg) {
  return SECTOR_ORDER_CW[Math.floor(shifted(angleDeg) / 90) % 4];
}

function normalizeDelta(deltaDeg) {
  let d = deltaDeg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export class GestureDecoder {
  constructor({ center, deadZoneRadius = 40 }) {
    this.center = center;
    this.deadZoneRadius = deadZoneRadius;
    this.reset();
  }

  reset() {
    this.state = 'idle'; // idle | center | active | outside
    this.entryShifted = null; // shifted angle where the finger left the dead zone
    this.entrySector = null;
    this.lastAngle = null; // raw angle of the previous sample, for delta tracking
    this.cumulativeAngle = 0;
    this.leftCenter = false; // did this press ever cross out of the dead zone
    this.maxCrossings = 0; // most arms crossed at any point in this excursion
    this.downPoint = null; // where this press landed, for tap detection
  }

  distanceAndAngle(x, y) {
    const dx = x - this.center.x;
    const dy = y - this.center.y;
    const dist = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { dist, angle };
  }

  // Signed count of arms crossed since leaving the center. In the
  // shifted frame the arms sit on multiples of 90, so every time the
  // unwrapped angle passes one, the floor changes by exactly one
  // crossing. Wobbling back across an arm un-counts it, so the value at
  // commit time is the net position, matching how 8pen resolved a
  // gesture.
  get signedCrossings() {
    if (this.entryShifted === null) return 0;
    return (
      Math.floor((this.entryShifted + this.cumulativeAngle) / 90) -
      Math.floor(this.entryShifted / 90)
    );
  }

  get direction() {
    const c = this.signedCrossings;
    if (c === 0) return null;
    return c > 0 ? 'CW' : 'CCW';
  }

  get crossings() {
    return Math.abs(this.signedCrossings);
  }

  pointerDown(x, y) {
    this.reset();
    const { dist } = this.distanceAndAngle(x, y);
    this.downPoint = { x, y };
    // Letter gestures must start in the center, as in the original 8pen.
    // A press that starts out in a sector never types letters: held
    // still it is a function tap, and a moved press commits a sector
    // drag on lift (see pointerUp). Same-sector drags stay reserved
    // (the original used outside starts for user-defined word macros).
    this.state = dist <= this.deadZoneRadius ? 'center' : 'outside';
    return this.snapshot();
  }

  activate(angle) {
    this.state = 'active';
    this.leftCenter = true;
    this.maxCrossings = 0;
    this.entryShifted = shifted(angle);
    this.entrySector = angleToSector(angle);
    this.lastAngle = angle;
    this.cumulativeAngle = 0;
  }

  pointerMove(x, y) {
    if (this.state === 'idle') return this.snapshot();
    const { dist, angle } = this.distanceAndAngle(x, y);

    if (this.state === 'outside') return this.snapshot();

    if (this.state === 'center') {
      // Hysteresis: leaving needs 15% more distance than returning, so
      // jitter at the dead zone edge cannot spray dip-spaces.
      if (dist > this.deadZoneRadius * 1.15) this.activate(angle);
      return this.snapshot();
    }

    // state === 'active'
    if (dist <= this.deadZoneRadius) {
      // Returning to center commits, as in 8pen ("loops starting and
      // ending in the central dot"). The pointer stays down, so the next
      // crossing starts the next letter in the same continuous stroke:
      // flow input, priority #1 in the handoff doc.
      // A dip that crossed no arm at all is a space, exactly as the
      // original 8pen did it, so whole sentences stay in one stroke. A
      // backtracked letter (crossed arms, then rotated back to zero) is
      // a cancel instead, our deliberate divergence.
      let committed = this.commitLetter();
      if (!committed && this.maxCrossings === 0) {
        committed = { type: 'space', via: 'dip' };
      }
      this.entryShifted = null;
      this.entrySector = null;
      this.lastAngle = null;
      this.cumulativeAngle = 0;
      this.state = 'center';
      return { ...this.snapshot(), committed };
    }

    const delta = normalizeDelta(angle - this.lastAngle);
    this.cumulativeAngle += delta;
    this.lastAngle = angle;
    this.maxCrossings = Math.max(this.maxCrossings, this.crossings);
    return this.snapshot();
  }

  pointerUp(x, y) {
    let committed = null;
    if (this.state === 'active') {
      // Lifting outside the center still commits a letter in progress,
      // per the handoff doc's priority #4: sloppy gestures should land.
      // With no crossings this is 8pen's "end word without a space".
      committed = this.commitLetter();
    } else if (this.state === 'outside') {
      // Held still: a function tap. Moved into another sector or into
      // the center circle: a sector drag; main.js maps South starts to
      // punctuation. A drag that ends in its own sector stays silent
      // and reserved.
      const moved = Math.hypot(x - this.downPoint.x, y - this.downPoint.y);
      if (moved < 18) {
        const { angle } = this.distanceAndAngle(this.downPoint.x, this.downPoint.y);
        committed = { type: 'function', sector: angleToSector(angle) };
      } else {
        const from = angleToSector(this.distanceAndAngle(this.downPoint.x, this.downPoint.y).angle);
        const { dist, angle } = this.distanceAndAngle(x, y);
        // 'C' marks a lift inside the center circle, kept distinct from
        // the sectors: main.js counts it as a generous North target,
        // and a future gesture may want the exact geometry.
        const to = dist <= this.deadZoneRadius ? 'C' : angleToSector(angle);
        if (to !== from) committed = { type: 'drag', from, to };
      }
    } else if (this.state === 'center' && !this.leftCenter) {
      // Pure tap on the center dot, never left it: the spacebar.
      committed = { type: 'space', via: 'tap' };
    }
    this.reset();
    return { committed };
  }

  commitLetter() {
    return commitFor(this.entrySector, this.signedCrossings);
  }

  // Live glide preview: for each screen sector, what committing after a
  // glide there would type. Adjacent sectors are one crossing away; the
  // opposite one is two, and reachable both ways around; the sector
  // that returns the count to zero is a cancel. main.js draws this big
  // in the sector middles while the finger moves.
  preview() {
    if (this.state !== 'active') return null;
    const entryIdx = SECTOR_ORDER_CW.indexOf(this.entrySector);
    const c = this.signedCrossings;
    const curIdx = entryIdx + c;
    const q = (i) => SECTOR_ORDER_CW[((i % 4) + 4) % 4];
    return {
      current: q(curIdx),
      commitNow: commitFor(this.entrySector, c),
      adjacent: {
        [q(curIdx + 1)]: commitFor(this.entrySector, c + 1),
        [q(curIdx - 1)]: commitFor(this.entrySector, c - 1),
      },
      opposite: {
        sector: q(curIdx + 2),
        cw: commitFor(this.entrySector, c + 2),
        ccw: commitFor(this.entrySector, c - 2),
        established: c === 0 ? null : c > 0 ? 'CW' : 'CCW',
      },
    };
  }

  snapshot() {
    return {
      state: this.state,
      sector: this.entrySector,
      direction: this.direction,
      crossings: this.crossings,
      // What returning to center now would do beyond a letter: a space
      // (fresh dip from center) or a silent cancel. Lets the preview
      // show the truth in the center circle.
      dipWouldSpace: this.state === 'active' && this.maxCrossings === 0,
      preview: this.preview(),
    };
  }
}

// The commit a gesture would produce at a given net crossing count.
// Pure, so the preview can evaluate hypothetical glides.
export function commitFor(entrySector, signedCrossings) {
  const raw = Math.abs(signedCrossings);
  if (raw === 0) return null; // returning with no net crossing types nothing
  const capital = raw > 4;
  return {
    type: 'letter',
    sector: entrySector,
    direction: signedCrossings > 0 ? 'CW' : 'CCW',
    crossings: capital ? Math.min(4, raw - 4) : raw,
    capital,
  };
}

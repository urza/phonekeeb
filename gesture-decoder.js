// Pure gesture state machine, modeled on how 8pen actually worked. A
// letter is (entry quadrant, rotation direction, crossings), where
// crossings is how many quadrant boundary lines the finger crosses before
// returning to the center dot. Minimum is 1: an out-and-back that crosses
// no line types nothing, which both forgives accidental exits and makes
// rotation direction unambiguous (the first crossing fixes it). 4
// quadrants x 2 directions x 4 crossings = 32 letters. One extra full
// loop (crossings 5-8) selects the same letter as crossings-4 but as a
// capital, which is how 8pen reportedly did capitals. The center circle
// doubles as the spacebar: a tap that never leaves it commits a space.
// No DOM or canvas dependency here, so this file is unit-testable on its
// own and is the piece meant to port to Swift once the design is proven.
// See gesture-keyboard-handoff.md, "Technical approach: Gesture decoding".

function normalizeAngle(angleDeg) {
  return ((angleDeg % 360) + 360) % 360;
}

export function angleToQuadrant(angleDeg) {
  const a = normalizeAngle(angleDeg);
  if (a < 90) return 'SE';
  if (a < 180) return 'SW';
  if (a < 270) return 'NW';
  return 'NE';
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
    this.state = 'idle'; // idle | center | active
    this.entryAngle = null; // normalized angle where the finger left the dead zone
    this.entryQuadrant = null;
    this.lastAngle = null; // raw angle of the previous sample, for delta tracking
    this.cumulativeAngle = 0;
    this.leftCenter = false; // did this press ever cross out of the dead zone
    this.path = [];
  }

  distanceAndAngle(x, y) {
    const dx = x - this.center.x;
    const dy = y - this.center.y;
    const dist = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { dist, angle };
  }

  // Signed count of boundary lines crossed since leaving the center.
  // Every time the unwrapped angle (entry + cumulative) passes a multiple
  // of 90, the floor changes by one, which is exactly one line crossing.
  // Wobbling back across a line un-counts it, so the value at commit time
  // is the net position, matching how 8pen resolved a gesture.
  get signedCrossings() {
    if (this.entryAngle === null) return 0;
    return (
      Math.floor((this.entryAngle + this.cumulativeAngle) / 90) -
      Math.floor(this.entryAngle / 90)
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
    const { dist, angle } = this.distanceAndAngle(x, y);
    this.path.push({ x, y });
    if (dist <= this.deadZoneRadius) {
      this.state = 'center';
    } else {
      // Finger landed outside the dead zone. Real 8pen usage always starts
      // centered, but a prototype should stay usable for a sloppy start.
      this.activate(angle);
    }
    return this.snapshot();
  }

  activate(angle) {
    this.state = 'active';
    this.leftCenter = true;
    this.entryAngle = normalizeAngle(angle);
    this.entryQuadrant = angleToQuadrant(angle);
    this.lastAngle = angle;
    this.cumulativeAngle = 0;
  }

  pointerMove(x, y) {
    if (this.state === 'idle') return this.snapshot();
    this.path.push({ x, y });
    if (this.path.length > 800) this.path.splice(0, this.path.length - 800);
    const { dist, angle } = this.distanceAndAngle(x, y);

    if (this.state === 'center') {
      if (dist > this.deadZoneRadius) this.activate(angle);
      return this.snapshot();
    }

    // state === 'active'
    if (dist <= this.deadZoneRadius) {
      // Returning to center is what completes a letter in 8pen ("loops
      // starting and ending in the central dot"). The pointer stays down,
      // so the next crossing starts the next letter in the same
      // continuous stroke, matching the handoff doc's priority #1: flow
      // input, one continuous movement, rather than one touch per letter.
      const committed = this.commitLetter();
      this.entryAngle = null;
      this.entryQuadrant = null;
      this.lastAngle = null;
      this.cumulativeAngle = 0;
      this.state = 'center';
      return { ...this.snapshot(), committed };
    }

    const delta = normalizeDelta(angle - this.lastAngle);
    this.cumulativeAngle += delta;
    this.lastAngle = angle;
    return this.snapshot();
  }

  pointerUp(x, y) {
    let committed = null;
    if (this.state === 'active') {
      // Lifting outside the center still commits, per the handoff doc's
      // priority #4: sloppy gestures should land.
      committed = this.commitLetter();
    } else if (this.state === 'center' && !this.leftCenter) {
      // Pure tap on the center dot, never left it: the spacebar.
      committed = { type: 'space' };
    }
    const path = this.path;
    this.reset();
    return { committed, path };
  }

  commitLetter() {
    const raw = this.crossings;
    if (raw === 0) return null; // no line crossed, no letter
    const capital = raw > 4;
    const crossings = capital ? Math.min(4, raw - 4) : raw;
    return {
      type: 'letter',
      quadrant: this.entryQuadrant,
      direction: this.direction,
      crossings,
      capital,
    };
  }

  snapshot() {
    return {
      state: this.state,
      quadrant: this.entryQuadrant,
      direction: this.direction,
      crossings: this.crossings,
      path: this.path,
    };
  }
}

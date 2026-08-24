// Pure gesture state machine, modeled on how 8pen actually worked: a
// letter is (entry quadrant, rotation direction, depth), where depth is
// how many quadrant boundaries you cross before returning to the center
// dot. 4 quadrants x 2 directions x 4 depths (0-3) = 32 addressable
// letters, most frequent needing the least rotation. The center circle
// doubles as the spacebar: a tap that never leaves it commits a space.
// No DOM or canvas dependency here, so this file is unit-testable on its
// own and is the piece meant to port to Swift once the design is proven.
// See gesture-keyboard-handoff.md, "Technical approach: Gesture decoding".

function angleToQuadrant(angleDeg) {
  const a = ((angleDeg % 360) + 360) % 360;
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
    this.entryQuadrant = null;
    this.lastAngle = null;
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

  // Direction defaults to CW for an almost-straight jab (cumulativeAngle
  // near zero), matching 8pen's full 32-slot address space rather than
  // treating "no rotation" as a direction-less 33rd case.
  get rotationDirection() {
    return this.cumulativeAngle >= 0 ? 'CW' : 'CCW';
  }

  get depth() {
    return Math.min(3, Math.round(Math.abs(this.cumulativeAngle) / 90));
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
      this.state = 'active';
      this.leftCenter = true;
      this.entryQuadrant = angleToQuadrant(angle);
      this.lastAngle = angle;
    }
    return this.snapshot();
  }

  pointerMove(x, y) {
    if (this.state === 'idle') return this.snapshot();
    this.path.push({ x, y });
    const { dist, angle } = this.distanceAndAngle(x, y);

    if (this.state === 'center') {
      if (dist > this.deadZoneRadius) {
        this.leftCenter = true;
        this.entryQuadrant = angleToQuadrant(angle);
        this.lastAngle = angle;
        this.cumulativeAngle = 0;
        this.state = 'active';
      }
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
    if (!this.entryQuadrant) return null;
    return {
      type: 'letter',
      quadrant: this.entryQuadrant,
      direction: this.rotationDirection,
      depth: this.depth,
    };
  }

  snapshot() {
    return {
      state: this.state,
      quadrant: this.entryQuadrant,
      direction: this.entryQuadrant ? this.rotationDirection : null,
      depth: this.entryQuadrant ? this.depth : null,
      path: this.path,
    };
  }
}

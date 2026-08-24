// Pure gesture state machine: sector, rotation direction, and loop count.
// No DOM or canvas dependency here, so this file is unit-testable on its
// own and is the piece meant to port to Swift once the design is proven.
// See gesture-keyboard-handoff.md, "Technical approach: Gesture decoding".

function angleToSector(angleDeg) {
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
  constructor({ center, deadZoneRadius = 40, directionEpsilon = 15 }) {
    this.center = center;
    this.deadZoneRadius = deadZoneRadius;
    this.directionEpsilon = directionEpsilon;
    this.reset();
  }

  reset() {
    this.state = 'idle'; // idle | center | active
    this.entrySector = null;
    this.lastAngle = null;
    this.cumulativeAngle = 0;
    this.path = [];
  }

  distanceAndAngle(x, y) {
    const dx = x - this.center.x;
    const dy = y - this.center.y;
    const dist = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { dist, angle };
  }

  get rotationDirection() {
    if (Math.abs(this.cumulativeAngle) < this.directionEpsilon) return null;
    return this.cumulativeAngle > 0 ? 'CW' : 'CCW';
  }

  get loopCount() {
    return Math.floor(Math.abs(this.cumulativeAngle) / 360);
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
      this.entrySector = angleToSector(angle);
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
        this.entrySector = angleToSector(angle);
        this.lastAngle = angle;
        this.cumulativeAngle = 0;
        this.state = 'active';
      }
      return this.snapshot();
    }

    // state === 'active'
    if (dist <= this.deadZoneRadius) {
      // Returning to center commits the letter in progress. The pointer
      // stays down, so the next crossing starts the next letter in the
      // same continuous stroke (flow input, per the handoff doc's
      // priority #1, rather than one gesture per pointer press).
      const committed = this.commitSnapshot();
      this.entrySector = null;
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
    const committed = this.state === 'active' ? this.commitSnapshot() : null;
    const path = this.path;
    this.reset();
    return { committed, path };
  }

  commitSnapshot() {
    if (!this.entrySector) return null;
    return {
      sector: this.entrySector,
      rotationDirection: this.rotationDirection,
      loopCount: this.loopCount,
    };
  }

  snapshot() {
    return {
      state: this.state,
      sector: this.entrySector,
      rotationDirection: this.rotationDirection,
      loopCount: this.loopCount,
      path: this.path,
    };
  }
}

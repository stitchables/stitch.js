let Stitch = {};

Stitch.Pattern = class {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.threads = [];
    this.defaultOptions = {
      units: 'px',
      pixelMultiplier: 3.78, // 3.78 seems a bit arbitrary but ¯\_(ツ)_/¯ - https://stackoverflow.com/questions/35359334/svg-mm-and-px-co-ordinates-lengths-differ-for-defined-viewbox
      strokeWidth: 1,
      justify: false,
      parentElement: document.body,
      showStitches: false,
      sigFigs: 5,
      namespace: "http://www.w3.org/2000/svg",
      minimumPathLength: 0,
      maximumJoinDistance: 0,
      maximumStitchesPerSquareMm: 0
    };
  }
  addThread(red = 0, green = 0, blue = 0) {
    let thread = new Stitch.Thread(red, green, blue);
    this.threads.push(thread);
    return thread;
  }
  getStitches(width, height, pixelMultiplier = 3.78, minimumPathLength = 0, maximumJoinDistance = 0, maximumStitchesPerSquareMm = 0) {
    let dimensions = width / height > this.width / this.height ? { width: (this.width / this.height) * height, height: height } : { width: width, height: (this.height / this.width) * width };
    let pixelsPerUnit = pixelMultiplier * this.width / dimensions.width;
    let stitches = {
      dimensions: dimensions,
      pixelsPerUnit: pixelsPerUnit,
      boundingBox: { min: new Stitch.Math.Vector(Infinity, Infinity), max: new Stitch.Math.Vector(-Infinity, -Infinity) },
      stitchCount: 0,
      threads: []
    };

    for (let t of this.threads) {
      let thread = { thread: t, runs: [] };
      for (let r of t.runs) {
        let run = [];
        for (let stitch of r.getStitches(pixelsPerUnit)) {
          if (isNaN(stitch.x) || isNaN(stitch.y)) continue;
          run.push(new Stitch.Math.Vector(stitch.x, stitch.y));
          stitches.stitchCount++;
          if (stitch.x < stitches.boundingBox.min.x) stitches.boundingBox.min.x = stitch.x;
          if (stitch.y < stitches.boundingBox.min.y) stitches.boundingBox.min.y = stitch.y;
          if (stitch.x > stitches.boundingBox.max.x) stitches.boundingBox.max.x = stitch.x;
          if (stitch.y > stitches.boundingBox.max.y) stitches.boundingBox.max.y = stitch.y;
        }
        thread.runs.push(run);
      }
      stitches.threads.push(thread);
    }

    if (maximumStitchesPerSquareMm > 0) {
      let rangeSizeMm = 1;
      let rangeSizePx = rangeSizeMm * pixelsPerUnit;
      let boundingBox = new Stitch.Math.BoundingBox(
        0.5 * (stitches.boundingBox.min.x + stitches.boundingBox.max.x),
        0.5 * (stitches.boundingBox.min.y + stitches.boundingBox.max.y),
        0.5 * (stitches.boundingBox.max.x - stitches.boundingBox.min.x),
        0.5 * (stitches.boundingBox.max.y - stitches.boundingBox.min.y)
      );
      let quadtree = new Stitch.Math.Quadtree(boundingBox, 10);
      for (let t of stitches.threads) {
        let newRuns = [];
        for (let r of t.runs) {
          newRuns.push([]);
          for (let s of r) {
            let range = new Stitch.Math.BoundingBox(s.x, s.y, 0.5 * rangeSizePx, 0.5 * rangeSizePx);
            let closeStitches = quadtree.query(range);
            if (closeStitches.length / rangeSizeMm / rangeSizeMm >= maximumStitchesPerSquareMm) {
              if (newRuns[newRuns.length - 1].length > 0) newRuns.push([]);
              continue;
            } else {
              quadtree.insert(s.x, s.y);
              newRuns[newRuns.length - 1].push(s);
            }
          }
        }
        newRuns.filter(r => r.length > 0);
        t.runs = newRuns;
      }
    }

    if (minimumPathLength > 0) {
      for (let t of stitches.threads) {
        for (let i = t.runs.length - 1; i >= 0; i--) {
          let runLength = 0;
          for (let j = 1; j < t.runs[i].length; j++) {
            runLength += t.runs[i][j - 1].distance(t.runs[i][j]);
          }
          if (runLength < minimumPathLength * pixelsPerUnit) {
            t.runs.splice(i, 1);
          }
        }
      }
    }

    if (maximumJoinDistance > 0) {
      for (let t of stitches.threads) {
        let polylines = [];
        for (let r of t.runs) polylines.push(Stitch.Math.Polyline.fromVectors(r));
        let joinedPolylines = Stitch.Optimize.joinPolylines(polylines, maximumJoinDistance * pixelsPerUnit);
        t.runs = [];
        for (let joinedPolyline of joinedPolylines) {
          let run = [];
          if (joinedPolyline) {
            for (let v of joinedPolyline.vertices) {
              run.push(new Stitch.Math.Vector(v.x, v.y));
            }
            t.runs.push(run);
          }
        }
      }
    }

    return stitches;
  }
  getSvg(width, height, options = null) {
    if (options) {
      for (let [key, value] of Object.entries(this.defaultOptions)) if (!(key in options)) options[key] = value;
    } else options = this.defaultOptions;
    let stitches = this.getStitches(width, height, options.pixelMultiplier, options.minimumPathLength, options.maximumJoinDistance, options.maximumStitchesPerSquareMm);
    let svg = document.createElementNS(options.namespace, "svg");
    svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
    svg.setAttribute("width", `${stitches.dimensions.width}${options.units}`);
    svg.setAttribute("height", `${stitches.dimensions.height}${options.units}`);
    let showStitchesGroup = document.createElementNS(options.namespace, "g");
    showStitchesGroup.setAttribute("style", `fill: rgb(0, 0, 0); stroke-width: 0;`);
    for (let t of stitches.threads) {
      let group = document.createElementNS(options.namespace, "g");
      group.setAttribute("style", `fill: none; stroke-width: ${options.strokeWidth}; stroke: rgb(${t.thread.red}, ${t.thread.green}, ${t.thread.blue});`);
      if (options.justify) {
        let xTranslate = Number((-1 * stitches.boundingBox.min.x).toPrecision(options.sigFigs));
        let yTranslate = Number((-1 * stitches.boundingBox.min.y).toPrecision(options.sigFigs));
        group.setAttribute("transform", `translate(${xTranslate} ${yTranslate})`);
      }
      svg.appendChild(group);
      for (let r of t.runs) {
        let d = "";
        for (let [i, stitch] of r.entries()) {
          d += `${(i === 0) ? "M" : " L"} ${Number(stitch.x.toPrecision(options.sigFigs))} ${Number(stitch.y.toPrecision(options.sigFigs))}`;
          if (options.showStitches) {
            let circle = document.createElementNS(options.namespace, "circle");
            circle.setAttribute("cx", Number(stitch.x.toPrecision(options.sigFigs)));
            circle.setAttribute("cy", Number(stitch.y.toPrecision(options.sigFigs)));
            circle.setAttribute("r", 1);
            showStitchesGroup.appendChild(circle);
          }
        }
        let path = document.createElementNS(options.namespace, "path");
        path.setAttribute("stroke-linejoin", "bevel");
        path.setAttribute("vector-effect", "non-scaling-stroke");
        path.setAttribute("d", d);
        group.appendChild(path);
      }
    }
    if (options.showStitches) svg.appendChild(showStitchesGroup);
    return svg;
  }
  draw(width, height, options) {
    if (options) {
      for (let [key, value] of Object.entries(this.defaultOptions)) if (!(key in options)) options[key] = value;
    } else options = this.defaultOptions;
    // options.pixels = true;
    let svg = this.getSvg(width, height, options);
    options.parentElement.appendChild(svg);
    return svg;
  }
};

Stitch.Thread = class {
  constructor(red, green, blue) { [this.red, this.green, this.blue, this.runs] = [red, green, blue, []]; }
  addRun(run) { this.runs.push(run); }
};

Stitch.Units = {
  inToMm: function (inches) { return inches * 25.4; },
  mmToIn: function (millimeters) { return millimeters / 25.4; }
};

Stitch.Optimize = {
  joinPolylines: function(polylines, maxJoinDistance) {
    let joinedPolylines = [polylines[0]];
    let queue = polylines.slice(1);
    while (true) {
      let [done, nextPolyline, queueIndex, minDistance, reverseFlag, frontAppendFlag] = [true, null, 0, Infinity, false, false];
      for (let [i, polyline] of queue.entries()) {
        let currentStart = joinedPolylines[joinedPolylines.length - 1].vertices[0];
        let currentEnd = joinedPolylines[joinedPolylines.length - 1].vertices[joinedPolylines[joinedPolylines.length - 1].vertices.length - 1];
        let nextStart = polyline.vertices[0];
        let nextEnd = polyline.vertices[polyline.vertices.length - 1];
        if (currentStart, currentEnd, nextStart, nextEnd) {
          let [dcsns, dcsne, dcens, dcene] = [currentStart.distance(nextStart), currentStart.distance(nextEnd), currentEnd.distance(nextStart), currentEnd.distance(nextEnd)];
          let d = Math.min(dcsns, dcsne, dcens, dcene);
          if (d < minDistance) {
            [nextPolyline, queueIndex, minDistance] = [polyline, i, d];
            reverseFlag = (Math.min(dcsns, dcene) < Math.min(dcsne, dcens)) ? true : false;
            frontAppendFlag = (Math.min(dcsns, dcsne) < Math.min(dcens, dcene)) ? true : false;
          }
          done = false;
        }
      }
      if (minDistance < maxJoinDistance) {
        if (reverseFlag) nextPolyline.vertices.reverse();
        if (frontAppendFlag) joinedPolylines[joinedPolylines.length - 1].vertices = nextPolyline.vertices.concat(joinedPolylines[joinedPolylines.length - 1].vertices);
        else joinedPolylines[joinedPolylines.length - 1].vertices = joinedPolylines[joinedPolylines.length - 1].vertices.concat(nextPolyline.vertices);
      } else if (!done) {
        if (reverseFlag) nextPolyline.vertices.reverse();
        if (frontAppendFlag) joinedPolylines.reverse();
        joinedPolylines.push(nextPolyline);
      }
      if (done) break;
      else queue.splice(queueIndex, 1);
    }
    return joinedPolylines;
  }
}

Stitch.Math = {

  Random: class {
    constructor(hash = "0x") {
      if (hash === "0x") for (let i = 0; i < 64; i++) hash += Math.floor(Math.random() * 16).toString(16);
      this.useA = false;
      let sfc32 = function (uint128Hex) {
        let a = parseInt(uint128Hex.substring(0, 8), 16);
        let b = parseInt(uint128Hex.substring(8, 16), 16);
        let c = parseInt(uint128Hex.substring(16, 24), 16);
        let d = parseInt(uint128Hex.substring(24, 32), 16);
        return function () {
          a |= 0; b |= 0; c |= 0; d |= 0;
          let t = (((a + b) | 0) + d) | 0;
          d = (d + 1) | 0;
          a = b ^ (b >>> 9);
          b = (c + (c << 3)) | 0;
          c = (c << 21) | (c >>> 11);
          c = (c + t) | 0;
          return (t >>> 0) / 4294967296;
        };
      };
      this.prngA = new sfc32(hash.substring(2, 34));
      this.prngB = new sfc32(hash.substring(34, 66));
      for (let i = 0; i < 1e6; i += 2) { this.prngA(); this.prngB(); }
    }
    randomHash() {
      let hash = "0x";
      for (let i = 0; i < 64; i++) hash += Math.floor(Math.random() * 16).toString(16);
      return hash;
    }
    random_dec() { this.useA = !this.useA; return this.useA ? this.prngA() : this.prngB(); }
    random_num(a, b) { return a + (b - a) * this.random_dec(); }
    random_int(a, b) { return Math.floor(this.random_num(a, b + 1)); }
    random_bool(p) { return this.random_dec() < p; }
    random_choice(list) { return list[this.random_int(0, list.length - 1)]; }
  },

  Vector: class {
    constructor(x, y) { [this.x, this.y] = [x, y]; }
    static fromAngle(angle) { return new Stitch.Math.Vector(Math.cos(angle), Math.sin(angle)); }
    static min(v1, v2) { return new Stitch.Math.Vector(Math.min(v1.x, v2.x), Math.min(v1.y, v2.y)); }
    static max(v1, v2) { return new Stitch.Math.Vector(Math.max(v1.x, v2.x), Math.max(v1.y, v2.y)); }
    copy() { return new Stitch.Math.Vector(this.x, this.y); }
    add(v) { return new Stitch.Math.Vector(this.x + v.x, this.y + v.y); }
    subtract(v) { return new Stitch.Math.Vector(this.x - v.x, this.y - v.y); }
    multiply(s) { return new Stitch.Math.Vector(s * this.x, s * this.y); }
    product(v) { return new Stitch.Math.Vector(this.x * v.x, this.y * v.y); }
    divide(s) { return new Stitch.Math.Vector(this.x / s, this.y / s); }
    rotate(a) { return new Stitch.Math.Vector(this.x * Math.cos(a) - this.y * Math.sin(a), this.x * Math.sin(a) + this.y * Math.cos(a)); }
    lerp(v, w) { return new Stitch.Math.Vector((1 - w) * this.x + w * v.x, (1 - w) * this.y + w * v.y); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    cross(v) { return this.x * v.y - this.y * v.x; }
    squaredDistance(v) { return (this.x - v.x) * (this.x - v.x) + (this.y - v.y) * (this.y - v.y); }
    distance(v) { return Math.sqrt((this.x - v.x) * (this.x - v.x) + (this.y - v.y) * (this.y - v.y)); }
    heading() { return Math.atan2(this.y, this.x); }
    magnitude() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalized() { return (this.magnitude() > 0) ? this.divide(this.magnitude()) : Stitch.Math.Vector.fromAngle(0); }
    squaredLength() { return this.x * this.x + this.y * this.y; }
    length() { return Math.sqrt(this.squaredLength); }
  },

  Polyline: class {
    constructor(isClosed = false) { [this.vertices, this.isClosed] = [[], isClosed]; }
    static fromVectors(vectors, isClosed = false) {
      let polyline = new Stitch.Math.Polyline(isClosed);
      polyline.vertices = vectors;
      return polyline;
    }
    static fromArrays(arrays, isClosed = false) {
      let polyline = new Stitch.Math.Polyline(isClosed);
      for (let array of arrays) polyline.addVertex(array[0], array[1]);
      return polyline;
    }
    static fromObjects(objects, isClosed = false) {
      let polyline = new Stitch.Math.Polyline(isClosed);
      for (let object of objects) polyline.addVertex(object.x, object.y);
      return polyline;
    }
    addVertex(x, y) { this.vertices.push(new Stitch.Math.Vector(x, y)); }
    translate(x, y) {
      let translatePolyline = new Stitch.Math.Polyline(this.isClosed);
      for (let vertex of this.vertices) translatePolyline.addVertex(vertex.x + x, vertex.y + y);
      return translatePolyline;
    }
    getRounded(radius, stepAngle = 0.1) {
      let roundedPolyline = new Stitch.Math.Polyline(this.isClosed);
      if (!this.isClosed) roundedPolyline.addVertex(this.vertices[0].x, this.vertices[0].y);
      for (let i = this.isClosed ? 0 : 1; this.isClosed ? i < this.vertices.length : i < this.vertices.length - 1; i++) {
        let A = this.vertices[(i - 1 + this.vertices.length) % this.vertices.length].copy();
        let B = this.vertices[i].copy();
        let C = this.vertices[(i + 1) % this.vertices.length].copy();
        let BA = A.subtract(B);
        let BC = C.subtract(B);
        let BAnorm = BA.copy().normalized();
        let BCnorm = BC.copy().normalized();
        let sinA = -BAnorm.dot(BCnorm.copy().rotate(Math.PI / 2));
        let sinA90 = BAnorm.dot(BCnorm);
        let angle = Math.asin(sinA);
        let radDirection = 1;
        let drawDirection = false;
        if (sinA90 < 0) angle < 0 ? (angle += Math.PI) : ((angle += Math.PI), (radDirection = -1), (drawDirection = true));
        else angle > 0 ? ((radDirection = -1), (drawDirection = true)) : 0;
        let halfAngle = angle / 2;
        let lenOut = Math.abs((Math.cos(halfAngle) * radius) / Math.sin(halfAngle));
        let cRadius = 0;
        if (lenOut > Math.min(BA.magnitude() / 2, BC.magnitude() / 2)) {
          lenOut = Math.min(BA.magnitude() / 2, BC.magnitude() / 2);
          cRadius = Math.abs((lenOut * Math.sin(halfAngle)) / Math.cos(halfAngle));
        } else {
          cRadius = radius;
        }
        let x = B.x + BC.normalized().x * lenOut - BC.normalized().y * cRadius * radDirection;
        let y = B.y + BC.normalized().y * lenOut + BC.normalized().x * cRadius * radDirection;
        let fromAngle = ((((BA.heading() + (Math.PI / 2) * radDirection) + 6 * Math.PI) / (2 * Math.PI)) % 1) * 2 * Math.PI;
        let toAngle = ((((BC.heading() - (Math.PI / 2) * radDirection) + 6 * Math.PI) / (2 * Math.PI)) % 1) * 2 * Math.PI;
        if (Math.abs(toAngle - fromAngle) < 0.01) continue;
        if (!drawDirection) {
          if (fromAngle < toAngle) {
            for (let a = fromAngle; a < toAngle; a += stepAngle) {
              roundedPolyline.addVertex(cRadius * Math.cos(a) + x, cRadius * Math.sin(a) + y);
            }
          } else {
            for (let a = fromAngle; a < toAngle + 2 * Math.PI; a += stepAngle) {
              roundedPolyline.addVertex(cRadius * Math.cos(a) + x, cRadius * Math.sin(a) + y);
            }
          }
        } else {
          if (fromAngle > toAngle) {
            for (let a = fromAngle; a > toAngle; a -= stepAngle) {
              roundedPolyline.addVertex(cRadius * Math.cos(a) + x, cRadius * Math.sin(a) + y);
            }
          } else {
            for (let a = fromAngle; a > toAngle - 2 * Math.PI; a -= stepAngle) {
              roundedPolyline.addVertex(cRadius * Math.cos(a) + x, cRadius * Math.sin(a) + y);
            }
          }
        }
      }
      if (!this.isClosed) roundedPolyline.addVertex(this.vertices[this.vertices.length - 1].x, this.vertices[this.vertices.length - 1].y);
      return roundedPolyline;
    }
    getResampledBySpacing(spacing) {
      if (spacing <= 0 || this.vertices.length === 0) return this;
      let totalLength = 0;
      let lengths = [0];
      for (let i = 1; i < this.vertices.length; i++) {
        let length = this.vertices[i].distance(this.vertices[i - 1]);
        totalLength += length;
        lengths.push(lengths[lengths.length - 1] + length);
      }
      if (this.isClosed) {
        let length = this.vertices[this.vertices.length - 1].distance(this.vertices[0]);
        totalLength += length;
        lengths.push(totalLength);
      }
      let resampledPolyline = new Stitch.Math.Polyline(this.isClosed);
      let currentIndex = 1;
      let modifiedSpacing = totalLength / Math.floor(totalLength / spacing);
      for (let l = 0; l < totalLength - 0.5 * modifiedSpacing; l += modifiedSpacing) {
        while (lengths[currentIndex] < l) currentIndex++;
        let p = this.vertices[currentIndex - 1];
        let q = this.vertices[currentIndex % this.vertices.length];
        let t = (lengths[currentIndex] - l) / (lengths[currentIndex] - lengths[currentIndex - 1]);
        let v = q.lerp(p, t);
        resampledPolyline.addVertex(v.x, v.y);
      }
      if (!this.isClosed) resampledPolyline.addVertex(this.vertices[this.vertices.length - 1].x, this.vertices[this.vertices.length - 1].y);
      return resampledPolyline;
    }
    getOffset(distance) {
      let offsetPolyline = new Stitch.Math.Polyline(this.isClosed);
      for (let i = 0; i < this.vertices.length; i++) {
        let prev = this.vertices[(i - 1 + this.vertices.length) % this.vertices.length];
        let curr = this.vertices[i];
        let next = this.vertices[(i + 1) % this.vertices.length];
        if (prev.distance(curr) === 0 || curr.distance(next) === 0) continue;
        let np = prev.subtract(curr).normalized().multiply(distance).rotate(0.5 * Math.PI);
        let nq = curr.subtract(next).normalized().multiply(distance).rotate(0.5 * Math.PI);
        let [p1, p2, q1, q2] = [prev.add(np), curr.add(np), curr.add(nq), next.add(nq)];
        if (p2.distance(q1) === 0) { offsetPolyline.vertices.push(p2); continue; }
        let intersection = Stitch.Math.Utils.lineLineIntersection(p1, p2, q1, q2);
        if (intersection) offsetPolyline.vertices.push(intersection);
      }
      return offsetPolyline;
    }
    getSimplified(tolerance) { // https://gist.github.com/adammiller/826148?permalink_comment_id=317898#gistcomment-317898
      let squaredTolerance = tolerance * tolerance;
      let simplifyDP = function(v, j, k, mk) {
        if (k < j) return;
        let [maxi, maxd2, S] = [j, 0, [v[j], v[k]]];
        let u = S[1].subtract(S[0]);
        let cu = u.squaredLength();
        for (let i = j + 1; i < k; i++) {
          let [cw, dv2] = [v[i].subtract(S[0]).dot(u), 0];
          if (cw <= 0) dv2 = v[i].squaredDistance(S[0]);
          else if (cu <= cw) dv2 = v[i].squaredDistance(S[1]);
          else dv2 = v[i].squaredDistance(S[0].add(u.multiply(cw / cu)));
          if (dv2 <= maxd2) continue;
          [maxi, maxd2] = [i, dv2];
        }
        if (maxd2 > squaredTolerance) {
          mk[maxi] = 1;
          simplifyDP(v, j, maxi, mk);
          simplifyDP(v, maxi, k, mk);
        }
        return;
      }
      let [n, i, k, m, pv, vt, mk] = [this.vertices.length, 0, 0, 0, 0, [], []];
      vt[0] = this.vertices[0];
      for (i = k = 1, pv = 0; i < n; i++) {
        if (this.vertices[i].squaredDistance(this.vertices[pv]) < squaredTolerance) continue;
        vt[k++] = this.vertices[i];
        pv = i;
      }
      if (pv < n - 1) vt[k++] = this.vertices[n - 1];
      mk[0] = mk[k - 1] = 1;
      simplifyDP(vt, 0, k - 1, mk);
      let simplifiedPolyline = new Stitch.Math.Polyline(this.isClosed);
      for (i = m = 0; i < k; i++) if (mk[i]) simplifiedPolyline.vertices.push(vt[i]);
      return simplifiedPolyline;
    }
    getClosestVertex(position) {
      let [minDistance, result] = [Infinity, null];
      for (let i = 0; i < this.vertices.length; i++) {
        let distance = position.distance(this.vertices[i]);
        if (distance < minDistance) {
          minDistance = distance;
          result = this.vertices[i];
        }
      }
      return result;
    }
    getBoundingBox() {
      let boundingBox = { min: new Stitch.Math.Vector(Infinity, Infinity), max: new Stitch.Math.Vector(-Infinity, -Infinity) };
      for (let vertex of this.vertices) {
        if (vertex.x < boundingBox.min.x) boundingBox.min.x = vertex.x;
        else if (vertex.x > boundingBox.max.x) boundingBox.max.x = vertex.x;
        if (vertex.y < boundingBox.min.y) boundingBox.min.y = vertex.y;
        else if (vertex.y > boundingBox.max.y) boundingBox.max.y = vertex.y;
      }
      boundingBox.width = boundingBox.max.x - boundingBox.min.x;
      boundingBox.height = boundingBox.max.y - boundingBox.min.y;
      boundingBox.center = boundingBox.min.add(new Stitch.Math.Vector(0.5 * boundingBox.width, 0.5 * boundingBox.height));
      return boundingBox;
    }
    getArea() {
      let area = 0;
      for (let i = 0; i < this.vertices.length; i++) {
        let curr = this.vertices[i];
        let next = this.vertices[(i + 1) % this.vertices.length];
        area += curr.x * next.y - next.x * curr.y;
      }
      return 0.5 * Math.abs(area);
    }
    getCentroid() {
      let centroid = new Stitch.Math.Vector(0, 0);
      for (let i = 0; i < this.vertices.length; i++) {
        let curr = this.vertices[i];
        let next = this.vertices[(i + 1) % this.vertices.length];
        centroid.x += (curr.x + next.x) * (curr.x * next.y - next.x * curr.y);
        centroid.y += (curr.y + next.y) * (curr.x * next.y - next.x * curr.y);
      }
      return centroid.multiply(1 / 6 / this.getArea());
    }
    containsPoint(point) {
      let contains = false;
      for (let i = 0, j = this.vertices.length - 1; i < this.vertices.length; j = i++) {
        if (
          (this.vertices[i].y > point.y) !== (this.vertices[j].y > point.y) &&
          (point.x < (this.vertices[j].x - this.vertices[i].x) * (point.y - this.vertices[i].y) / (this.vertices[j].y - this.vertices[i].y) + this.vertices[i].x)) {
          contains = !contains;
        }
      }
      return contains;
    }
  },

  BoundingBox: class {
    constructor(cx, cy, hw, hh) { [this.cx, this.cy, this.hw, this.hh] = [cx, cy, hw, hh]; }
    contains(x, y) {
      return (
        x >= this.cx - this.hw &&
        x < this.cx + this.hw &&
        y >= this.cy - this.hh &&
        y < this.cy + this.hh
      );
    }
    intersects(bb) {
      return !(
        bb.cx - bb.hw > this.cx + this.hw ||
        bb.cx + bb.hw < this.cx - this.hw ||
        bb.cy - bb.hh > this.cy + this.hh ||
        bb.cy + bb.hh < this.cy - this.hh
      );
    }
  },

  Quadtree: class {
    constructor(boundingBox, capacity) {
      this.boundingBox = boundingBox;
      this.capacity = capacity;
      this.points = [];
      this.divided = false;
    }
    subdivide() {
      let [x, y, w, h] = [this.boundingBox.cx, this.boundingBox.cy, this.boundingBox.hw, this.boundingBox.hh];
      this.ne = new Stitch.Math.Quadtree(new Stitch.Math.BoundingBox(x + 0.5 * w, y - 0.5 * h, 0.5 * w, 0.5 * h), this.capacity);
      this.nw = new Stitch.Math.Quadtree(new Stitch.Math.BoundingBox(x - 0.5 * w, y - 0.5 * h, 0.5 * w, 0.5 * h), this.capacity);
      this.se = new Stitch.Math.Quadtree(new Stitch.Math.BoundingBox(x + 0.5 * w, y + 0.5 * h, 0.5 * w, 0.5 * h), this.capacity);
      this.sw = new Stitch.Math.Quadtree(new Stitch.Math.BoundingBox(x - 0.5 * w, y + 0.5 * h, 0.5 * w, 0.5 * h), this.capacity);
      this.divided = true;
    }
    insert(x, y, object = {}) {
      if (!this.boundingBox.contains(x, y)) return false;
      if (this.points.length < this.capacity) {
        this.points.push({ x, y, object });
        return true;
      }
      if (!this.divided) this.subdivide();
      if (this.ne.insert(x, y, object)) return true;
      if (this.nw.insert(x, y, object)) return true;
      if (this.se.insert(x, y, object)) return true;
      if (this.sw.insert(x, y, object)) return true;
      return false;
    }
    query(boundingBox, result = []) {
      if (!this.boundingBox.intersects(boundingBox)) return result;
      for (let point of this.points) {
        if (boundingBox.contains(point.x, point.y)) result.push(point);
      }
      if (this.divided) {
        this.nw.query(boundingBox, result);
        this.ne.query(boundingBox, result);
        this.sw.query(boundingBox, result);
        this.se.query(boundingBox, result);
      }
      return result;
    }
  },

  NewGraph: class {
    constructor() {
      this.vertices = {};
      this.adjacency = {};
      this.edges = {};
    }
    copy() {
      let copy = new Stitch.Math.NewGraph();
      copy.vertices = structuredClone(this.vertices);
      copy.adjacency = structuredClone(this.adjacency);
      copy.edges = structuredClone(this.edges);
      return copy;
    }
    addVertex(id, properties = {}) {
      this.vertices[id] = properties;
      this.adjacency[id] = [];
    }
    addEdge(id1, id2, properties = {}) {
      let edgeId = Object.keys(this.edges).length;
      this.adjacency[id1].push({ id: edgeId, to: id2 });
      this.adjacency[id2].push({ id: edgeId, to: id1 });
      this.edges[edgeId] = { from: id1, to: id2, properties };
    }
    removeEdge(edgeId) {
      let edge = this.edges[edgeId];
      for (let i = 0; i < this.adjacency[edge.from].length; i++) {
        if (this.adjacency[edge.from][i].id === edgeId) {
          this.adjacency[edge.from].splice(i, 1);
          break;
        }
      }
      for (let i = 0; i < this.adjacency[edge.to].length; i++) {
        if (this.adjacency[edge.to][i].id === edgeId) {
          this.adjacency[edge.to].splice(i, 1);
          break;
        }
      }
      delete this.edges[edgeId];
    }
  },

  Graph: class {
    constructor() {
        this.vertices = [];
        this.edges = {};
    }
    addVertex(vertex) {
        this.vertices.push(vertex.toString());
        this.edges[vertex.toString()] = [];
    }
    addEdge(vertex1, vertex2, weight = 1) {
      this.edges[vertex1.toString()].push({vertex: vertex2.toString(), weight: weight});
      this.edges[vertex2.toString()].push({vertex: vertex1.toString(), weight: weight});
    }
    removeEdge(vertex1, vertex2) {
      let index12 = this.edges[vertex1.toString()].findIndex((n) => n.vertex === vertex2.toString());
      let index21 = this.edges[vertex2.toString()].findIndex((n) => n.vertex === vertex1.toString());
      if (index12 > -1) this.edges[vertex1.toString()].splice(index12, 1);
      if (index21 > -1) this.edges[vertex2.toString()].splice(index21, 1);
    }
    findEdgeIndex(from, to) { return this.edges[from.toString()].findIndex((n) => n.vertex === to.toString()); }
    copy() {
      let g = new Stitch.Math.Graph();
      for (let vertex of this.vertices) g.addVertex(vertex);
      for (let i = 0; i < this.vertices.length; i++) {
        let vertex = this.vertices[i];
        for (let neighbor of this.edges[vertex]) {
          if (i < this.vertices.indexOf(neighbor.vertex)) {
            g.addEdge(vertex, neighbor.vertex);
          }
        }
      }
      return g;
    }
    tsp(startingVertex = this.vertices[0]) {
      let g = new Stitch.Math.Graph();
      for (let vertex of this.vertices) g.addVertex(vertex);
      let shortestPaths = Object.fromEntries(this.vertices.map(v => [v, {}]));
      for (let i = 0; i < this.vertices.length; i++) {
        for (let j = i + 1; j < this.vertices.length; j++) {
          let [path, weight] = [this.dijkstra(this.vertices[i], this.vertices[j]), 0];
          for (let k = 1; k < path.length; k++) weight += this.edges[path[k]][this.findEdgeIndex(path[k], path[k - 1])].weight;
          shortestPaths[this.vertices[i]][this.vertices[j]] = path.slice(1);
          shortestPaths[this.vertices[j]][this.vertices[i]] = path.slice().reverse().slice(1);
          g.addEdge(this.vertices[i], this.vertices[j], weight);
        }
      }
      let verticesCount = g.vertices.length;
      let visited = {};
      let currentVertex = startingVertex;
      let shortestPath = [startingVertex];
      let totalDistance = 0;
      visited[startingVertex] = true;
      for (let i = 0; i < verticesCount - 1; i++) {
        let minDistance = Infinity;
        let nearestVertex = null;
        for (let j = 0; j < g.edges[currentVertex].length; j++) {
          let neighbor = g.edges[currentVertex][j];
          if (!visited[neighbor.vertex] && neighbor.weight < minDistance) {
            nearestVertex = neighbor.vertex;
            minDistance = neighbor.weight;
          }
        }
        shortestPath = shortestPath.concat(shortestPaths[currentVertex][nearestVertex]);
        visited[nearestVertex] = true;
        totalDistance += minDistance;
        currentVertex = nearestVertex;
      }
      return { path: shortestPath, distance: totalDistance };
    }
    getEulerTour() {
      let g = this.routeInspection();
      let u = this.vertices[0];
      for (let vertex of g.vertices) {
        if (Object.keys(g.edges[vertex]).length % 2 === 1) {
          u = vertex;
          break;
        }
      }
      let path = [u];
      g.eulerTourUtil(u, path);
      return path;
    }
    eulerTourUtil(u, path) {
      for (let neighbor of this.edges[u]) {
        if (this.isValidNextEdge(u, neighbor.vertex)) {
          path.push(neighbor.vertex);
          this.removeEdge(u, neighbor.vertex);
          this.eulerTourUtil(neighbor.vertex, path);
        }
      }
    }
    isValidNextEdge(u, v) {
      if (this.edges[u].length === 1) return true;
      let visited = {};
      for (let vertex of this.vertices) visited[vertex] = false;
      let count1 = this.DFSCount(u, visited);
      this.removeEdge(u, v);
      for (let vertex of this.vertices) visited[vertex] = false;
      let count2 = this.DFSCount(u, visited);
      this.addEdge(u, v);
      return count1 > count2 ? false : true;
    }
    DFSCount(v, visited) {
      visited[v] = true;
      let count = 1;
      for (let neighbor of this.edges[v]) {
        if (!visited[neighbor.vertex]) {
          count += this.DFSCount(neighbor.vertex, visited);
        }
      }
      return count;
    }
    routeInspection() {
      let oddDegreeVertices = [];
      for (let vertex of this.vertices) {
        if (this.edges[vertex].length % 2 === 1) oddDegreeVertices.push(vertex);
      }
      if (oddDegreeVertices.length === 0) {
        return this.copy();
      } else {
        let g = this.copy();
        for (let i = 0; i < oddDegreeVertices.length; i += 2) {
          let path = g.dijkstra(oddDegreeVertices[i], oddDegreeVertices[i + 1]);
          for (let j = 0; j < path.length - 1; j++) {
            g.addEdge(path[j], path[j + 1]);
          }
        }
        return g;
      }
    }
    dijkstra(startNode, endNode) {
      let times = {};
      let backtrace = {};
      this.priorityQueue = [];
      for (let vertex of this.vertices) {
        if (vertex === startNode) times[vertex] = 0;
        else times[vertex] = Infinity;
      }
      this.priorityQueueEnqueue([startNode, 0]);
      while (this.priorityQueue.length !== 0) {
        let shortestStep = this.priorityQueueDequeue();
        let currentNode = shortestStep[0];
        for (let neighbor of this.edges[currentNode]) {
          let time = times[currentNode] + 1;
          if (time < times[neighbor.vertex]) {
            times[neighbor.vertex] = time;
            backtrace[neighbor.vertex] = currentNode;
            this.priorityQueueEnqueue([neighbor.vertex, time]);
          }
        }
      }
      let path = [endNode];
      let lastStep = endNode;
      while (lastStep !== startNode) {
        path.unshift(backtrace[lastStep]);
        lastStep = backtrace[lastStep];
      }
      return path;
    }
    priorityQueueEnqueue(element) {
      if (this.priorityQueue.length === 0) this.priorityQueue.push(element);
      else {
        let added = false;
        for (let i = 1; i <= this.priorityQueue.length; i++) {
          if (element[1] < this.priorityQueue[i - 1][1]) {
            this.priorityQueue.splice(i - 1, 0, element);
            added = true;
            break;
          }
        }
        if (!added) this.priorityQueue.push(element);
      }
    }
    priorityQueueDequeue() {
      let value = this.priorityQueue.shift();
      return value;
    }

    ccDfsUtil(v, visited, component) {
      visited[v] = true;
      component.push(v);
      let neighbors = this.edges[v];
      for (let i = 0; i < neighbors.length; i++) {
        let neighbor = neighbors[i];
        if (!visited[neighbor.vertex]) {
          this.ccDfsUtil(neighbor.vertex, visited, component);
        }
      }
    }
    connectedComponentsDfs(v, visited, component) {
      visited[v] = true;
      component.push(v);
      let neighbors = this.edges[v];
      for (let i = 0; i < neighbors.length; i++) {
        let neighbor = neighbors[i];
        if (!visited[neighbor.vertex]) {
          this.connectedComponentsDfs(neighbor.vertex, visited, component);
        }
      }
    }
    connectedComponents() {
      let visited = {};
      for (let vertex of this.vertices) visited[vertex] = false;
      let components = [];
      for (let v of this.vertices) {
        if (!visited[v]) {
          let component = [];
          this.connectedComponentsDfs(v, visited, component);
          components.push(component);
        }
      }
      return components;
    }
  },

  Utils: {
    constrain: function(value, low, high) { return Math.max(Math.min(value, high), low); },
    map: function(value, a, b, c, d, clamp = false) {
      let mapped = (value - a) / (b - a) * (d - c) + c;
      if (!clamp) return mapped;
      if (c < d) return Stitch.Math.Utils.constrain(mapped, c, d);
      else return Stitch.Math.Utils.constrain(mapped, d, c);
    },
    isPointLeft: function(start, end, point) { return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x) > 0 },
    lineSegmentIntersection: function(p1, p2, q1, q2) {
      let s1 = p2.subtract(p1);
      let s2 = q2.subtract(q1);
      let d = -s2.x * s1.y + s1.x * s2.y;
      let s = (-s1.y * (p1.x - q1.x) + s1.x * (p1.y - q1.y)) / d;
      let t = (s2.x * (p1.y - q1.y) - s2.y * (p1.x - q1.x)) / d;
      if (s >= 0 && s <= 1 && t >= 0 && t <= 1) return new Stitch.Math.Vector(p1.x + (t * s1.x), p1.y + (t * s1.y));
      else return null;
    },
    getAngleBetween: function(a, b, c) {
      let v1 = b.subtract(a).normalized();
      let v2 = c.subtract(b).normalized();
      return Math.atan2(v2.y * v1.x - v2.x * v1.y, v2.x * v1.x + v2.y * v1.y) + Math.PI;
    },
    lineLineIntersection: function(p1, p2, q1, q2) {
      let denominator = ((q2.y - q1.y) * (p2.x - p1.x) - (q2.x - q1.x) * (p2.y - p1.y));
      if (denominator === 0) return false;
      let ua = ((q2.x - q1.x) * (p1.y - q1.y) - (q2.y - q1.y) * (p1.x - q1.x)) / denominator;
      let ub = ((p2.x - p1.x) * (p1.y - q1.y) - (p2.y - p1.y) * (p1.x - q1.x)) / denominator;
      return p1.add(p2.subtract(p1).multiply(ua));
    },
    sdfLine: function(p1, p2, v) {
      let [m, b] = [(p2.y - p1.y) / (p2.x - p1.x), p1.y - m * p1.x];
      return Math.min(p1.distance(v), p2.distance(v), Math.abs(v.y - m * v.x - b) / Math.sqrt(m * m + 1));
    },
    distance(x1, y1, x2, y2) { return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)); }
  }

};

// heavily inspired by csg2d.js(https://github.com/come/csg2d.js)
Stitch.CSG = {
  Shape: class {
    constructor(segments = null) { this.segments = segments ?? []; }
    static fromPolylines(polylines) {
      let shape = new Stitch.CSG.Shape();
      for (let polyline of polylines) {
        for (let i = 0; i < polyline.vertices.length; i++) {
          shape.segments.push(new Stitch.CSG.Segment([polyline.vertices[i].copy(), polyline.vertices[(i + 1) % polyline.vertices.length].copy()]));
        }
      }
      return shape;
    }
    clone() { return new Stitch.CSG.Shape(this.segments.map(function(p) { return p.clone(); })); }
    toPolylines(epsilon = 0.1) {
      var polylines = [];
      var list = this.segments.slice();
      var findNext = function(extremum) {
        let minVertex = { index: 0, distance: Infinity };
        for (var i = 0; i < list.length; i++) {
          let distance = list[i].vertices[0].squaredDistance(extremum);
          if (distance < minVertex.distance) {
            minVertex.index = i;
            minVertex.distance = distance;
          }
        }
        if (minVertex.distance < epsilon) {
          var result = list[minVertex.index].clone();
          list.splice(minVertex.index, 1);
          return result;
        }
        return false;
      }
      var currentIndex = 0;
      while (list.length > 0) {
        polylines[currentIndex] = polylines[currentIndex] || new Stitch.Math.Polyline(true);
        if (polylines[currentIndex].vertices.length == 0) {
          polylines[currentIndex].vertices.push(list[0].vertices[0]);
          polylines[currentIndex].vertices.push(list[0].vertices[1]);
          list.splice(0, 1);
        }
        var next = findNext(polylines[currentIndex].vertices[polylines[currentIndex].vertices.length - 1]);
        if (next) {
          polylines[currentIndex].vertices.push(next.vertices[1]);
        } else {
          currentIndex++;
        }
      }

      // determine the parent/child structure
      let nestedPolylines = [];
      for (let i = 0; i < polylines.length; i++) nestedPolylines.push({ polyline: polylines[i], area: polylines[i].getArea(), parent: null, children: [] });
      nestedPolylines.sort((a, b) => { return a.area > b.area ? 1 : -1; });
      for (let i = 0; i < nestedPolylines.length; i++) {
        let minParentArea = Infinity;
        let minParent = null;
        for (let j = i + 1; j < nestedPolylines.length; j++) {
          if (nestedPolylines[j].polyline.containsPoint(nestedPolylines[i].polyline.vertices[0])) {
            if (nestedPolylines[j].area < minParentArea) {
              minParentArea = nestedPolylines[j].area;
              minParent = nestedPolylines[j];
              nestedPolylines[i].parent = nestedPolylines[j];
            }
          }
        }
        if (minParent !== null) minParent.children.push(nestedPolylines[i]);
      }
      let structuredPolylines = [];
      while (nestedPolylines.length > 0) {
        let shapes = nestedPolylines.filter(x => x.parent === null);
        for (let shape of shapes) {
          structuredPolylines.push({ polyline: shape.polyline, contours: shape.children.map(x => x.polyline) });
          nestedPolylines = nestedPolylines.filter(x => x !== shape && x.parent !== shape);
          for (let nestedPolyline of nestedPolylines) {
            for (let child of shape.children) {
              if (nestedPolyline.parent === child) {
                nestedPolyline.parent = null;
              }
            }
          }
        }
      }

      return structuredPolylines;
    }
    union(shape) {
      var a = new Stitch.CSG.Node(this.clone().segments);
      var b = new Stitch.CSG.Node(shape.clone().segments);
      a.invert(); b.clipTo(a); b.invert(); a.clipTo(b); b.clipTo(a); a.build(b.allSegments()); a.invert();
      return new Stitch.CSG.Shape(a.allSegments());
    }
    subtract(shape) {
      var b = new Stitch.CSG.Node(this.clone().segments);
      var a = new Stitch.CSG.Node(shape.clone().segments);
      a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.allSegments()); a.invert();
      return new Stitch.CSG.Shape(a.allSegments()).inverse();
    }
    intersect(shape) {
      var a = new Stitch.CSG.Node(this.clone().segments);
      var b = new Stitch.CSG.Node(shape.clone().segments);
      a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.allSegments());
      return new Stitch.CSG.Shape(a.allSegments());
    }
    inverse() {
      var shape = this.clone();
      shape.segments.map(function(p) { p.flip(); });
      return shape;
    }
  },
  Line: class {
    constructor(origin, direction) {
      this.origin = origin;
      this.direction = direction;
      this.normal = new Stitch.Math.Vector(this.direction.y, -this.direction.x);
      this.EPSILON = 1e-5;
    }
    static fromPoints(a, b) { return new Stitch.CSG.Line(a, b.subtract(a).normalized()); }
    clone() { return new Stitch.CSG.Line(this.origin.copy(), this.direction.copy()); }
    flip() {
      this.direction = this.direction.multiply(-1);
      this.normal = this.normal.multiply(-1);
    }
    splitSegment(segment, colinearRight, colinearLeft, right, left) {
      var COLINEAR = 0;
      var RIGHT = 1;
      var LEFT = 2;
      var SPANNING = 3;

      // Classify each point as well as the entire polygon into one of the above
      // four classes.
      var segmentType = 0;
      var types = [];
      for (var i = 0; i < segment.vertices.length; i++) {
        var t = this.normal.dot(segment.vertices[i].subtract(this.origin));
        var type = (t < -this.EPSILON) ? RIGHT : (t > this.EPSILON) ? LEFT : COLINEAR;
        segmentType |= type;
        types.push(type);
      }

      // Put the segment in the correct list, splitting it when necessary.
      switch (segmentType) {
        case COLINEAR:
          if (t != 0) {
            (t > 0 ? colinearRight : colinearLeft).push(segment);
          } else {
            if (segment.line.origin.x < this.origin.x) {
              colinearLeft.push(segment)
            } else {
              colinearRight.push(segment)
            }
          }
          break;
        case RIGHT:
          right.push(segment);
          break;
        case LEFT:
          left.push(segment);
          break;
        case SPANNING: //TODO
          var r = [],
            l = [];
          var ti = types[0],
            tj = types[1];
          var vi = segment.vertices[0],
            vj = segment.vertices[1];
          if (ti == RIGHT && tj == RIGHT) {
            r.push(vi);
            r.push(vj);
          }
          if (ti == LEFT && tj == LEFT) {
            l.push(vi);
            l.push(vj);
          }
          if (ti == RIGHT && tj == LEFT) {
            var t = (this.normal.dot(this.origin.subtract(vi))) / this.normal.dot(vj.subtract(vi));
            var v = vi.lerp(vj, t);
            r.push(vi);
            r.push(v);
            l.push(v.copy());
            l.push(vj);
          }
          if (ti == LEFT && tj == RIGHT) {
            var t = (this.normal.dot(this.origin.subtract(vi))) / this.normal.dot(vj.subtract(vi));
            var v = vi.lerp(vj, t);
            l.push(vi);
            l.push(v);
            r.push(v.copy());
            r.push(vj);
          }
          if (r.length >= 2) {
            right.push(new Stitch.CSG.Segment(r, segment.shared));
          }

          if (l.length >= 2) {
            left.push(new Stitch.CSG.Segment(l, segment.shared));
          }
          break;
      }
    }
  },
  Segment: class {
    constructor(vertices, shared) {
      this.vertices = vertices;
      this.shared = shared;
      this.line = Stitch.CSG.Line.fromPoints(vertices[0], vertices[1]);
    }
    clone() {
      var vertices = this.vertices.map(function(v) { return v.copy(); });
      return new Stitch.CSG.Segment(vertices, this.shared);
    }
    flip() {
      this.vertices.reverse().map(function(v) { v.multiply(-1); });
      this.line.flip();
    }
  },
  Node: class {
    constructor(segments) {
      this.line = null;
      this.right = null;
      this.left = null;
      this.segments = [];
      if (segments) this.build(segments);
    }
    clone() {
      var node = new Stitch.CSG.Node();
      node.line = this.line && this.line.clone();
      node.right = this.right && this.right.clone();
      node.left = this.left && this.left.clone();
      note.segments = this.segments.map(function(p) { return p.clone(); });
      return node;
    }
    invert() {
      for (var i = 0; i < this.segments.length; i++) this.segments[i].flip();
      this.line.flip();
      if (this.right) this.right.invert();
      if (this.left) this.left.invert();
      var temp = this.right;
      this.right = this.left;
      this.left = temp;
    }
    clipSegments(segments) {
      if (!this.line) return segments.slice();
      var right = [], left = [];
      for (var i = 0; i < segments.length; i++) {
        this.line.splitSegment(segments[i], right, left, right, left);
      }
      if (this.right) right = this.right.clipSegments(right);
      if (this.left) left = this.left.clipSegments(left);
      else left = [];
      return right.concat(left);
    }
    clipTo(bsp) {
      this.segments = bsp.clipSegments(this.segments);
      if (this.right) this.right.clipTo(bsp);
      if (this.left) this.left.clipTo(bsp);
    }
    allSegments() {
      var segments = this.segments.slice();
      if (this.right) segments = segments.concat(this.right.allSegments());
      if (this.left) segments = segments.concat(this.left.allSegments());
      return segments;
    }
    build(segments) {
      if (!segments.length) return;
      if (!this.line) this.line = segments[0].line.clone();
      var right = [], left = [];
      for (var i = 0; i < segments.length; i++) {
        this.line.splitSegment(segments[i], this.segments, this.segments, right, left);
      }
      if (right.length) {
        if (!this.right) this.right = new Stitch.CSG.Node();
        this.right.build(right);
      }
      if (left.length) {
        if (!this.left) this.left = new Stitch.CSG.Node();
        this.left.build(left);
      }
    }
  }
};

Stitch.IO = {
  write: function(pattern, widthMM, heightMM, filename, minimumPathLength = 0, maximumJoinDistance = 0, maximumStitchesPerSquareMm = 0) {
    let stitches = pattern.getStitches(widthMM, heightMM, 1, minimumPathLength, maximumJoinDistance, maximumStitchesPerSquareMm);
    // center the pattern and convert units to millimeters
    for (let i = 0; i < stitches.threads.length; i++) {
      for (let j = 0; j < stitches.threads[i].runs.length; j++) {
        for (let k = 0; k < stitches.threads[i].runs[j].length; k++) {
          stitches.threads[i].runs[j][k] = stitches.threads[i].runs[j][k].subtract(new Stitch.Math.Vector(0.5 * stitches.dimensions.width * stitches.pixelsPerUnit, 0.5 * stitches.dimensions.height * stitches.pixelsPerUnit));
          stitches.threads[i].runs[j][k] = stitches.threads[i].runs[j][k].divide(stitches.pixelsPerUnit);
        }
      }
    }
    stitches.dimensions.width /= stitches.pixelsPerUnit;
    stitches.dimensions.height /= stitches.pixelsPerUnit;
    // run the appropriate writer for the given extension
    let writer;
    switch(filename.toLowerCase().split(".")[1]) {
      case 'dst':
        writer = new Stitch.IO.Writers.DST();
        writer.write(stitches, filename);
        break;
      case 'pes':
        writer = new Stitch.IO.Writers.PES();
        writer.write(stitches, filename);
        break;
      default:
        alert(`[Stitch.IO.write] Unsupported file extension: ${filename}`);
    }
  },
  Writers: {
    Utils: {
      padLeft: function(string, length, char = " ") { return string.substring(0, length).padStart(length, char); },
      padRight: function(string, length, char = " ") { return string.substring(0, length).padEnd(length, char); },
      integerToBinary: function(value, bytes, endien = 'L') {
        let byteArray = new Uint8Array(bytes);
        for (let i = 0; i < bytes; i++) byteArray[i] = (value >> (i * 8)) & 0xFF;
        if (endien === 'B') byteArray.reverse();
        else if (endien !== 'L') alert(`[Stitch.IO.Utils.integerToBinary] Unexpected endien value: ${endien}`);
        return byteArray;
      },
      saveData: function(data, filename) {
        let blob = new Blob(data, {type: "application/octet-stream"});
        let url = window.URL.createObjectURL(blob);
        let a = document.createElement("a");
        document.body.appendChild(a);
        a.style = "display: none";
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    },
    DST: class {
      constructor() { this.data = []; }
      bit(b) { return 1 << b; }
      encodeRecord(x, y, flag) {
        y = -y;
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        switch (flag) {
          case 'JUMP':
          case 'SEQUIN_EJECT':
            b2 += this.bit(7);
            // fallthrough
          case 'STITCH':
            b2 += this.bit(0);
            b2 += this.bit(1);
            if (x > 40) { b2 += this.bit(2); x -= 81; }
            if (x < -40) { b2 += this.bit(3); x += 81; }
            if (x > 13) { b1 += this.bit(2); x -= 27; }
            if (x < -13) { b1 += this.bit(3); x += 27; }
            if (x > 4) { b0 += this.bit(2); x -= 9; }
            if (x < -4) { b0 += this.bit(3); x += 9; }
            if (x > 1) { b1 += this.bit(0); x -= 3; }
            if (x < -1) { b1 += this.bit(1); x += 3; }
            if (x > 0) { b0 += this.bit(0); x -= 1; }
            if (x < 0) { b0 += this.bit(1); x += 1; }
            if (x != 0) console.log("[Stitch Writer] Error: Write exceeded possible distance.");
            if (y > 40) { b2 += this.bit(5); y -= 81; }
            if (y < -40) { b2 += this.bit(4); y += 81; }
            if (y > 13) { b1 += this.bit(5); y -= 27; }
            if (y < -13) { b1 += this.bit(4); y += 27; }
            if (y > 4) { b0 += this.bit(5); y -= 9; }
            if (y < -4) { b0 += this.bit(4); y += 9; }
            if (y > 1) { b1 += this.bit(7); y -= 3; }
            if (y < -1) { b1 += this.bit(6); y += 3; }
            if (y > 0) { b0 += this.bit(7); y -= 1; }
            if (y < 0) { b0 += this.bit(6); y += 1; }
            if (y != 0) console.log("[Stitch Writer] Error: Write exceeded possible distance.");
            break;
          case 'COLOR_CHANGE':
            b2 = 0b11000011;
            break;
          case 'STOP':
            b2 = 0b11110011;
            break;
          case 'END':
            b2 = 0b11110011;
            break;
          case 'SEQUIN_MODE':
            b2 = 0b01000011;
            break;
          default:
            console.log(`Unexpected flag: ${flag}`);
        }
        return new Uint8Array([b0, b1, b2]);
      }
      write(stitches, filename) {
        this.data = [];
        this.data.push(`LA:${Stitch.IO.Writers.Utils.padRight(filename.split(".")[0], 16, " ")}\r`);
        this.data.push(`ST:${Stitch.IO.Writers.Utils.padLeft(stitches.stitchCount.toString(), 7, " ")}\r`);
        this.data.push(`CO:${Stitch.IO.Writers.Utils.padLeft((stitches.threads.length - 1).toString(), 3, " ")}\r`);
        this.data.push(`+X:${Stitch.IO.Writers.Utils.padLeft(Math.ceil(0.1 * 0.5 * stitches.dimensions.width * stitches.pixelsPerUnit).toString(), 5, " ")}\r`);
        this.data.push(`-X:${Stitch.IO.Writers.Utils.padLeft(Math.ceil(0.1 * 0.5 * stitches.dimensions.width * stitches.pixelsPerUnit).toString(), 5, " ")}\r`);
        this.data.push(`+Y:${Stitch.IO.Writers.Utils.padLeft(Math.ceil(0.1 * 0.5 * stitches.dimensions.height * stitches.pixelsPerUnit).toString(), 5, " ")}\r`);
        this.data.push(`-Y:${Stitch.IO.Writers.Utils.padLeft(Math.ceil(0.1 * 0.5 * stitches.dimensions.height * stitches.pixelsPerUnit).toString(), 5, " ")}\r`);
        this.data.push('AX:+    0\r');
        this.data.push('AY:+    0\r');
        this.data.push('MX:+    0\r');
        this.data.push('MY:+    0\r');
        this.data.push('PD:******\r');
        this.data.push(new Uint8Array([0x1a]));
        this.data.push(" ".repeat(387));
        this.encodeStitches(stitches);
        this.data.push(this.encodeRecord(0, 0, 'END'));
        Stitch.IO.Writers.Utils.saveData(this.data, filename);
      }
      encodeStitches(stitches) {
        let xx = 0;
        let yy = 0;
        for (let i = 0; i < stitches.threads.length; i++) {
          if (i > 0) this.data.push(this.encodeRecord(0, 0, 'COLOR_CHANGE'));
          for (let j = 0; j < stitches.threads[i].runs.length; j++) {
            if (j > 0) this.data.push(this.encodeRecord(2, 2, 'JUMP'), this.encodeRecord(-4, -4, 'JUMP'), this.encodeRecord(2, 2, 'JUMP')); // trim
            for (let k = 0; k < stitches.threads[i].runs[j].length; k++) {
              let stitch = stitches.threads[i].runs[j][k];
              let x = 10 * stitch.x;
              let y = 10 * stitch.y;
              let dx = Math.round(x - xx);
              let dy = Math.round(y - yy);
              xx += dx;
              yy += dy;
              if (Math.abs(dx) >= 121 || Math.abs(dy) >= 121) {
                let steps = Math.max(Math.abs(0.01 * dx), Math.abs(0.01 * dy)) + 1;
                let inc = 1 / steps;
                let accx = 0;
                let accy = 0;
                let ddx = Math.round(dx * inc);
                let ddy = Math.round(dy * inc);
                for (let n = 0; n < steps - 1; n++) {
                  this.data.push(this.encodeRecord(ddx, ddy, k === 0 ? 'JUMP' : 'STITCH'));
                  accx += ddx;
                  accy += ddy;
                }
                dx -= accx;
                dy -= accy;
              }
              this.data.push(this.encodeRecord(dx, dy, 'STITCH'));
            }
          }
        }
      }
    },
    PES: class { // Truncated PES v.1 - https://edutechwiki.unige.ch/en/Embroidery_format_PES
      constructor() { this.data = []; }
      writeString(string) { this.data.push(string); }
      writeBytes(bytes) { this.data.push(bytes); }
      writeInt(value, bytes, endien = 'L') { this.data.push(Stitch.IO.Writers.Utils.integerToBinary(value, bytes, endien)); }
      write(stitchPattern, filename) {
        this.data = [];
        this.writeString('#PES0001');
        this.writeBytes(new Uint8Array([0x16]));
        this.writeBytes(new Uint8Array(new Array(13).fill(0x00)));
        this.writeString(`LA:${Stitch.IO.Writers.Utils.padRight(filename.split(".")[0].substring(0, 8), 16, " ")}\r`);
        this.writeBytes(new Uint8Array(new Array(12).fill(0x20)));
        this.writeBytes(new Uint8Array([0xFF]));
        this.writeBytes(new Uint8Array([0x00]));
        this.writeBytes(new Uint8Array([0x06]));
        this.writeBytes(new Uint8Array([0x26]));
        this.writeBytes(new Uint8Array(new Array(12).fill(0x20)));
        this.writeInt(stitchPattern.threads.length - 1, 1, 'L');
        // todo: implemenet color matching
        let colorList = [0x05, 0x38, 0x15];
        for (let i = 0; i < stitchPattern.threads.length; i++) {
          this.writeInt(colorList[i % 3], 1, 'L');
        }
        this.writeBytes(new Uint8Array(new Array(463 - stitchPattern.threads.length).fill(0x20)));
        this.writeBytes(new Uint8Array([0x00, 0x00]));
        let graphicsOffsetValue = new Uint8Array(3);
        this.writeBytes(graphicsOffsetValue);
        this.writeBytes(new Uint8Array([0x31]));
        this.writeBytes(new Uint8Array([0xFF]));
        this.writeBytes(new Uint8Array([0xF0]));
        this.writeInt(2 * Math.ceil(10 * 0.5 * stitchPattern.dimensions.width * stitchPattern.pixelsPerUnit), 2, 'L');
        this.writeInt(2 * Math.ceil(10 * 0.5 * stitchPattern.dimensions.height * stitchPattern.pixelsPerUnit), 2, 'L');
        this.writeBytes(new Uint8Array([0xE0, 0x01]));
        this.writeBytes(new Uint8Array([0xB0, 0x01]));
        this.writeInt(0x9000 + Math.ceil(10 * 0.5 * stitchPattern.dimensions.width * stitchPattern.pixelsPerUnit), 2, 'B');
        this.writeInt(0x9000 + Math.ceil(10 * 0.5 * stitchPattern.dimensions.height * stitchPattern.pixelsPerUnit), 2, 'B');
        let stitchEncodingByteCount = this.encodeStitches(stitchPattern);
        let graphicsOffsetBytes = Stitch.IO.Writers.Utils.integerToBinary(20 + stitchEncodingByteCount, 3, 'L');
        for (let i = 0; i < 3; i++) graphicsOffsetValue[i] = graphicsOffsetBytes[i];
        for (let i = 0; i < stitchPattern.threads.length + 1; i++) this.writePECGraphics();
        Stitch.IO.Writers.Utils.saveData(this.data, filename);
      }
      encodeCommand(command, dx, dy) {
        switch (command) {
          case 'STITCH':
            if (dx < 63 && dx > -64 && dy < 63 && dy > -64) {
              this.writeInt((dx >>> 0) & 0b01111111, 1, 'L');
              this.writeInt((dy >>> 0) & 0b01111111, 1, 'L');
              return 2;
            } else {
              this.writeInt(((dx >>> 0) & 0b00001111_11111111) | 0b10000000_00000000, 2, 'B');
              this.writeInt(((dy >>> 0) & 0b00001111_11111111) | 0b10000000_00000000, 2, 'B');
              return 4;
            }
            break;
          case 'TRIM':
            this.writeInt(((dx >>> 0) & 0b00001111_11111111) | 0b10100000_00000000, 2, 'B');
            this.writeInt(((dy >>> 0) & 0b00001111_11111111) | 0b10100000_00000000, 2, 'B');
            return 4;
            break;
          case 'COLOR_CHANGE':
            this.writeBytes(new Uint8Array([0xFE]));
            this.writeBytes(new Uint8Array([0xB0]));
            this.writeInt(dx % 2 === 0 ? 2 : 1, 1, 'L');
            return 3;
            break;
          case 'END':
            this.writeBytes(new Uint8Array([0xFF]));
            return 1;
            break;
          default:
            console.log(`Unexpected command: ${command}`);
        }
      }
      encodeStitches(stitchPattern) {
        let byteCounter = 0;
        let [xx, yy] = [0, 0];
        for (let i = 0; i < stitchPattern.threads.length; i++) {
          if (i > 0) byteCounter += this.encodeCommand('COLOR_CHANGE', i - 1, 0);
          for (let j = 0; j < stitchPattern.threads[i].runs.length; j++) {
            for (let k = 0; k < stitchPattern.threads[i].runs[j].length; k++) {
              let stitch = stitchPattern.threads[i].runs[j][k];
              let dx = Math.round(10 * stitch.x - xx);
              let dy = Math.round(10 * stitch.y - yy);
              xx += dx;
              yy += dy;
              if (k === 0) {
                byteCounter += this.encodeCommand('TRIM', dx, dy);
                byteCounter += this.encodeCommand('STITCH', 0, 0);
                dx = 0;
                dy = 0;
              }
              byteCounter += this.encodeCommand('STITCH', dx, dy);
            }
          }
        }
        byteCounter += this.encodeCommand('END', 0, 0);
        return byteCounter;
      }
      writePECGraphics() {
        this.writeBytes(new Uint8Array([
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0xFF,
          0xFF, 0xFF, 0xFF, 0x0F, 0x08, 0x00, 0x00, 0x00,
          0x00, 0x10, 0x04, 0x00, 0x00, 0x00, 0x00, 0x20,
          0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x02, 0x00,
          0x00, 0x00, 0x00, 0x40, 0x02, 0x00, 0x00, 0x00,
          0x00, 0x40, 0x02, 0x00, 0x00, 0x00, 0x00, 0x40,
          0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x02, 0x00,
          0x00, 0x00, 0x00, 0x40, 0x02, 0x00, 0x00, 0x00,
          0x00, 0x40, 0x02, 0x00, 0x00, 0x00, 0x00, 0x40,
          0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x02, 0x00,
          0x00, 0x00, 0x00, 0x40, 0x02, 0x00, 0x00, 0x00,
          0x00, 0x40, 0x02, 0x00, 0x00, 0x00, 0x00, 0x40,
          0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x02, 0x00,
          0x00, 0x00, 0x00, 0x40, 0x02, 0x00, 0x00, 0x00,
          0x00, 0x40, 0x02, 0x00, 0x00, 0x00, 0x00, 0x40,
          0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x02, 0x00,
          0x00, 0x00, 0x00, 0x40, 0x02, 0x00, 0x00, 0x00,
          0x00, 0x40, 0x02, 0x00, 0x00, 0x00, 0x00, 0x40,
          0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x02, 0x00,
          0x00, 0x00, 0x00, 0x40, 0x02, 0x00, 0x00, 0x00,
          0x00, 0x40, 0x02, 0x00, 0x00, 0x00, 0x00, 0x40,
          0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x02, 0x00,
          0x00, 0x00, 0x00, 0x40, 0x02, 0x00, 0x00, 0x00,
          0x00, 0x40, 0x02, 0x00, 0x00, 0x00, 0x00, 0x40,
          0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x02, 0x00,
          0x00, 0x00, 0x00, 0x40, 0x04, 0x00, 0x00, 0x00,
          0x00, 0x20, 0x08, 0x00, 0x00, 0x00, 0x00, 0x10,
          0xF0, 0xFF, 0xFF, 0xFF, 0xFF, 0x0F, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00
        ]));
      }
    }
  }
};

Stitch.Browser = {
  animateSvgElements(elements, duration = 10) {
    let [totalLength, lengths] = [0, []];
    for (let i = 0; i < elements.length; i++) {
      let length = elements[i].getBoundingClientRect().width / elements[i].getBBox().width * elements[i].getTotalLength();
      totalLength += length;
      lengths.push(length);
    }
    let startPercent = 0;
    for (let i = 0; i < elements.length; i++) {
      elements[i].style.strokeDasharray = lengths[i];
      elements[i].style.strokeDashoffset = 0;
      let elementPercent = lengths[i] / totalLength;
      let keyframes = (i === 0) ? [] : [{ strokeDashoffset: lengths[i], offset: 0 }];
      keyframes = keyframes.concat([
        { strokeDashoffset: lengths[i], offset: startPercent },
        { strokeDashoffset: 0, offset: startPercent + elementPercent }
      ]);
      let timingProps = { duration: duration * 1000, iterations: 1 };
      elements[i].animate(keyframes, timingProps);
      startPercent += elementPercent;
    }
  },
  debounce: function (func, time = 0) {
    var timer;
    return function(event) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(func, time, event);
    };
  },
  serializeToString(element) { return (new XMLSerializer()).serializeToString(element); },
  setAttributes(element, attributes) { for (let [key, value] of Object.entries(attributes)) element.setAttribute(key, value); },
  setStyles: function(element, styles) { for (let [key, value] of Object.entries(styles)) element.style[key] = value; },
  getDownloadModal: function(pattern, filename, element) {

    // create the modal
    let modal = new Stitch.Browser.Modal(element);

    // define the grid
    let grid = document.createElement('div');
    Stitch.Browser.setStyles(grid, { display: 'grid', justifyItems: 'center', alignItems: 'center', gridTemplate: '20px 20px 30px 15px 20px 20px 16px / repeat(2, 1fr)' });
    modal.body.appendChild(grid);

    // helper functions
    let mmWidth, inWidth, mmHeight, inHeight;
    let calculateDimensions = function() {
      mmWidth = dimensionsSlider.value;
      inWidth = Number(Stitch.Units.mmToIn(mmWidth).toPrecision(3));
      mmHeight = Number((pattern.height / pattern.width * mmWidth).toPrecision(3));
      inHeight = Number(Stitch.Units.mmToIn(mmHeight).toPrecision(3));
    }
    let createText = function(text) {
      let title = document.createElement('div');
      title.innerHTML = text;
      return title;
    }
    let createDropdown = function(choices) {
      let select = document.createElement('select');
      for (let choice of choices) {
        let option = document.createElement('option');
        option.innerHTML = choice;
        select.appendChild(option);
      }
      return select;
    }

    // file format
    let fileFormatTitle = createText("File Format");
    Stitch.Browser.setStyles(fileFormatTitle, { fontSize: '16px', fontWeight: 'bold', gridArea: '1 / 1 / 1 / 3' });
    grid.appendChild(fileFormatTitle);
    let fileFormatDropdown = createDropdown(['PES', 'DST']);
    Stitch.Browser.setStyles(fileFormatDropdown, { width: '80%', textAlignLast: 'center', gridArea: '2 / 1 / 2 / 3' });
    grid.appendChild(fileFormatDropdown);

    // divider
    let divider = document.createElement('hr');
    Stitch.Browser.setStyles(divider, { width: '100%', gridArea: '3 / 1 / 3 / 3' });
    grid.appendChild(divider);

    // dimensions
    let dimensionsTitle = createText("Dimensions");
    Stitch.Browser.setStyles(dimensionsTitle, { fontSize: '16px', fontWeight: 'bold', gridArea: '4 / 1 / 4 / 3' });
    grid.appendChild(dimensionsTitle);
    let dimensionsSlider = document.createElement('input');
    Stitch.Browser.setAttributes(dimensionsSlider, { type: 'range', min: 1, max: 250, value: 89 });
    Stitch.Browser.setStyles(dimensionsSlider, { width: '80%', gridArea: '5 / 1 / 5 / 3' });
    calculateDimensions();
    dimensionsSlider.addEventListener('input', () => {
      calculateDimensions();
      widthValue.innerHTML = `${mmWidth}(mm) / ${inWidth}(in)`;
      heightValue.innerHTML = `${mmHeight}(mm) / ${inHeight}(in)`;
    });
    grid.appendChild(dimensionsSlider);
    let widthTitle = createText("Width");
    Stitch.Browser.setStyles(widthTitle, { gridArea: '6 / 1 / 6 / 2' });
    grid.appendChild(widthTitle);
    let widthValue = createText(`${mmWidth}(mm) / ${inWidth}(in)`);
    Stitch.Browser.setStyles(widthValue, { gridArea: '7 / 1 / 7 / 2' });
    grid.appendChild(widthValue);
    let heightTitle = createText("Height");
    Stitch.Browser.setStyles(heightTitle, { gridArea: '6 / 2 / 6 / 3' });
    grid.appendChild(heightTitle);
    let heightValue = createText(`${mmHeight}(mm) / ${inHeight}(in)`);
    Stitch.Browser.setStyles(heightValue, { gridArea: '7 / 2 / 7 / 3' });
    grid.appendChild(heightValue);

    // download button
    let downloadButton = document.createElement('button');
    modal.footer.appendChild(downloadButton);
    downloadButton.innerHTML = 'Download';
    modal.header.innerHTML = 'Embroidery Downloader';

    Stitch.Browser.setStyles(modal.content, { borderRadius: '10px', position: 'relative', backgroundColor: '#fefefe', margin: '15% auto', padding: '20px', border: '1px solid #888', width: '25%' });
    Stitch.Browser.setStyles(modal.header, { paddingBottom: '10px', margin: 'auto', fontSize: '20px', fontWeight: 'bold' });
    Stitch.Browser.setStyles(modal.footer, { paddingTop: '20px', margin: 'auto', fontSize: '16px' });
    Stitch.Browser.setStyles(downloadButton, { all: 'unset', padding: '5px', border: '1px solid black', borderRadius: '5px', fontSize: '16px', background: 'none' });
    downloadButton.addEventListener('mouseover', () => { Stitch.Browser.setStyles(downloadButton, { backgroundColor: '#eee' }); });
    downloadButton.addEventListener('mouseout', () => { Stitch.Browser.setStyles(downloadButton, { backgroundColor: 'transparent' }); });
    downloadButton.addEventListener('click', () => {
      Stitch.IO.write(pattern, mmWidth, mmHeight, `${filename}.${fileFormatDropdown.value.toLowerCase()}`);
      modal.close();
    });

    return modal;
  },
  Modal: class {
    constructor(element) {
      // create the elements
      this.overlay = document.createElement('div');
      this.content = document.createElement('div');
      this.header = document.createElement('div');
      this.body = document.createElement('div');
      this.footer = document.createElement('div');
      this.closeButton = document.createElement('button');
      // append elements
      element.appendChild(this.overlay);
      this.overlay.appendChild(this.content);
      this.content.appendChild(this.header);
      this.content.appendChild(this.body);
      this.content.appendChild(this.footer);
      this.content.appendChild(this.closeButton);
      // set styles
      this.closeButton.innerHTML = '&times;';
      Stitch.Browser.setStyles(this.overlay, { display: 'none', position: 'fixed', zIndex: '1', left: '0', top: '0', width: '100%', height: '100%', overflow: 'auto', backgroundColor: `rgba(0, 0, 0, 0.4)` });
      Stitch.Browser.setStyles(this.content, { display: 'flex', flexDirection: 'column' });
      Stitch.Browser.setStyles(this.body, { flex: 1 });
      Stitch.Browser.setStyles(this.closeButton, { all: 'unset', position: 'absolute', right: '20px', top: '10px', fontWeight: 'bold', color: 'grey', cursor: 'pointer' });
      // add event listeners
      this.closeButton.addEventListener('mouseover', () => { Stitch.Browser.setStyles(this.closeButton, { color: 'black' }); });
      this.closeButton.addEventListener('mouseout', () => { Stitch.Browser.setStyles(this.closeButton, { color: 'grey' }); });
      this.closeButton.addEventListener('click', () => { this.close(); });
      window.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
    }
    open() { this.overlay.style.display = 'block'; }
    close() { this.overlay.style.display = 'none'; }
  }
};

// must implement a getStitches(pixelsPerUnit) method returning an array of Stitch.Math.Vectors
Stitch.Runs = {
  Run: class {
    constructor(density, polyline) { [this.density, this.polyline] = [density, polyline]; }
    getStitches(pixelsPerUnit) {
      let resampled = this.polyline.getResampledBySpacing(pixelsPerUnit * this.density).vertices;
      if (this.polyline.isClosed) return [...resampled, resampled[0]];
      else return resampled;
    }
  },
  Satin: class {
    constructor(width, density, polyline) { [this.width, this.density, this.polyline] = [width, density, polyline]; }
    getStitches(pixelsPerUnit) {
      let resampled = this.polyline.getResampledBySpacing(pixelsPerUnit * this.density).vertices;
      if (this.polyline.isClosed) resampled.push(resampled[0]);
      let stitches = [];
      for (let i = 0; i < resampled.length; i++) {
        let current = resampled[i];
        let normal = new Stitch.Math.Vector(0, 0);
        if (i > 0) normal = normal.add(current.subtract(resampled[i - 1]).normalized());
        if (i < resampled.length - 1) normal = normal.add(resampled[i + 1].subtract(current).normalized());
        normal = normal.normalized().rotate(0.5 * Math.PI);
        stitches.push(current.add(normal.multiply(0.5 * this.width)));
        stitches.push(current.subtract(normal.multiply(0.5 * this.width)));
      }
      return stitches;
    }
  },
  MultiRun: class {
    constructor(runs) { this.runs = runs; }
    getStitches(pixelsPerUnit) {
      let stitches = [];
      for (let run of this.runs) stitches = stitches.concat(run.getStitches(pixelsPerUnit));
      return stitches;
    }
  },

  SimpleFill: class {
    constructor(stitchLength, density, angle, polyline, contours = []) {
      this.stitchLength = stitchLength;
      this.density = density;
      this.angle = Stitch.Math.Vector.fromAngle(angle);
      this.polyline = polyline;
      this.contours = contours;
      this.boundingBox = this.polyline.getBoundingBox();
      this.boundingBoxCenter = this.boundingBox.max.add(this.boundingBox.min).divide(2);
      this.maxDistance = this.boundingBox.min.distance(this.boundingBoxCenter);
    }
    getStitches(pixelsPerUnit) {

      let hatchLines = [];
      for (let d = -this.maxDistance; d <= this.maxDistance; d += this.density * pixelsPerUnit) {
        hatchLines.push({
          start: this.boundingBoxCenter.add(this.angle.rotate(0.5 * Math.PI).multiply(d)).add(this.angle.multiply(this.maxDistance)),
          end: this.boundingBoxCenter.add(this.angle.rotate(0.5 * Math.PI).multiply(d)).add(this.angle.multiply(-this.maxDistance))
        });
      }

      let hatchLineSegments = [];
      for (let [n, hatchLine] of hatchLines.entries()) {
        let intersections = [];
        for (let i = 0; i < this.polyline.vertices.length; i++) {
          let p = this.polyline.vertices[i];
          let q = this.polyline.vertices[(i + 1) % this.polyline.vertices.length];
          let intersection = Stitch.Math.Utils.lineSegmentIntersection(hatchLine.start, hatchLine.end, p, q);
          if (intersection) {
            intersections.push({ position: intersection, distanceFromStart: hatchLine.start.distance(intersection) });
          }
        }
        for (let contour of this.contours) {
          for (let i = 0; i < contour.vertices.length; i++) {
            let p = contour.vertices[i];
            let q = contour.vertices[(i + 1) % contour.vertices.length];
            let intersection = Stitch.Math.Utils.lineSegmentIntersection(hatchLine.start, hatchLine.end, p, q);
            if (intersection) {
              intersections.push({ position: intersection, distanceFromStart: hatchLine.start.distance(intersection) });
            }
          }
        }
        if (intersections.length > 0 && intersections.length % 2 === 0) {
          intersections.sort((a, b) => { return a.distanceFromStart > b.distanceFromStart ? 1 : -1; });
          for (let i = 0; i < intersections.length; i += 2) {
            let polyline = new Stitch.Math.Polyline(false);
            polyline.vertices.push(intersections[i].position);
            for (let d = (n % 2 === 0) ? 0 : 0.5 * this.stitchLength * pixelsPerUnit; d < 2 * this.maxDistance; d += this.stitchLength * pixelsPerUnit) {
              if (intersections[i].distanceFromStart < d && intersections[i + 1].distanceFromStart > d) {
                polyline.vertices.push(hatchLine.start.subtract(this.angle.multiply(d)));
              }
            }
            polyline.vertices.push(intersections[i + 1].position);
            hatchLineSegments.push(polyline);
          }
        }
      }

      let joinedPolylines = Stitch.Optimize.joinPolylines(hatchLineSegments, 2 * this.density * pixelsPerUnit);
      joinedPolylines = Stitch.Optimize.joinPolylines(joinedPolylines, Infinity);
      let stitches = [];
      for (let joinedPolyline of joinedPolylines) {
        for (let vertex of joinedPolyline.vertices) {
          stitches.push(vertex);
        }
      }
      return stitches;

    }
  },

  ClassicSatin: class {
    #vertices; #segments;
    constructor(densityMm = 0.4) {
      this.densityMm = densityMm;
      this.#vertices = [];
      this.#segments = [];
    }
    static fromQuadStripVectors(vectors, densityMm = 0.4) {
      let run = new Stitch.Runs.ClassicSatin(densityMm);
      for (let i = 0; i < vectors.length; i += 2) { run.addVector(vectors[i]); }
      return run;
    }
    addVertex(x, y) { this.addVector(new Stitch.Math.Vector(x, y)); }
    addVector(v) {
      this.#vertices.push(v);
      let vertexCount = this.#vertices.length;
      if (vertexCount > 2 && vertexCount % 2 === 0) {
        this.#segments.push({
          side0: {
            startIndex: vertexCount - 4,
            endIndex: vertexCount - 2,
            length: this.#vertices[vertexCount - 4].distance(this.#vertices[vertexCount - 2])
          },
          side1: {
            startIndex: vertexCount - 3,
            endIndex: vertexCount - 1,
            length: this.#vertices[vertexCount - 3].distance(this.#vertices[vertexCount - 1])
          }
        });
      }
    }
    // getStitches(pixelsPerMm) {
    //   let run = [];
    //   run.push(this.#vertices[this.#segments[0].side0.startIndex]);
    //   run.push(this.#vertices[this.#segments[0].side1.startIndex]);
    //   for (let segment of this.#segments) {
    //     let countSamples = Math.ceil(Math.max(segment.side0.length, segment.side1.length) / (this.densityMm * pixelsPerMm));
    //     for (let i = 0; i < countSamples; i++) {
    //       let w = Stitch.Math.Utils.map(i + 1, 0, countSamples, 0, 1);
    //       run.push(this.#vertices[segment.side0.startIndex].lerp(this.#vertices[segment.side0.endIndex], w));
    //       run.push(this.#vertices[segment.side1.startIndex].lerp(this.#vertices[segment.side1.endIndex], w));
    //     }
    //   }
    //   return run;
    // }
    getStitches(pixelsPerMm) {

      let runOdd = [];
      let runEven = [];
      let runCenter = [];

      let a = this.#vertices[this.#segments[0].side0.startIndex];
      let b = this.#vertices[this.#segments[0].side1.startIndex];
      let c = a.add(b).multiply(0.5);
      runOdd.push(a);
      runEven.push(b);
      runCenter.push(c);

      let stepSize = 0;
      for (let segment of this.#segments) {

        let aNext = this.#vertices[segment.side0.startIndex];
        let bNext = this.#vertices[segment.side1.startIndex];
        let cNext = aNext.add(bNext).multiply(0.5);

        if (c.distance(cNext) + stepSize > this.densityMm * pixelsPerMm) {
          if (runCenter.length % 2 === 0) {
            runOdd.push(aNext);
            runEven.push(bNext);
          } else {
            runOdd.push(bNext);
            runEven.push(aNext);
          }
          runCenter.push(cNext);
          stepSize = 0;
        } else {
          stepSize += c.distance(cNext);
        }

        a = aNext;
        b = bNext;
        c = cNext;
      }
      if (runCenter.length % 2 === 0) {
        runOdd.push(a);
        runEven.push(b);
      } else {
        runOdd.push(b);
        runEven.push(a);
      }
      runCenter.push(c);
      return runCenter.length > 2 ? [...runCenter, ...runOdd.reverse(), ...runEven, ...runCenter.reverse()] : [];
    }
  },

  // https://github.com/inkstitch/inkstitch/blob/main/lib/stitches/auto_fill.py
  AutoFill: class {
    constructor(shape, angle, rowSpacingMm, stitchSpacingMm, startPosition = null, endPosition = null) {
      this.shape = shape;
      this.angle = angle;
      this.rowSpacingMm = rowSpacingMm;
      this.stitchSpacingMm = stitchSpacingMm;
      this.startPosition = startPosition;
      this.endPosition = endPosition;
      this.direction = Stitch.Math.Vector.fromAngle(this.angle);
      this.normal = Stitch.Math.Vector.fromAngle(this.angle + 0.5 * Math.PI);
      this.bounds = { min: new Stitch.Math.Vector(Infinity, Infinity), max: new Stitch.Math.Vector(-Infinity, -Infinity) };
      for (let polyline of this.shape) {
        let bounds = polyline.getBoundingBox();
        if (bounds.min.x < this.bounds.min.x) this.bounds.min.x = bounds.min.x;
        if (bounds.max.x > this.bounds.max.x) this.bounds.max.x = bounds.max.x;
        if (bounds.min.y < this.bounds.min.y) this.bounds.min.y = bounds.min.y;
        if (bounds.max.y > this.bounds.max.y) this.bounds.max.y = bounds.max.y;
      }
      this.center = this.bounds.min.add(this.bounds.max).multiply(0.5);
      this.distance = this.center.distance(this.bounds.min);
    }
    getStitches(pixelsPerMm) {
      let rows = this.getRows(pixelsPerMm);
      let fillStitchGraph = this.getFillStitchGraph(rows);
      let travelGraph = this.getTravelGraph(fillStitchGraph);
      let stitchPath = this.getStitchPath(fillStitchGraph, travelGraph);
      return this.getStitchesFromPath(stitchPath, fillStitchGraph, pixelsPerMm);;
    }
    getRows(pixelsPerMm) {
      let rows = [];
      for (let offset = -this.distance; offset <= this.distance; offset += this.rowSpacingMm * pixelsPerMm) {
        let intersections = [];
        let c = this.center.add(this.normal.multiply(offset));
        let dc = this.direction.multiply(this.distance);
        let [p, q] = [c.add(dc), c.subtract(dc)];
        for (let [shapeIndex, polyline] of this.shape.entries()) {
          let sumPolylineDistance = 0;
          for (let i = 0; i < polyline.vertices.length; i++) {
            let s = polyline.vertices[i];
            let t = polyline.vertices[(i + 1) % polyline.vertices.length];
            let intersection = Stitch.Math.Utils.lineSegmentIntersection(p, q, s, t);
            if (intersection) {
              intersections.push({
                shapeIndex: shapeIndex,
                position: intersection,
                rowIndex: rows.length,
                rowStart: p,
                rowEnd: q,
                rowDistance: intersection.distance(p),
                polylineDistance: sumPolylineDistance + s.distance(intersection)
              });
            }
            sumPolylineDistance += s.distance(t);
          }
        }
        if (intersections.length > 0 && intersections.length % 2 === 0) {
          intersections.sort((a, b) => { return a.rowDistance > b.rowDistance ? 1 : -1; });
          let row = [];
          for (let i = 0; i < intersections.length; i += 2) row.push([intersections[i], intersections[i + 1]]);
          rows.push(row);
        }
      }
      return rows;
    }
    getFillStitchGraph(rows) {
      let fillStitchGraph = new Stitch.Math.NewGraph();
      for (let i = 0; i < rows.length; i++) {
        for (let j = 0; j < rows[i].length; j++) {
          fillStitchGraph.addVertex(`${i},${j},0`, rows[i][j][0]);
          fillStitchGraph.addVertex(`${i},${j},1`, rows[i][j][1]);
          fillStitchGraph.addEdge(`${i},${j},0`, `${i},${j},1`, { key: "segment" });
        }
      }
      for (let i = 0; i < this.shape.length; i++) {
        let nodes = Object.entries(fillStitchGraph.vertices)
          .filter(([key, value]) => value.shapeIndex === i)
          .sort((a, b) => a[1].polylineDistance > b[1].polylineDistance ? 1 : -1);
        for (let j = 0; j < nodes.length; j++) {
          fillStitchGraph.addEdge(nodes[j][0], nodes[(j + 1) % nodes.length][0], { key: "outline" });
          if (j % 2 === 0) {
            fillStitchGraph.addEdge(nodes[j][0], nodes[(j + 1) % nodes.length][0], { key: "extra" });
          }
        }
      }
      return fillStitchGraph;
    }
    getTravelGraph(fillStitchGraph) {
      let travelGraph = new Stitch.Math.NewGraph();
      for (let [id, properties] of Object.entries(fillStitchGraph.vertices)) {
        travelGraph.addVertex(id, properties);
      }

      for (let [edgeId, edge] of Object.entries(fillStitchGraph.edges)) {
        if (edge.properties.key === "outline") {
          travelGraph.addEdge(edge.from, edge.to, { key: "outline" });
        }
      }

      return travelGraph;
    }
    getStitchPath(fillStitchGraph, travelGraph) {
      let g = fillStitchGraph.copy();
      let startId = Object.keys(g.vertices)[0];
      let endId = startId;
      if (this.startPosition !== null || this.endPosition !== null) {
        let [minStartDistance, minEndDistance] = [Infinity, Infinity];
        for (let [id, v] of Object.entries(g.vertices)) {
          let dStart = (this.startPosition === null) ? Infinity : this.startPosition.distance(v.position);
          let dEnd = (this.endPosition === null) ? Infinity : this.endPosition.distance(v.position);
          if (this.startPosition !== null && dStart < minStartDistance) {
            minStartDistance = dStart;
            startId = id;
          }
          if (this.endPosition !== null && dEnd < minEndDistance) {
            minEndDistance = dEnd;
            endId = id;
          }
        }
      }
      let path = [];
      let vertexStack = [[endId, false]];
      let lastVertexId = false;
      let lastVertexKey = false;
      while (vertexStack.length > 0) {
        let [currentVertexId, currentVertexKey] = vertexStack[vertexStack.length - 1];
        if (g.adjacency[currentVertexId].length === 0) {
          if (lastVertexId) {
            path.push({ from: lastVertexId, to: currentVertexId, key: lastVertexKey });
          }
          [lastVertexId, lastVertexKey] = [currentVertexId, currentVertexKey];
          vertexStack.pop();
        } else {
          let edges = g.adjacency[currentVertexId];
          let [edgeId, nextVertexId, nextVertexKey] = [edges[0].id, edges[0].to, g.edges[edges[0].id].properties.key];
          for (let edge of edges) {
            if (g.edges[edge.id].properties.key === "segment") {
              [edgeId, nextVertexId, nextVertexKey] = [edge.id, edge.to, g.edges[edge.id].properties.key];
              break;
            }
          }
          vertexStack.push([nextVertexId, nextVertexKey]);
          g.removeEdge(edgeId);
        }
      }
      if (startId !== endId) {
        path.unshift({ from: startId, to: endId, key: "initial" })
      }

      // collapse sequential edges that fall on the same outline
      let [newPath, startRunId] = [[], null];
      for (let edge of path) {
        if (edge.key === "segment") {
          if (startRunId !== null) {
            let graphHasEdge = false;
            for (let e of fillStitchGraph.adjacency[startRunId]) {
              if (e.to === edge.from) {
                graphHasEdge = true;
                break;
              }
            }
            if (graphHasEdge) {
              newPath.push({ from: startRunId, to: edge.from, key: "outline" });
            } else {
              newPath.push({ from: startRunId, to: edge.from, key: "collapsed" });
            }
            startRunId = null;
          }
          newPath.push(edge);
        } else {
          if (startRunId === null) {
            startRunId = edge.from;
          }
        }
      }
      if (startRunId !== null && startRunId !== path[path.length - 1].to) {
        newPath.push({ from: startRunId, to: edge.to, key: "collapsed" })
      }

      return newPath;
    }
    getStitchesFromPath(stitchPath, fillStitchGraph, pixelsPerMm) {
      let stitches = [];
      if (stitchPath[0].key !== "segment") {
        stitches.push(fillStitchGraph.vertices[stitchPath[0].from].position);
      }
      for (let [i, edge] of stitchPath.entries()) {
        let [from, to] = [fillStitchGraph.vertices[edge.from], fillStitchGraph.vertices[edge.to]];
        if (edge.key === "segment") {
          stitches = stitches.concat(this.stitchRow(from, to, pixelsPerMm));
        } else {
          stitches = stitches.concat(this.findPath(from.position, to.position, this.stitchSpacingMm * pixelsPerMm, 0.1 * this.stitchSpacingMm * pixelsPerMm));
        }
      }
      return stitches;
    }
    stitchRow(from, to, pixelsPerMm) {
      let rowStitches = [];
      let offset = Stitch.Math.Utils.map(from.rowIndex % 2, 0, 2, 0, this.stitchSpacingMm * pixelsPerMm);
      let maxDist = to.rowStart.distance(to.rowEnd);
      let spacing = this.stitchSpacingMm * pixelsPerMm;
      let minD = Math.min(from.rowDistance, to.rowDistance);
      let maxD = Math.max(from.rowDistance, to.rowDistance);
      for (let d = offset; d < maxDist; d += spacing) {
        if (d > minD && d < maxD) {
          let lerp = to.rowStart.lerp(to.rowEnd, d / maxDist);
          if (
            from.position.distance(lerp) >= 0.25 * this.stitchSpacingMm * pixelsPerMm &&
            to.position.distance(lerp) >= 0.25 * this.stitchSpacingMm * pixelsPerMm
          ) {
            rowStitches.push(lerp);
          }
        }
      }
      if (from.rowDistance > to.rowDistance) {
        rowStitches.reverse();
      }
      return rowStitches;
    }
    findPath(from, to, maxStepSize, minStepSize, nLayer = 0, originalStepSize = null) {
      if (originalStepSize === null) originalStepSize = maxStepSize;
      let queue = [[from]];
      let visited = new Set();
      while (queue.length > 0) {
        let path = queue.shift();
        let current = path[path.length - 1];
        if (current.distance(to) < 2 * maxStepSize) return path;
        if (!visited.has(current.x + ',' + current.y)) {
          visited.add(current.x + ',' + current.y);
          // let neighbors = [
          //   new Stitch.Math.Vector(current.x + maxStepSize, current.y              ),
          //   new Stitch.Math.Vector(current.x - maxStepSize, current.y              ),
          //   new Stitch.Math.Vector(current.x              , current.y + maxStepSize),
          //   new Stitch.Math.Vector(current.x              , current.y - maxStepSize),
          //   new Stitch.Math.Vector(current.x + maxStepSize, current.y + maxStepSize),
          //   new Stitch.Math.Vector(current.x - maxStepSize, current.y - maxStepSize),
          //   new Stitch.Math.Vector(current.x + maxStepSize, current.y - maxStepSize),
          //   new Stitch.Math.Vector(current.x - maxStepSize, current.y + maxStepSize)
          // ];
          let neighbors = [];
          if (nLayer === 0) {
            neighbors = [
              new Stitch.Math.Vector(current.x + maxStepSize, current.y              ),
              new Stitch.Math.Vector(current.x - maxStepSize, current.y              ),
              new Stitch.Math.Vector(current.x              , current.y + maxStepSize),
              new Stitch.Math.Vector(current.x              , current.y - maxStepSize)
            ];
          } else if (nLayer === 1) {
            neighbors = [
              new Stitch.Math.Vector(current.x + maxStepSize, current.y + maxStepSize),
              new Stitch.Math.Vector(current.x - maxStepSize, current.y - maxStepSize),
              new Stitch.Math.Vector(current.x + maxStepSize, current.y - maxStepSize),
              new Stitch.Math.Vector(current.x - maxStepSize, current.y + maxStepSize)
            ];
          } else if (nLayer === 2) {
            neighbors = [
              new Stitch.Math.Vector(current.x - 0.5 * maxStepSize, current.y + maxStepSize),
              new Stitch.Math.Vector(current.x + 0.5 * maxStepSize, current.y - maxStepSize),
              new Stitch.Math.Vector(current.x - 0.5 * maxStepSize, current.y - maxStepSize),
              new Stitch.Math.Vector(current.x + 0.5 * maxStepSize, current.y + maxStepSize),
              new Stitch.Math.Vector(current.x + maxStepSize, current.y - 0.5 * maxStepSize),
              new Stitch.Math.Vector(current.x - maxStepSize, current.y + 0.5 * maxStepSize),
              new Stitch.Math.Vector(current.x - maxStepSize, current.y - 0.5 * maxStepSize),
              new Stitch.Math.Vector(current.x + maxStepSize, current.y + 0.5 * maxStepSize),
            ];
          } else if (nLayer === 3) {
            neighbors = [
              new Stitch.Math.Vector(current.x - 0.25 * maxStepSize, current.y + maxStepSize),
              new Stitch.Math.Vector(current.x + 0.25 * maxStepSize, current.y - maxStepSize),
              new Stitch.Math.Vector(current.x - 0.25 * maxStepSize, current.y - maxStepSize),
              new Stitch.Math.Vector(current.x + 0.25 * maxStepSize, current.y + maxStepSize),
              new Stitch.Math.Vector(current.x + maxStepSize, current.y - 0.25 * maxStepSize),
              new Stitch.Math.Vector(current.x - maxStepSize, current.y + 0.25 * maxStepSize),
              new Stitch.Math.Vector(current.x - maxStepSize, current.y - 0.25 * maxStepSize),
              new Stitch.Math.Vector(current.x + maxStepSize, current.y + 0.25 * maxStepSize),
              new Stitch.Math.Vector(current.x - 0.75 * maxStepSize, current.y + maxStepSize),
              new Stitch.Math.Vector(current.x + 0.75 * maxStepSize, current.y - maxStepSize),
              new Stitch.Math.Vector(current.x - 0.75 * maxStepSize, current.y - maxStepSize),
              new Stitch.Math.Vector(current.x + 0.75 * maxStepSize, current.y + maxStepSize),
              new Stitch.Math.Vector(current.x + maxStepSize, current.y - 0.75 * maxStepSize),
              new Stitch.Math.Vector(current.x - maxStepSize, current.y + 0.75 * maxStepSize),
              new Stitch.Math.Vector(current.x - maxStepSize, current.y - 0.75 * maxStepSize),
              new Stitch.Math.Vector(current.x + maxStepSize, current.y + 0.75 * maxStepSize),
            ];
          }

          for (const neighbor of neighbors) {
            if (this.shape[0].containsPoint(neighbor)) {
              let checkContours = true;
              for (let i = 1; i < this.shape.length; i++) {
                let contour = this.shape[i];
                if (contour.containsPoint(neighbor)) {
                  checkContours = false;
                  break;
                }
              }
              let checkFilled = true;
              // for (let i = 0; i < this.filledPolylines.length; i++) {
              //   let polyline = this.filledPolylines[i];
              //   if (polyline.containsPoint(neighbor)) {
              //     checkFilled = false;
              //     break;
              //   }
              // }
              if (checkContours && checkFilled) {
                let newPath = [...path, neighbor];
                queue.push(newPath);
              }
            }
          }
        }
      }
      if (maxStepSize > minStepSize) return this.findPath(from, to, 0.5 * maxStepSize, minStepSize, nLayer, originalStepSize);
      if (nLayer < 1) return this.findPath(from, to, originalStepSize, minStepSize, nLayer + 1, originalStepSize);
      console.log("no path found");
      return [];
    }
  },
  MultiAutoFill: class {
    constructor(autoFills) { this.autoFills = autoFills; }
    getStitches(pixelsPerUnit) {
      let stitches = [];
      for (let i = 0; i < this.autoFills.length; i++) {
        if (stitches.length > 0) {
          this.autoFills[i].startPosition = this.autoFills[i].shape[0].getClosestVertex(stitches[stitches.length - 1]);
        }
        stitches = stitches.concat(this.autoFills[i].getStitches(pixelsPerUnit));
      }
      return stitches;
    }
  }
};

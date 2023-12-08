let Stitch = {};

Stitch.Pattern = class {

  constructor(vWidth, vHeight) {
    this.vWidth = vWidth;
    this.vHeight = vHeight;
    this.threads = [];
    this.backgroundColor = [255, 255, 255];
  }

  setBackgroundColor(red, green, blue) {
    this.backgroundColor = [red, green, blue];
  }

  addThread(red, green, blue) {
    this.threads.push(new Stitch.Thread(red, green, blue));
    return this.threads.slice(-1)[0];
  }

  getStitches(width, height, pixels = false, justify = true) {

    // calculate the aspect ratio adjustment
    let dimensions = width / height > this.vWidth / this.vHeight
      ? { width: (this.vWidth / this.vHeight) * height, height: height }
      : { width: width, height: (this.vHeight / this.vWidth) * width };

    // prepare the bounding box for justify calculations
    let boundingBox = { xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity };

    // get the stitches
    let stitchPattern = {
      width: dimensions.width,
      height: dimensions.height,
      pixelsPerUnit: (pixels ? 3.78 : 1) * this.vWidth / dimensions.width,
      stitchCount: 0,
      threads: []
    };
    for (let thread of this.threads) {
      let stitchThread = { thread: thread, runs: [] };
      for (let run of thread.runs) {
        let stitchRun = [];
        for (let stitch of run.getStitches(stitchPattern.pixelsPerUnit)) {
          stitchRun.push(new Stitch.Utils.Vector(stitch.x, stitch.y));
          stitchPattern.stitchCount++;
          if (justify) {
            if (stitch.x < boundingBox.xMin) boundingBox.xMin = stitch.x;
            if (stitch.x > boundingBox.xMax) boundingBox.xMax = stitch.x;
            if (stitch.y < boundingBox.yMin) boundingBox.yMin = stitch.y;
            if (stitch.y > boundingBox.yMax) boundingBox.yMax = stitch.y;
          }
        }
        stitchThread.runs.push(stitchRun);
      }
      stitchPattern.threads.push(stitchThread);
    }

    // move the pattern into the top left corner
    if (justify) {
      stitchPattern.width = (boundingBox.xMax - boundingBox.xMin);
      stitchPattern.height = (boundingBox.yMax - boundingBox.yMin);
      for (let i = 0; i < stitchPattern.threads.length; i++) {
        for (let j = 0; j < stitchPattern.threads[i].runs.length; j++) {
          for (let k = 0; k < stitchPattern.threads[i].runs[j].length; k++) {
            stitchPattern.threads[i].runs[j][k] = stitchPattern.threads[i].runs[j][k].subtract(new Stitch.Utils.Vector(boundingBox.xMin, boundingBox.yMin));
          }
        }
      }
    }

    return stitchPattern;

  }

  drawSvg(pxWidth, pxHeight, sigFigs = 5, namespace = "http://www.w3.org/2000/svg") {

    // calculate the aspect ratio adjustment
    let dimensions = pxWidth / pxHeight > this.vWidth / this.vHeight
      ? { width: (this.vWidth / this.vHeight) * pxHeight, height: pxHeight }
      : { width: pxWidth, height: (this.vHeight / this.vWidth) * pxWidth };

    // create svg element, set attributes, append to body
    let svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", `0 0 ${this.vWidth} ${this.vHeight}`);
    svg.setAttribute("width", `${dimensions.width}px`);
    svg.setAttribute("height", `${dimensions.height}px`);
    svg.setAttribute("style", `background-color: rgb(${this.backgroundColor[0]}, ${this.backgroundColor[1]}, ${this.backgroundColor[2]})`);
    document.body.appendChild(svg);

    // loop over all threads in the pattern
    for (let thread of this.threads) {

      // create an svg group for each thread, append it to the svg
      let group = document.createElementNS(namespace, "g");
      group.setAttribute("style", `fill: none; stroke-width: 1; stroke: rgb(${thread.red}, ${thread.green}, ${thread.blue});`);
      svg.appendChild(group);

      // loop over all runs in the thread
      for (let run of thread.runs) {

        // request the stitches - 3.78 seems a bit arbitrary but ¯\_(ツ)_/¯
        // https://stackoverflow.com/questions/35359334/svg-mm-and-px-co-ordinates-lengths-differ-for-defined-viewbox
        let stitches = run.getStitches(3.78 * this.vWidth / dimensions.width);

        // loop over all stitches, append to the "d" string
        let d = "";
        for (let i = 0; i < stitches.length; i++) {
          let x = Number(stitches[i].x.toPrecision(sigFigs));
          let y = Number(stitches[i].y.toPrecision(sigFigs));
          if (i === 0) d += `M ${x} ${y}`;
          else d += ` L ${x} ${y}`;
        }

        // create path, set attributes, append to group
        let path = document.createElementNS(namespace, "path");
        path.setAttribute("stroke-linejoin", "bevel");
        path.setAttribute("vector-effect", "non-scaling-stroke");
        path.setAttribute("d", d);
        group.appendChild(path);

      }

    }

    // return the svg in case the user wants to do anything extra with it
    return svg;

  }

  getSvgString(mmWidth, mmHeight, sigFigs = 5, namespace = "http://www.w3.org/2000/svg") {

    // calculate the aspect ratio adjustment
    let dimensions = mmWidth / mmHeight > this.vWidth / this.vHeight
      ? { width: (this.vWidth / this.vHeight) * mmHeight, height: mmHeight }
      : { width: mmWidth, height: (this.vHeight / this.vWidth) * mmWidth };

    // create svg element, set attributes
    let svg = document.createElementNS(namespace, "svg");

    // initialize variables to calculate the minimum x and y coordinates
    let xMin = Infinity;
    let yMin = Infinity;
    let xMax = -Infinity;
    let yMax = -Infinity;
    let groups = [];

    // loop over all threads in the pattern
    for (let thread of this.threads) {

      // create an svg group for each thread, append it to the svg
      let group = document.createElementNS(namespace, "g");
      group.setAttribute("style", `fill: none; stroke-width: 1; stroke: rgb(${thread.red}, ${thread.green}, ${thread.blue});`);
      svg.appendChild(group);

      // loop over all runs in the thread
      for (let run of thread.runs) {

        // request the stitches
        let stitches = run.getStitches(this.vWidth / dimensions.width);

        // loop over all stitches, append to the "d" string
        let d = "";
        for (let i = 0; i < stitches.length; i++) {
          let x = Number(stitches[i].x.toPrecision(sigFigs));
          let y = Number(stitches[i].y.toPrecision(sigFigs));
          if (xMin > x) xMin = x;
          else if (xMax < x) xMax = x;
          if (yMin > y) yMin = y;
          else if (yMax < y) yMax = y;
          if (i === 0) d += `M ${x} ${y}`;
          else d += ` L ${x} ${y}`;
        }

        // create path, set attributes, append to group
        let path = document.createElementNS(namespace, "path");
        path.setAttribute("stroke-linejoin", "bevel");
        path.setAttribute("vector-effect", "non-scaling-stroke");
        path.setAttribute("d", d);
        group.appendChild(path);

        // keep track of groups to justify after loop
        groups.push(group);
      }

    }

    // justify the pattern into the top left corner
    svg.setAttribute("viewBox", `0 0 ${xMax - xMin} ${yMax - yMin}`);
    svg.setAttribute("width", `${(xMax - xMin) / this.vWidth * dimensions.width}mm`);
    svg.setAttribute("height", `${(yMax - yMin) / this.vHeight * dimensions.height}mm`);
    for (let group of groups) {
      group.setAttribute("transform", `translate(${-xMin} ${-yMin})`);
    }

    // create the serializer and return the serialized svg string
    let serializer = new XMLSerializer();
    return serializer.serializeToString(svg);

  }

};

Stitch.Thread = class {
  constructor(red, green, blue) {
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.runs = [];
  }
  addRun(run) {
    this.runs.push(run);
  }
};

Stitch.Utils = {};

Stitch.Utils.inchesToMillimeters = function (inches) {
  return inches * 25.4;
};

Stitch.Utils.millimetersToInches = function (millimeters) {
  return millimeters / 25.4;
};

Stitch.Utils.Vector = class {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  add(v) {
    return new Stitch.Utils.Vector(this.x + v.x, this.y + v.y);
  }
  subtract(v) {
    return new Stitch.Utils.Vector(this.x - v.x, this.y - v.y);
  }
  multiply(s) {
    return new Stitch.Utils.Vector(s * this.x, s * this.y);
  }
  divide(s) {
    return new Stitch.Utils.Vector(this.x / s, this.y / s);
  }
  dot(v) {
    return this.x * v.x + this.y * v.y;
  }
  distance(v) {
    return Math.sqrt(
      (this.x - v.x) * (this.x - v.x) + (this.y - v.y) * (this.y - v.y)
    );
  }
  heading() {
    return Math.atan2(this.y, this.x);
  }
  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  normalized() {
    return this.divide(this.magnitude());
  }
  rotate(a) {
    return new Stitch.Utils.Vector(
      this.x * Math.cos(a) - this.y * Math.sin(a),
      this.x * Math.sin(a) + this.y * Math.cos(a)
    );
  }
  lerp(v, w) {
    return new Stitch.Utils.Vector(
      (1 - w) * this.x + w * v.x,
      (1 - w) * this.y + w * v.y
    );
  }
};

Stitch.Utils.resampleLineBySpacing = function (
  points,
  spacing,
  isClosed = false
) {
  let toIndex = isClosed ? points.length + 1 : points.length;
  let totalLength = 0;
  for (let i = 1; i < toIndex; i++)
    totalLength += points[i % points.length].distance(points[i - 1]);
  let stepSize = totalLength / Math.floor(totalLength / spacing);
  let result = [points[0]];
  let currentStep = 0;
  for (let i = 1; i < toIndex; i++) {
    let ds = points[i % points.length].distance(points[i - 1]);
    if (stepSize - currentStep > ds) {
      currentStep += ds;
    } else {
      let totalStep = 0;
      for (let j = stepSize - currentStep; j < ds; j += stepSize) {
        result.push(points[i - 1].lerp(points[i % points.length], j / ds));
        totalStep += stepSize;
      }
      currentStep += ds - totalStep;
    }
  }
  if (!isClosed) result.push(points[points.length - 1]);
  return result;
};

Stitch.Utils.getRoundedLine = function (points, radius, isClosed = false) {
  let fromIndex = isClosed ? 0 : 1;
  let toIndex = isClosed ? points.length : points.length - 1;
  let result = [];
  if (!isClosed) result.push(points[0]);
  for (let i = fromIndex; i < toIndex; i++) {
    let A = points[(i - 1 + points.length) % points.length];
    let B = points[i];
    let C = points[(i + 1) % points.length];
    let BA = A.subtract(B);
    let BC = C.subtract(B);
    let BAnorm = BA.normalized();
    let BCnorm = BC.normalized();
    let sinA = -1 * BAnorm.dot(BCnorm.rotate(0.5 * Math.PI));
    let sinA90 = BAnorm.dot(BCnorm);
    let angle = Math.asin(sinA);
    let radDirection = 1;
    let drawDirection = false;
    if (sinA90 < 0) {
      angle += Math.PI;
      if (angle >= 0) {
        radDirection = -1;
        drawDirection = true;
      }
    } else {
      if (angle > 0) {
        radDirection = -1;
        drawDirection = true;
      }
    }
    let halfAngle = 0.5 * angle;
    let lenOut = Math.abs((Math.cos(halfAngle) * radius) / Math.sin(halfAngle));
    let cRadius = 0;
    if (lenOut > Math.min(0.5 * BA.magnitude(), 0.5 * BC.magnitude())) {
      lenOut = Math.min(0.5 * BA.magnitude(), 0.5 * BC.magnitude());
      cRadius = Math.abs((lenOut * Math.sin(halfAngle)) / Math.cos(halfAngle));
    } else {
      cRadius = radius;
    }
    let x =
      B.x +
      BC.normalized().x * lenOut -
      BC.normalized().y * cRadius * radDirection;
    let y =
      B.y +
      BC.normalized().y * lenOut +
      BC.normalized().x * cRadius * radDirection;
    let fromAngle =
      (((BA.heading() + 0.5 * Math.PI * radDirection + 6 * Math.PI) /
        (2 * Math.PI)) %
        1) *
      2 *
      Math.PI;
    let toAngle =
      (((BC.heading() - 0.5 * Math.PI * radDirection + 6 * Math.PI) /
        (2 * Math.PI)) %
        1) *
      2 *
      Math.PI;
    if (!drawDirection) {
      if (fromAngle < toAngle) {
        for (let a = fromAngle; a < toAngle; a += 0.1) {
          result.push(
            new Stitch.Utils.Vector(
              cRadius * Math.cos(a) + x,
              cRadius * Math.sin(a) + y
            )
          );
        }
      } else {
        for (let a = fromAngle; a < toAngle + 2 * Math.PI; a += 0.1) {
          result.push(
            new Stitch.Utils.Vector(
              cRadius * Math.cos(a) + x,
              cRadius * Math.sin(a) + y
            )
          );
        }
      }
    } else {
      if (fromAngle > toAngle) {
        for (let a = fromAngle; a > toAngle; a -= 0.1) {
          result.push(
            new Stitch.Utils.Vector(
              cRadius * Math.cos(a) + x,
              cRadius * Math.sin(a) + y
            )
          );
        }
      } else {
        for (let a = fromAngle; a > toAngle - 2 * PI; a -= 0.1) {
          result.push(
            new Stitch.Utils.Vector(
              cRadius * Math.cos(a) + x,
              cRadius * Math.sin(a) + y
            )
          );
        }
      }
    }
  }
  if (!isClosed) result.push(points[points.length - 1]);
  else result.push(result[0]);
  return result;
};

Stitch.Utils.Graph = class {
  constructor(countVertices, adj = null) {
    this.countVertices = countVertices;
    this.adj =
      adj === null ? Array.from(Array(countVertices), () => new Array()) : adj;
    this.priorityQueue = [];
  }
  addEdge(u, v) {
    this.adj[u].push(v);
    this.adj[v].push(u);
  }
  removeEdge(u, v) {
    let uvIndex = this.adj[u].indexOf(v);
    let vuIndex = this.adj[v].indexOf(u);
    if (uvIndex > -1) this.adj[u].splice(uvIndex, 1);
    if (vuIndex > -1) this.adj[v].splice(vuIndex, 1);
  }
  copy() {
    let adjCopy = Array.from(Array(this.countVertices), () => new Array());
    for (let i = 0; i < this.adj.length; i++) {
      for (let j = 0; j < this.adj[i].length; j++) {
        adjCopy[i].push(this.adj[i][j]);
      }
    }
    return new Stitch.Utils.Graph(this.countVertices, adjCopy);
  }
  getEulerTour() {
    let g = this.routeInspection();
    let u = 0;
    for (let i = 0; i < g.countVertices; i++) {
      if (g.adj[i].length % 2 === 1) {
        u = i;
        break;
      }
    }
    let path = [u];
    g.eulerTourUtil(u, path);
    return path;
  }
  eulerTourUtil(u, path) {
    for (let j in this.adj[u]) {
      let v = this.adj[u][j];
      if (this.isValidNextEdge(u, v)) {
        path.push(v);
        this.removeEdge(u, v);
        this.eulerTourUtil(v, path);
      }
    }
  }
  DFSCount(v, visited) {
    visited[v] = true;
    let count = 1;
    for (let j in this.adj[v]) {
      let i = this.adj[v][j];
      if (!visited[i]) {
        count += this.DFSCount(i, visited);
      }
    }
    return count;
  }
  isValidNextEdge(u, v) {
    let count = 0;
    for (let j in this.adj[u]) {
      if (this.adj[u][j] !== -1) count++;
    }
    if (count == 1) return true;
    let visited = new Array(this.countVertices);
    visited.fill(false);
    let count1 = this.DFSCount(u, visited);
    this.removeEdge(u, v);
    visited.fill(false);
    let count2 = this.DFSCount(u, visited);
    this.addEdge(u, v);
    return count1 > count2 ? false : true;
  }
  routeInspection() {
    let oddDegreeVertices = [];
    for (let i = 0; i < this.countVertices; i++) {
      if (this.adj[i].length % 2 === 1) {
        oddDegreeVertices.push(i);
      }
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
    for (let i = 0; i < this.countVertices; i++) {
      if (i === startNode) times[i] = 0;
      else times[i] = Infinity;
    }
    this.priorityQueueEnqueue([startNode, 0]);
    while (this.priorityQueue.length !== 0) {
      let shortestStep = this.priorityQueueDequeue();
      let currentNode = shortestStep[0];
      this.adj[currentNode].forEach((neighbor) => {
        let time = times[currentNode] + 1;
        if (time < times[neighbor]) {
          times[neighbor] = time;
          backtrace[neighbor] = currentNode;
          this.priorityQueueEnqueue([neighbor, time]);
        }
      });
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
};

Stitch.Utils.debounce = function (func, time = 0) {
  var timer;
  return function(event) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(func, time, event);
  };
}

// Future: maybe use the File System API? https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
// Stitch.Writer = class {
//   // options: filename, extension, pattern, widthMM, heightMM
//   constructor(element, event, options) {
//     this.options = options;
//     element.addEventListener(event, async () => { await this.write(); });
//   }
//   async write() {
//     let handle = await window.showSaveFilePicker({ suggestedName: `${this.options.filename}.${this.options.extension}` });
//     const writable = await handle.createWritable();
//     let data = new Uint8Array([0, 0, 0b11000011]);
//     await writable.write(data);
//     await writable.close();
//   }
// }

Stitch.Writer = {

  write: function (pattern, filename, widthMM, heightMM) {

    // calculate the stitch pattern for the requested dimensions
    let stitchPattern = pattern.getStitches(widthMM, heightMM, false, true);

    // apply transform the stitches
    for (let i = 0; i < stitchPattern.threads.length; i++) {
      for (let j = 0; j < stitchPattern.threads[i].runs.length; j++) {
        for (let k = 0; k < stitchPattern.threads[i].runs[j].length; k++) {
          stitchPattern.threads[i].runs[j][k] = stitchPattern.threads[i].runs[j][k].subtract(new Stitch.Utils.Vector(0.5 * stitchPattern.width, 0.5 * stitchPattern.height));
          stitchPattern.threads[i].runs[j][k] = stitchPattern.threads[i].runs[j][k].divide(stitchPattern.pixelsPerUnit);
        }
      }
    }
    stitchPattern.width /= stitchPattern.pixelsPerUnit;
    stitchPattern.height /= stitchPattern.pixelsPerUnit;

    // run the appropriate writer for the given extension
    switch(filename.toLowerCase().split(".")[1]) {
      case 'dst':
        let writer = new Stitch.Writer.DSTWriter();
        writer.write(stitchPattern, filename);
        break;
      default:
        console.log(`Unsupported file extension: ${filename}`);
    }

  },

  DSTWriter: class {

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

    // https://edutechwiki.unige.ch/en/Embroidery_format_DST
    // http://www.achatina.de/sewing/main/DST.HTM
    write(stitchPattern, filename) {

      // helper functions for string formatting
      function padLeft(string, length, char = " ") { return string.substring(0, length).padStart(length, char); }
      function padRight(string, length, char = " ") { return string.substring(0, length).padEnd(length, char); }

      // array to hold the data to be written
      let data = [];

      // header
      data.push(`LA:${padRight(filename.split(".")[0], 16, " ")}\r`);
      data.push(`ST:${padLeft(stitchPattern.stitchCount.toString(), 7, " ")}\r`);
      /* number of color changes, not number of colors! */
      data.push(`CO:${padLeft((stitchPattern.threads.length - 1).toString(), 3, " ")}\r`);
      data.push(`+X:${padLeft(Math.ceil(0.1 * 0.5 * stitchPattern.width).toString(), 5, " ")}\r`);
      data.push(`-X:${padLeft(Math.ceil(0.1 * 0.5 * stitchPattern.width).toString(), 5, " ")}\r`);
      data.push(`+Y:${padLeft(Math.ceil(0.1 * 0.5 * stitchPattern.height).toString(), 5, " ")}\r`);
      data.push(`-Y:${padLeft(Math.ceil(0.1 * 0.5 * stitchPattern.height).toString(), 5, " ")}\r`);
      // let firstSticth = stitchPattern.threads[0].runs[0][0];
      // let lastThread = stitchPattern.threads[stitchPattern.threads.length - 1];
      // let lastRun = lastThread.runs[lastThread.runs.length - 1];
      // let lastStitch = lastRun[lastRun.length - 1];
      // let ax = firstSticth.x - lastStitch.x;
      // let ay = firstSticth.y - lastStitch.y;
      data.push('AX:+    0\r');
      data.push('AY:+    0\r');
      data.push('MX:+    0\r');
      data.push('MY:+    0\r');
      data.push('PD:******\r');
      data.push(new Uint8Array([0x1a]));
      data.push(" ".repeat(387));

      // body
      let xx = 0;
      let yy = 0;
      for (let i = 0; i < stitchPattern.threads.length; i++) {
        if (i > 0) data.push(this.encodeRecord(0, 0, 'COLOR_CHANGE'));
        for (let run of stitchPattern.threads[i].runs) {
          for (let stitch of run) {
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
              for (let j = 0; j < steps - 1; j++) {
                data.push(this.encodeRecord(ddx, ddy, 'JUMP'));
                accx += ddx;
                accy += ddy;
              }
              dx -= accx;
              dy -= accy;
            }
            data.push(this.encodeRecord(dx, dy, 'STITCH'));
          }
        }
      }

      // end of file
      data.push(this.encodeRecord(0, 0, 'END'));

      // save the file
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
  }
}

class StitchRunTemaplate {
  constructor() {}
  getStitches(pixelsPerUnit) {}
}

let StitchRuns = {

  Run: class extends StitchRunTemaplate {
    constructor(density) {
      super();
      this.density = density;
      this.points = [];
    }
    addPoint(x, y) {
      this.points.push(new Stitch.Utils.Vector(x, y));
    }
    getStitches(pixelsPerUnit) {
      return Stitch.Utils.resampleLineBySpacing(this.points, pixelsPerUnit * this.density);
    }
  },

  Satin: class extends StitchRunTemaplate {
    constructor(width, density) {
      super();
      this.width = width;
      this.density = density;
      this.points = [];
    }
    addPoint(x, y) {
      this.points.push(new Stitch.Utils.Vector(x, y));
    }
    getStitches(pixelsPerUnit) {
      let resampled = Stitch.Utils.resampleLineBySpacing(this.points, pixelsPerUnit * this.density);
      let stitches = [];
      for (let i = 0; i < resampled.length; i++) {
        let current = resampled[i];
        let normal = new Stitch.Utils.Vector(0, 0);
        if (i > 0) {
          normal = normal.add(current.subtract(resampled[i - 1]).normalized());
        }
        if (i < resampled.length - 1) {
          normal = normal.add(resampled[i + 1].subtract(current).normalized());
        }
        normal = normal.normalized().rotate(0.5 * Math.PI);
        stitches.push(current.add(normal.multiply(0.5 * this.width)));
        stitches.push(current.subtract(normal.multiply(0.5 * this.width)));
      }
      return stitches;
    }
  },
};



// Code-drawn lots. Silhouettes for peeks, color once the door is open.
(function (root) {
  "use strict";

  function tone(full, color) {
    return full ? color : "#1a120c";
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function circ(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function poly(ctx, pts, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rad = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  var WOOD = "#8a5a32";
  var BRASS = "#e2b15a";
  var COPPER = "#c46b3a";
  var INK = "#241810";
  var PAPER = "#f4ecd8";
  var GLASS = "#7eb8c9";
  var GREEN = "#6ea58a";
  var RED = "#a83b32";
  var BLUE = "#3d6f8a";
  var CREAM = "#f7f1e4";

  function lantern(ctx, v, full) {
    rect(ctx, 42, 4, 16, 10, tone(full, BRASS));
    rect(ctx, 28, 14, 44, 48, tone(full, v % 2 ? "#f2d48a" : GLASS));
    rect(ctx, 36, 62, 28, 22, tone(full, COPPER));
    rect(ctx, 46, 84, 8, 12, tone(full, INK));
    if (v > 2) circ(ctx, 50, 38, 8, tone(full, CREAM));
  }

  function clock(ctx, v, full) {
    circ(ctx, 50, 42, 30, tone(full, WOOD));
    circ(ctx, 50, 42, 22, tone(full, CREAM));
    rect(ctx, 47, 22, 6, 18, tone(full, INK));
    rect(ctx, 48, 40, 16, 4, tone(full, INK));
    rect(ctx, 30, 74, 40, 16, tone(full, v > 2 ? BRASS : WOOD));
  }

  function crock(ctx, v, full) {
    poly(ctx, [30, 28, 70, 28, 78, 88, 22, 88], tone(full, "#d7c4a3"));
    rect(ctx, 26, 20, 48, 12, tone(full, BLUE));
    if (v % 2 === 0) rect(ctx, 32, 48, 36, 8, tone(full, "#3d6f8a"));
    else circ(ctx, 50, 58, 8, tone(full, BLUE));
  }

  function tool(ctx, v, full) {
    if (v % 3 === 0) {
      rect(ctx, 18, 46, 64, 8, tone(full, WOOD));
      circ(ctx, 24, 50, 10, tone(full, INK));
      circ(ctx, 76, 50, 8, tone(full, BRASS));
    } else if (v % 3 === 1) {
      poly(ctx, [20, 70, 70, 20, 80, 30, 30, 80], tone(full, "#c9ccd1"));
      rect(ctx, 18, 72, 16, 12, tone(full, WOOD));
    } else {
      rect(ctx, 42, 16, 16, 28, tone(full, WOOD));
      rect(ctx, 22, 44, 56, 28, tone(full, "#b7bcc4"));
    }
  }

  function folio(ctx, v, full) {
    rect(ctx, 22, 16, 56, 70, tone(full, PAPER));
    rect(ctx, 22, 16, 8, 70, tone(full, v > 2 ? RED : BLUE));
    rect(ctx, 36, 30, 32, 4, tone(full, INK));
    rect(ctx, 36, 40, 28, 4, tone(full, INK));
    rect(ctx, 36, 50, 24, 4, tone(full, INK));
  }

  function chart(ctx, v, full) {
    rect(ctx, 16, 20, 68, 60, tone(full, "#efe4c4"));
    circ(ctx, 48, 50, 16, tone(full, BLUE));
    circ(ctx, 48, 50, 4, tone(full, BRASS));
    if (v % 2) rect(ctx, 20, 70, 60, 4, tone(full, INK));
  }

  function tin(ctx, v, full) {
    circ(ctx, 50, 48, 26, tone(full, v % 2 ? BRASS : RED));
    circ(ctx, 50, 48, 8, tone(full, INK));
    rect(ctx, 46, 12, 8, 16, tone(full, INK));
    poly(ctx, [20, 78, 80, 78, 70, 90, 30, 90], tone(full, WOOD));
  }

  function bottle(ctx, v, full) {
    rect(ctx, 42, 8, 16, 18, tone(full, GLASS));
    poly(ctx, [34, 26, 66, 26, 74, 88, 26, 88], tone(full, v % 2 ? GREEN : GLASS));
    rect(ctx, 36, 48, 28, 16, tone(full, PAPER));
  }

  function quilt(ctx, v, full) {
    rect(ctx, 18, 22, 64, 64, tone(full, "#f0e2c8"));
    var colors = [RED, BLUE, GREEN, BRASS];
    for (var i = 0; i < 4; i++) {
      rect(ctx, 22 + (i % 2) * 28, 26 + Math.floor(i / 2) * 28, 24, 24, tone(full, colors[(i + v) % 4]));
    }
  }

  function book(ctx, v, full) {
    rect(ctx, 24, 16, 52, 70, tone(full, v % 2 ? "#7d3b32" : "#314e86"));
    rect(ctx, 30, 22, 40, 58, tone(full, PAPER));
    rect(ctx, 36, 34, 28, 4, tone(full, INK));
    rect(ctx, 36, 44, 22, 4, tone(full, INK));
  }

  function camera(ctx, v, full) {
    rect(ctx, 16, 36, 68, 40, tone(full, "#2c3338"));
    rect(ctx, 30, 24, 28, 14, tone(full, INK));
    circ(ctx, 48, 56, 14, tone(full, v > 2 ? BRASS : "#111"));
    circ(ctx, 48, 56, 6, tone(full, GLASS));
  }

  function radio(ctx, v, full) {
    rect(ctx, 16, 28, 68, 52, tone(full, WOOD));
    rect(ctx, 24, 36, 36, 28, tone(full, "#d7b48a"));
    circ(ctx, 70, 50, 8, tone(full, BRASS));
    rect(ctx, 28, 70, 44, 4, tone(full, INK));
    if (v % 2) rect(ctx, 40, 16, 6, 12, tone(full, INK));
  }

  function copper(ctx, v, full) {
    circ(ctx, 46, 58, 24, tone(full, COPPER));
    rect(ctx, 64, 40, 22, 8, tone(full, v % 2 ? WOOD : BRASS));
    circ(ctx, 46, 58, 10, tone(full, "#8a3e22"));
  }

  function lure(ctx, v, full) {
    poly(ctx, [16, 50, 40, 36, 78, 50, 40, 64], tone(full, v % 2 ? GREEN : BRASS));
    circ(ctx, 62, 50, 4, tone(full, INK));
    poly(ctx, [16, 50, 8, 40, 8, 60], tone(full, RED));
  }

  function stone(ctx, v, full) {
    var body = tone(full, "#b7b1a6");
    if (v % 3 === 1) {
      circ(ctx, 50, 34, 14, body);
      poly(ctx, [28, 48, 72, 48, 80, 86, 20, 86], body);
    } else if (v % 3 === 2) {
      poly(ctx, [20, 80, 50, 20, 80, 80], body);
    } else {
      circ(ctx, 40, 58, 22, body);
      circ(ctx, 62, 40, 12, body);
    }
  }

  function typer(ctx, v, full) {
    rect(ctx, 14, 48, 72, 28, tone(full, INK));
    rect(ctx, 24, 28, 52, 22, tone(full, PAPER));
    for (var i = 0; i < 5; i++) circ(ctx, 24 + i * 12, 64, 4, tone(full, v > 2 ? CREAM : BRASS));
  }

  function optic(ctx, v, full) {
    circ(ctx, 32, 50, 16, tone(full, INK));
    circ(ctx, 68, 50, 16, tone(full, INK));
    circ(ctx, 32, 50, 8, tone(full, GLASS));
    circ(ctx, 68, 50, 8, tone(full, GLASS));
    rect(ctx, 44, 46, 12, 8, tone(full, BRASS));
    if (v % 2) rect(ctx, 46, 22, 8, 16, tone(full, WOOD));
  }

  function music(ctx, v, full) {
    rect(ctx, 22, 36, 56, 40, tone(full, WOOD));
    rect(ctx, 28, 28, 44, 12, tone(full, v % 2 ? RED : BRASS));
    circ(ctx, 40, 56, 8, tone(full, BRASS));
    circ(ctx, 60, 56, 8, tone(full, BRASS));
  }

  function meadow(ctx, v, full) {
    if (v % 3 === 0) {
      poly(ctx, [46, 10, 54, 10, 62, 88, 38, 88], tone(full, WOOD));
    } else if (v % 3 === 1) {
      circ(ctx, 50, 50, 22, tone(full, "#c4653a"));
      rect(ctx, 18, 46, 64, 8, tone(full, CREAM));
    } else {
      poly(ctx, [30, 80, 40, 20, 50, 80], tone(full, WOOD));
      poly(ctx, [50, 80, 60, 20, 70, 80], tone(full, WOOD));
    }
  }

  function measure(ctx, v, full) {
    rect(ctx, 46, 16, 8, 28, tone(full, BRASS));
    poly(ctx, [18, 44, 46, 44, 40, 78, 16, 70], tone(full, BRASS));
    poly(ctx, [54, 44, 82, 44, 84, 70, 60, 78], tone(full, v % 2 ? COPPER : BRASS));
    rect(ctx, 20, 80, 60, 8, tone(full, WOOD));
  }

  var DRAWERS = {
    lantern: lantern,
    clock: clock,
    crock: crock,
    tool: tool,
    folio: folio,
    chart: chart,
    tin: tin,
    bottle: bottle,
    quilt: quilt,
    book: book,
    camera: camera,
    radio: radio,
    copper: copper,
    lure: lure,
    stone: stone,
    typer: typer,
    optic: optic,
    music: music,
    meadow: meadow,
    measure: measure
  };

  function drawIcon(ctx, family, variant, x, y, size, full) {
    var fn = DRAWERS[family] || lantern;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 100, size / 100);
    fn(ctx, variant || 0, full);
    ctx.restore();
  }

  function cellsFor(count, box) {
    var cols = count > 4 ? 3 : 2;
    if (count === 1) cols = 1;
    var rows = Math.ceil(count / cols);
    var out = [];
    var cw = box.w / cols;
    var ch = box.h / rows;
    for (var i = 0; i < count; i++) {
      out.push({
        x: box.x + (i % cols) * cw,
        y: box.y + Math.floor(i / cols) * ch,
        w: cw,
        h: ch
      });
    }
    return out;
  }

  function drawItemInCell(ctx, item, cell, full) {
    var size = Math.max(36, Math.min(cell.w, cell.h) - 8);
    var x = cell.x + (cell.w - size) / 2;
    var y = cell.y + (cell.h - size) / 2;
    drawIcon(ctx, item.family, item.index, x, y, size, full);
  }

  function draw(ctx, w, h, scene) {
    scene = scene || {};
    ctx.clearRect(0, 0, w, h);
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#3a2a22");
    sky.addColorStop(1, "#1a120e");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    var box = { x: 28, y: 12, w: w - 56, h: h - 24 };
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = "#4a3b30";
    ctx.fill();

    var open = Math.max(0, Math.min(1, scene.open || 0));
    var items = scene.items || [];
    var cells = cellsFor(Math.max(items.length, 1), {
      x: box.x + 8,
      y: box.y + 8,
      w: box.w - 16,
      h: box.h - 16
    });

    if (open > 0.02 && items.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x + 6, box.y + 6, box.w - 12, (box.h - 12) * open);
      ctx.clip();
      ctx.fillStyle = "#f0d7a2";
      ctx.fillRect(box.x + 6, box.y + 6, box.w - 12, box.h - 12);
      for (var i = 0; i < items.length; i++) {
        var pop = scene.pop == null ? 1 : Math.max(0, Math.min(1, (open - i * 0.08) / 0.4));
        ctx.save();
        var cell = cells[i];
        var cx = cell.x + cell.w / 2;
        var cy = cell.y + cell.h / 2;
        ctx.translate(cx, cy);
        ctx.scale(pop, pop);
        ctx.translate(-cx, -cy);
        drawItemInCell(ctx, items[i], cell, true);
        ctx.restore();
      }
      ctx.restore();
    }

    var doorH = (box.h - 10) * (1 - open);
    if (doorH > 1) {
      roundRect(ctx, box.x + 6, box.y + 6, box.w - 12, doorH, 4);
      ctx.fillStyle = "#5c5148";
      ctx.fill();
      ctx.fillStyle = "#3e342c";
      var slats = Math.max(1, Math.floor(doorH / 14));
      for (var s = 1; s < slats; s++) {
        ctx.fillRect(box.x + 10, box.y + 6 + s * (doorH / slats), box.w - 20, 2);
      }
      if (open < 0.2) {
        circ(ctx, box.x + box.w / 2, box.y + Math.min(doorH - 16, box.h * 0.62), 10, BRASS);
        circ(ctx, box.x + box.w / 2, box.y + Math.min(doorH - 16, box.h * 0.62), 4, "#2a2118");
      }
    }

    if (scene.peekOn && scene.peekIndex >= 0 && items[scene.peekIndex] && open < 0.15) {
      var cell = cells[Math.min(scene.peekIndex, cells.length - 1)];
      var px = cell.x + cell.w / 2;
      var py = cell.y + cell.h / 2;
      var radius = Math.max(cell.w, cell.h) * 0.46;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.clip();
      var glow = ctx.createRadialGradient(px, py, 4, px, py, radius);
      glow.addColorStop(0, "#ffe7a8");
      glow.addColorStop(1, "#c9a15a");
      ctx.fillStyle = glow;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      drawItemInCell(ctx, items[scene.peekIndex], cell, false);
      ctx.restore();
      ctx.strokeStyle = "rgba(255, 231, 168, 0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, radius - 1, 0, Math.PI * 2);
      ctx.stroke();
    } else if (scene.sweep && open < 0.05) {
      var ang = (scene.time || 0) / 900;
      var sx = box.x + box.w * (0.35 + 0.3 * Math.sin(ang));
      var sy = box.y + box.h * (0.4 + 0.12 * Math.cos(ang * 0.7));
      var beam = ctx.createRadialGradient(sx, sy, 4, sx, sy, 54);
      beam.addColorStop(0, "rgba(255, 231, 168, 0.55)");
      beam.addColorStop(1, "rgba(255, 231, 168, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.arc(sx, sy, 54, 0, Math.PI * 2);
      ctx.fill();
    }

    if (open > 0.82 && scene.banner) {
      ctx.fillStyle = "#1c140c";
      ctx.font = "700 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(scene.banner, w / 2, box.y + 28);
    }
  }

  root.BidwickDraw = { draw: draw, drawIcon: drawIcon };
})(typeof window !== "undefined" ? window : globalThis);

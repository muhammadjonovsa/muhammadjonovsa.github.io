/* =============================================================
   Kurry Tranzit Logist — Hero 3D scene
   Procedural trucks (curtain-side + reefer), digital globe with
   glowing routes, volumetric light and floating particles.
   No external models, no CDN — pure Three.js geometry.
   ============================================================= */
(function () {
  "use strict";

  var canvas = document.querySelector("[data-hero-canvas]");
  var miniCanvas = document.querySelector("[data-mini-canvas]");
  var fallback = document.querySelector("[data-hero-fallback]");
  var hasTHREE = typeof window.THREE !== "undefined";

  function showFallback() {
    if (fallback) fallback.hidden = false;
    if (canvas) canvas.style.visibility = "hidden";
  }

  /* -------------------------------------------------------------
     WebGL support test
  ------------------------------------------------------------- */
  function supportsWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  /* -------------------------------------------------------------
     Small helpers
  ------------------------------------------------------------- */
  var D2R = Math.PI / 180;
  var isMobile = window.matchMedia("(max-width: 900px)").matches;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* Rounded, softly bevelled box — the base building block for premium
     looking truck parts (no hard CG edges). */
  function roundedBox(w, h, d, r, seg) {
    r = Math.max(0.001, Math.min(r, w / 2 - 0.002, h / 2 - 0.002));
    seg = seg || 3;
    var bt = r * 0.42, bs = r * 0.42;
    var sw = w - 2 * bs, sh = h - 2 * bs, sd = Math.max(0.01, d - 2 * bt);
    var s = new THREE.Shape();
    var x = -sw / 2, y = -sh / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + sw - r, y);
    s.quadraticCurveTo(x + sw, y, x + sw, y + r);
    s.lineTo(x + sw, y + sh - r);
    s.quadraticCurveTo(x + sw, y + sh, x + sw - r, y + sh);
    s.lineTo(x + r, y + sh);
    s.quadraticCurveTo(x, y + sh, x, y + sh - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    var geo = new THREE.ExtrudeGeometry(s, {
      depth: sd,
      bevelEnabled: true,
      bevelThickness: bt,
      bevelSize: bs,
      bevelOffset: 0,
      bevelSegments: 2,
      curveSegments: seg
    });
    geo.center();
    geo.computeVertexNormals();
    return geo;
  }

  function canvasTexture(w, h, draw) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  function radialTexture(stops, size) {
    size = size || 256;
    return canvasTexture(size, size, function (ctx, w, h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  function latLonToVec3(lat, lon, r) {
    var phi = (90 - lat) * D2R;
    var theta = (lon + 180) * D2R;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  /* -------------------------------------------------------------
     Studio environment: painted equirect used for reflections
  ------------------------------------------------------------- */
  function buildEnvTexture() {
    return canvasTexture(1024, 512, function (ctx, w, h) {
      var sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0.00, "#050a14");
      sky.addColorStop(0.34, "#0a1729");
      sky.addColorStop(0.50, "#12263c");
      sky.addColorStop(0.56, "#081423");
      sky.addColorStop(1.00, "#02040a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // soft-box light panels (produce the long premium highlights)
      var boxes = [
        [0.18, 0.20, 0.30, 0.10, "rgba(255,255,255,0.80)"],
        [0.62, 0.15, 0.24, 0.08, "rgba(190,225,255,0.70)"],
        [0.40, 0.30, 0.34, 0.05, "rgba(120,230,255,0.34)"],
        [0.85, 0.34, 0.16, 0.06, "rgba(80,255,220,0.26)"]
      ];
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        var g = ctx.createRadialGradient(b[0] * w, b[1] * h, 0, b[0] * w, b[1] * h, b[2] * w);
        g.addColorStop(0, b[4]);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.translate(b[0] * w, b[1] * h);
        ctx.scale(1, b[3] / b[2]);
        ctx.translate(-b[0] * w, -b[1] * h);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      // horizon glow
      var hg = ctx.createLinearGradient(0, h * 0.44, 0, h * 0.58);
      hg.addColorStop(0, "rgba(0,0,0,0)");
      hg.addColorStop(0.5, "rgba(40,120,200,0.30)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hg;
      ctx.fillRect(0, h * 0.44, w, h * 0.14);
      ctx.globalCompositeOperation = "source-over";
    });
  }

  /* -------------------------------------------------------------
     Truck materials
  ------------------------------------------------------------- */
  function buildMaterials() {
    return {
      /* deep navy metallic cab paint */
      paintNavy: new THREE.MeshPhysicalMaterial({
        color: 0x1d2c4a, metalness: 0.48, roughness: 0.3,
        clearcoat: 0.8, clearcoatRoughness: 0.16, envMapIntensity: 1.3
      }),
      /* near-black graphite cab */
      paintGraphite: new THREE.MeshPhysicalMaterial({
        color: 0x1c2431, metalness: 0.55, roughness: 0.28,
        clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1.25
      }),
      /* electric-blue cab accent */
      paintBlue: new THREE.MeshPhysicalMaterial({
        color: 0x27519f, metalness: 0.45, roughness: 0.3,
        clearcoat: 0.75, clearcoatRoughness: 0.2, envMapIntensity: 1.3
      }),
      /* dark brushed aluminium (reefer body) */
      paintWhite: new THREE.MeshPhysicalMaterial({
        color: 0xaebbcb, metalness: 0.5, roughness: 0.32,
        clearcoat: 0.55, clearcoatRoughness: 0.24, envMapIntensity: 1.15
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0x060d17, metalness: 0.5, roughness: 0.05,
        envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.02
      }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xb6c4d4, metalness: 1, roughness: 0.22, envMapIntensity: 1.7 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x141c28, metalness: 0.5, roughness: 0.46, envMapIntensity: 1 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.04, roughness: 0.95 }),
      curtain: new THREE.MeshStandardMaterial({ color: 0x44526a, metalness: 0.32, roughness: 0.5, envMapIntensity: 1.15 }),
      panel: new THREE.MeshPhysicalMaterial({
        color: 0xa2afbf, metalness: 0.45, roughness: 0.34,
        clearcoat: 0.45, clearcoatRoughness: 0.26, envMapIntensity: 1.1
      }),
      accent: new THREE.MeshStandardMaterial({
        color: 0x1fd6e8, emissive: 0x0a7a8c, emissiveIntensity: 0.9,
        metalness: 0.5, roughness: 0.3
      }),
      headlight: new THREE.MeshStandardMaterial({ color: 0xeaf4ff, emissive: 0x8ec4ff, emissiveIntensity: 2.2, roughness: 0.2 }),
      tail: new THREE.MeshStandardMaterial({ color: 0xff2d55, emissive: 0xff1030, emissiveIntensity: 1.4, roughness: 0.35 }),
      marker: new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0xffa42b, emissiveIntensity: 1.2, roughness: 0.4 })
    };
  }

  /* Curtain-side fabric texture: dark graphite tarpaulin, tension seams,
     brushed rails and a cyan brand band */
  function curtainTexture() {
    return canvasTexture(512, 256, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#5f6f86");
      g.addColorStop(0.5, "#4d5c74");
      g.addColorStop(1, "#38455a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // vertical seams
      ctx.strokeStyle = "rgba(14,20,30,0.75)";
      ctx.lineWidth = 2;
      for (var x = 24; x < w; x += 42) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      // soft fabric shading
      for (var i = 0; i < 26; i++) {
        var gx = Math.random() * w;
        var lg = ctx.createLinearGradient(gx, 0, gx + 24, 0);
        lg.addColorStop(0, "rgba(255,255,255,0)");
        lg.addColorStop(0.5, "rgba(255,255,255,0.07)");
        lg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = lg;
        ctx.fillRect(gx, 0, 24, h);
      }
      // brushed aluminium top rail + bottom rail
      ctx.fillStyle = "#6b7889";
      ctx.fillRect(0, 0, w, 22);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(0, 0, w, 4);
      ctx.fillStyle = "#525e6e";
      ctx.fillRect(0, h - 16, w, 16);
      // brand band
      ctx.fillStyle = "rgba(6,12,22,0.94)";
      ctx.fillRect(0, 92, w, 54);
      ctx.fillStyle = "#1fd6e8";
      ctx.fillRect(0, 92, w, 3);
      ctx.fillStyle = "#eef6ff";
      ctx.font = "700 27px Inter, Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.letterSpacing = "6px";
      ctx.fillText("KURRY TRANZIT LOGIST", 18, 122);
    });
  }

  /* Reefer panel texture: brushed aluminium, rivets, cold-chain band */
  function reeferTexture() {
    return canvasTexture(512, 256, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#c3cedd");
      g.addColorStop(0.55, "#93a1b4");
      g.addColorStop(1, "#71809a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(40,55,80,0.4)";
      ctx.lineWidth = 2;
      for (var x = 40; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      // rivets
      ctx.fillStyle = "rgba(30,45,70,0.45)";
      for (var y = 14; y < h; y += 26) {
        for (var rx = 12; rx < w; rx += 16) { ctx.beginPath(); ctx.arc(rx, y, 1.7, 0, 6.3); ctx.fill(); }
      }
      // teal cold band
      var b = ctx.createLinearGradient(0, 96, 0, 150);
      b.addColorStop(0, "rgba(31,214,232,0.95)");
      b.addColorStop(1, "rgba(20,150,166,0.95)");
      ctx.fillStyle = b;
      ctx.fillRect(0, 96, w, 54);
      ctx.fillStyle = "#04121c";
      ctx.font = "800 24px Inter, Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("SOIQ ZAXIRASI  ·  −25°C", 16, 124);
    });
  }

  function decalTexture() {
    return canvasTexture(512, 128, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "#3b82f6");
      g.addColorStop(0.5, "#22d3ee");
      g.addColorStop(1, "#14b8a6");
      ctx.fillStyle = g;
      ctx.font = "800 62px Inter, Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("KTL", 18, 62);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "600 25px Inter, Arial, sans-serif";
      ctx.letterSpacing = "4px";
      ctx.fillText("ON TIME LOGISTICS", 150, 48);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(152, 74); ctx.lineTo(470, 74); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "500 19px Inter, Arial, sans-serif";
      ctx.fillText("INTERNATIONAL  ·  NATIONAL", 152, 96);
    });
  }

  /* -------------------------------------------------------------
     Truck construction
     X = length (front is +X) · Y = up · Z = width
  ------------------------------------------------------------- */
  function makeWheel(M, x, z) {
    var g = new THREE.Group();
    var tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.44, isMobile ? 18 : 26), M.rubber);
    tyre.rotation.x = Math.PI / 2;
    tyre.castShadow = false;
    g.add(tyre);

    var rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.46, 16), M.chrome);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);

    var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 12), M.dark);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);

    // spoke detail
    for (var i = 0; i < 5; i++) {
      var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.47), M.dark);
      spoke.rotation.z = (i / 5) * Math.PI * 2;
      g.add(spoke);
    }
    g.position.set(x, 0.56, z);
    return g;
  }

  function makeCab(M, paint) {
    var cab = new THREE.Group();

    var shell = new THREE.Mesh(roundedBox(2.5, 2.4, 2.5, 0.22, 4), paint);
    shell.position.set(4.15, 2.12, 0);
    cab.add(shell);

    // windshield (tilted back)
    var ws = new THREE.Mesh(roundedBox(0.12, 1.2, 2.16, 0.06, 3), M.glass);
    ws.position.set(5.4, 2.62, 0);
    ws.rotation.z = -0.1;
    cab.add(ws);

    // side windows
    [-1, 1].forEach(function (s) {
      var sw = new THREE.Mesh(roundedBox(1.05, 0.8, 0.08, 0.05, 3), M.glass);
      sw.position.set(4.6, 2.66, s * 1.24);
      cab.add(sw);
      // door line
      var door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.9, 0.03), M.dark);
      door.position.set(3.55, 2.0, s * 1.26);
      cab.add(door);
      // handle
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.05), M.chrome);
      h.position.set(4.1, 2.25, s * 1.28);
      cab.add(h);
      // step
      var st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.32), M.dark);
      st.position.set(4.1, 0.86, s * 1.2);
      cab.add(st);
      // mirror
      var arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), M.dark);
      arm.position.set(5.05, 2.85, s * 1.36);
      cab.add(arm);
      var mir = new THREE.Mesh(roundedBox(0.12, 0.62, 0.16, 0.05, 2), M.dark);
      mir.position.set(5.02, 2.8, s * 1.5);
      cab.add(mir);
    });

    // grille
    var grille = new THREE.Mesh(roundedBox(0.1, 0.62, 1.7, 0.04, 2), M.dark);
    grille.position.set(5.4, 1.85, 0);
    cab.add(grille);
    for (var i = 0; i < 3; i++) {
      var slat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.6), M.chrome);
      slat.position.set(5.45, 1.68 + i * 0.18, 0);
      cab.add(slat);
    }

    // headlights + fog lights
    [-1, 1].forEach(function (s) {
      var hl = new THREE.Mesh(roundedBox(0.12, 0.24, 0.46, 0.05, 2), M.headlight);
      hl.position.set(5.42, 1.5, s * 0.82);
      cab.add(hl);
      var fl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.2), M.marker);
      fl.position.set(5.44, 1.16, s * 1.02);
      cab.add(fl);
    });

    // bumper
    var bumper = new THREE.Mesh(roundedBox(0.34, 0.4, 2.5, 0.1, 3), M.chrome);
    bumper.position.set(5.46, 1.06, 0);
    cab.add(bumper);

    // roof deflector + marker lights
    var defl = new THREE.Mesh(roundedBox(1.2, 0.62, 2.36, 0.2, 4), paint);
    defl.position.set(4.05, 3.55, 0);
    cab.add(defl);
    for (var m = 0; m < 5; m++) {
      var mk = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.1), M.marker);
      mk.position.set(4.66, 3.35, -0.8 + m * 0.4);
      cab.add(mk);
    }

    return cab;
  }

  function makeChassis(M) {
    var ch = new THREE.Group();

    var rail = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.3, 0.95), M.dark);
    rail.position.set(-0.3, 0.92, 0);
    ch.add(rail);

    // side skirts
    [-1, 1].forEach(function (s) {
      var skirt = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.55, 0.07), M.dark);
      skirt.position.set(-1.6, 0.86, s * 1.28);
      ch.add(skirt);
    });

    // fifth wheel
    var fw = new THREE.Mesh(roundedBox(1.3, 0.16, 1.5, 0.06, 2), M.dark);
    fw.position.set(1.5, 1.12, 0);
    ch.add(fw);

    // fuel tanks
    [-1, 1].forEach(function (s) {
      var tank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.7, 20), M.chrome);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(2.4, 0.92, s * 1.05);
      ch.add(tank);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 10), M.dark);
      cap.position.set(2.4, 1.28, s * 1.05);
      ch.add(cap);
    });

    // exhaust
    var exh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.6, 12), M.chrome);
    exh.position.set(2.95, 1.85, -1.2);
    ch.add(exh);

    // landing gear
    [-1, 1].forEach(function (s) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.95, 10), M.chrome);
      leg.position.set(-2.0, 0.75, s * 0.95);
      ch.add(leg);
    });

    // mudflaps
    [-1, 1].forEach(function (s) {
      var flap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.55), M.rubber);
      flap.position.set(-4.1, 0.62, s * 1.1);
      ch.add(flap);
    });

    // wheels
    [4.1, -1.5, -3.05].forEach(function (x) {
      [-1, 1].forEach(function (s) { ch.add(makeWheel(M, x, s * 1.18)); });
    });

    return ch;
  }

  function makeTrailer(M, kind, tex, decal) {
    var tr = new THREE.Group();
    var bodyLen = 6.5, bodyH = 2.6, bodyW = 2.56;
    var cx = -4.65, cy = 2.5;

    var bodyMat = M.curtain.clone();
    if (tex) { bodyMat.map = tex; bodyMat.needsUpdate = true; }
    var body = new THREE.Mesh(roundedBox(bodyLen, bodyH, bodyW, 0.08, 2), bodyMat);
    body.position.set(cx, cy, 0);
    tr.add(body);

    // top + bottom rails
    var top = new THREE.Mesh(new THREE.BoxGeometry(bodyLen + 0.04, 0.14, bodyW + 0.04), M.chrome);
    top.position.set(cx, cy + bodyH / 2 + 0.02, 0);
    tr.add(top);
    var bot = new THREE.Mesh(new THREE.BoxGeometry(bodyLen + 0.04, 0.22, bodyW + 0.04), M.dark);
    bot.position.set(cx, cy - bodyH / 2 - 0.02, 0);
    tr.add(bot);

    // roof bows (curtain-side) or rivet line (reefer)
    var bowCount = isMobile ? 7 : 9;
    for (var i = 0; i < bowCount; i++) {
      var bow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, bodyW + 0.02), M.chrome);
      bow.position.set(cx - bodyLen / 2 + 0.35 + i * ((bodyLen - 0.7) / (bowCount - 1)), cy + bodyH / 2 + 0.09, 0);
      tr.add(bow);
    }

    // side accent stripes
    [-1, 1].forEach(function (s) {
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(bodyLen - 0.2, 0.09, 0.03), M.accent);
      stripe.position.set(cx, cy - 0.78, s * (bodyW / 2 + 0.01));
      tr.add(stripe);
      var stripe2 = new THREE.Mesh(new THREE.BoxGeometry(bodyLen - 0.2, 0.04, 0.03), M.chrome);
      stripe2.position.set(cx, cy - 0.62, s * (bodyW / 2 + 0.01));
      tr.add(stripe2);
    });

    // brand decal
    [-1, 1].forEach(function (s) {
      var d = new THREE.Mesh(
        new THREE.PlaneGeometry(2.9, 0.72),
        new THREE.MeshBasicMaterial({ map: decal, transparent: true, depthWrite: false, opacity: 0.98 })
      );
      d.position.set(cx + 0.4, cy + 0.78, s * (bodyW / 2 + 0.03));
      d.rotation.y = s > 0 ? 0 : Math.PI;
      d.renderOrder = 2;
      tr.add(d);
    });

    // rear doors
    [-1, 1].forEach(function (s) {
      var door = new THREE.Mesh(roundedBox(0.08, bodyH - 0.2, bodyW / 2 - 0.06, 0.05, 2), kind === "reefer" ? M.panel : M.curtain);
      door.position.set(cx - bodyLen / 2 - 0.04, cy, s * (bodyW / 4 - 0.02));
      tr.add(door);
    });
    for (var h = 0; h < 6; h++) {
      var hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, bodyH - 0.24, 8), M.chrome);
      hinge.position.set(cx - bodyLen / 2 - 0.09, cy, -1.1 + h * 0.44);
      tr.add(hinge);
    }
    // rear underrun bar + lights
    var bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, bodyW - 0.1), M.chrome);
    bar.position.set(cx - bodyLen / 2 - 0.06, 0.62, 0);
    tr.add(bar);
    [-1, 1].forEach(function (s) {
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.2), M.tail);
      tl.position.set(cx - bodyLen / 2 - 0.09, 1.05, s * 1.0);
      tr.add(tl);
    });

    if (kind === "reefer") {
      // refrigeration unit on the front wall
      var unit = new THREE.Mesh(roundedBox(1.0, 1.25, 2.3, 0.08, 2), M.panel);
      unit.position.set(cx + bodyLen / 2 + 0.5, cy + 0.5, 0);
      tr.add(unit);
      var vent = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 1.6), M.dark);
      vent.position.set(cx + bodyLen / 2 + 1.0, cy + 0.5, 0);
      tr.add(vent);
      for (var v = 0; v < 5; v++) {
        var fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.55), M.chrome);
        fin.position.set(cx + bodyLen / 2 + 1.02, cy + 0.18 + v * 0.16, 0);
        tr.add(fin);
      }
      var badge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.5), M.accent);
      badge.position.set(cx + bodyLen / 2 + 1.03, cy + 1.0, 0.85);
      tr.add(badge);
    } else {
      // curtain tension straps
      var strapMat = M.dark;
      for (var t = 0; t < 4; t++) {
        [-1, 1].forEach(function (s) {
          var strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, bodyH - 0.3, 0.03), strapMat);
          strap.position.set(cx - 2.4 + t * 1.55, cy, s * (bodyW / 2 + 0.02));
          tr.add(strap);
        });
      }
    }

    return tr;
  }

  function makeTruck(M, kind, cabPaintKey) {
    var g = new THREE.Group();
    var cabPaint = M[cabPaintKey || (kind === "reefer" ? "paintBlue" : "paintNavy")];
    var decal = decalCache || (decalCache = decalTexture());

    g.add(makeChassis(M));
    g.add(makeCab(M, cabPaint));
    g.add(makeTrailer(M, kind, kind === "reefer" ? (reeferTexCache || (reeferTexCache = reeferTexture())) : (curtainTexCache || (curtainTexCache = curtainTexture())), decal));
    return g;
  }

  var decalCache = null, curtainTexCache = null, reeferTexCache = null;

  /* -------------------------------------------------------------
     Digital globe + glowing routes
  ------------------------------------------------------------- */
  var CITIES = [
    [41.3, 69.2], [55.7, 37.6], [25.2, 55.3], [41.0, 28.9],
    [39.9, 116.4], [43.2, 76.9], [40.4, 49.9], [28.6, 77.2],
    [53.5, 10.0], [31.2, 121.5]
  ];

  function buildGlobe(R) {
    var group = new THREE.Group();
    var light = new THREE.Vector3(0.6, 0.45, 0.65).normalize();

    // dot matrix shell
    var pos = [], col = [], step = 6;
    for (var lat = -84; lat <= 84; lat += step) {
      for (var lon = -180; lon < 180; lon += step) {
        var p = latLonToVec3(lat, lon, R);
        var shade = clamp(p.clone().normalize().dot(light), -1, 1) * 0.5 + 0.5;
        var b = 0.3 + Math.pow(shade, 1.4) * 1.15;
        pos.push(p.x, p.y, p.z);
        col.push(0.24 * b, 0.68 * b, 1.0 * b);
      }
    }
    var gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    gGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    var dots = new THREE.Points(gGeo, new THREE.PointsMaterial({
      size: 0.14, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending, map: dotTexture()
    }));
    group.add(dots);

    // faint wire shell
    var wire = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.005, isMobile ? 20 : 32, isMobile ? 12 : 20),
      new THREE.MeshBasicMaterial({ color: 0x2a7fd4, wireframe: true, transparent: true, opacity: 0.1, depthWrite: false })
    );
    group.add(wire);

    // HUD rings
    [1.14, 1.3].forEach(function (k, i) {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(R * k, 0.014, 6, 96),
        new THREE.MeshBasicMaterial({
          color: i ? 0x14b8a6 : 0x3b82f6, transparent: true,
          opacity: i ? 0.4 : 0.5, depthWrite: false, blending: THREE.AdditiveBlending
        })
      );
      ring.rotation.x = Math.PI / 2 + (i ? 0.22 : -0.14);
      group.add(ring);
    });

    // routes from Tashkent
    var pulses = [];
    var origin = CITIES[0];
    for (var c = 1; c < CITIES.length; c++) {
      var a = latLonToVec3(origin[0], origin[1], R * 1.001);
      var b = latLonToVec3(CITIES[c][0], CITIES[c][1], R * 1.001);
      var mid = a.clone().add(b).multiplyScalar(0.5);
      mid.setLength(R * (1.12 + a.distanceTo(b) * 0.00006));
      var curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      var tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, isMobile ? 24 : 44, 0.02, 5, false),
        new THREE.MeshBasicMaterial({
          color: 0x45e2f7, transparent: true, opacity: 0.55,
          depthWrite: false, blending: THREE.AdditiveBlending
        })
      );
      group.add(tube);

      var nodeA = nodeAt(a, 0x22d3ee, 0.075);
      var nodeB = nodeAt(b, 0x7ef0ff, 0.06);
      group.add(nodeA, nodeB);

      var pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xd9fbff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      group.add(pulse);
      pulses.push({ mesh: pulse, curve: curve, offset: c * 0.19 });
    }

    return { group: group, pulses: pulses, dots: dots, wire: wire };
  }

  function nodeAt(v, color, size) {
    var m = new THREE.Mesh(
      new THREE.SphereGeometry(size, 10, 10),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.position.copy(v);
    return m;
  }

  var dotTexCache = null;
  function dotTexture() {
    return dotTexCache || (dotTexCache = radialTexture([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,0.55)"], [1, "rgba(255,255,255,0)"]], 64));
  }

  /* -------------------------------------------------------------
     Hero scene
  ------------------------------------------------------------- */
  function initHero() {
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: !isMobile, alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05080f, 0.014);

    var camera = new THREE.PerspectiveCamera(31, 1, 0.1, 200);
    camera.position.set(0, 1.4, 23);
    camera.lookAt(0, 0.6, 0);

    // reflections
    var pmrem = new THREE.PMREMGenerator(renderer);
    var envSrc = buildEnvTexture();
    var envRT = pmrem.fromEquirectangular(envSrc);
    scene.environment = envRT.texture;
    envSrc.dispose();
    pmrem.dispose();

    /* --- lights --- */
    scene.add(new THREE.HemisphereLight(0x8fc2f0, 0x060b14, 0.42));
    var key = new THREE.DirectionalLight(0xffffff, 1.18);
    key.position.set(7, 11, 9);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x49c8ff, 1.15);
    rim.position.set(-9, 4, -7);
    scene.add(rim);
    var rimWarm = new THREE.DirectionalLight(0x14b8a6, 0.6);
    rimWarm.position.set(2, -4, 8);
    scene.add(rimWarm);
    var glowBlue = new THREE.PointLight(0x2f6bff, 10, 24, 2);
    glowBlue.position.set(-6, 1.5, 6);
    scene.add(glowBlue);
    var glowTeal = new THREE.PointLight(0x22d3ee, 9, 22, 2);
    glowTeal.position.set(7, 0.5, -3);
    scene.add(glowTeal);
    // back light for silhouette separation
    var back = new THREE.PointLight(0x7ef0ff, 14, 26, 2);
    back.position.set(1, 3.5, -9);
    scene.add(back);

    /* --- floor --- */
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 60),
      new THREE.MeshStandardMaterial({ color: 0x04070d, metalness: 0.7, roughness: 0.5, envMapIntensity: 0.35 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.55;
    scene.add(floor);

    var poolTex = radialTexture([[0, "rgba(60,140,255,0.3)"], [0.5, "rgba(30,90,180,0.08)"], [1, "rgba(0,0,0,0)"]], 256);
    var pool = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -1.52;
    scene.add(pool);

    /* --- soft contact shadows under the trucks --- */
    var shadowTex = radialTexture([[0, "rgba(0,0,0,0.9)"], [0.45, "rgba(0,0,0,0.4)"], [1, "rgba(0,0,0,0)"]], 256);
    function contactShadow(w, d) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9 })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = -1.5;
      return m;
    }

    /* --- volumetric light planes --- */
    var volTex = radialTexture([[0, "rgba(150,215,255,0.30)"], [0.5, "rgba(90,170,255,0.08)"], [1, "rgba(0,0,0,0)"]], 256);
    function volume(x, y, z, s, color, opacity) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(s, s),
        new THREE.MeshBasicMaterial({ map: volTex, color: color, transparent: true, opacity: opacity, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      m.position.set(x, y, z);
      return m;
    }
    var vol1 = volume(-8, 3, -6, 22, 0x3b82f6, 0.28);
    var vol2 = volume(10, 1, 2, 18, 0x14b8a6, 0.2);
    var vol3 = volume(1, 6, -15, 26, 0x22d3ee, 0.14);
    scene.add(vol1, vol2, vol3);

    /* --- particles --- */
    var pCount = isMobile ? 380 : 900;
    var pPos = new Float32Array(pCount * 3);
    for (var i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 46;
      pPos[i * 3 + 1] = (Math.random() - 0.3) * 20;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 30 - 4;
    }
    var pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    var particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.085, sizeAttenuation: true, color: 0x9fd8ff, transparent: true,
      opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, map: dotTexture()
    }));
    scene.add(particles);

    /* --- globe --- */
    var globe = buildGlobe(isMobile ? 5.2 : 6.1);
    globe.group.position.set(1.5, 2.2, -17);
    globe.group.rotation.z = 0.22;
    scene.add(globe.group);

    /* --- trucks --- */
    var M = buildMaterials();
    var trucks = [];

    var hero = new THREE.Group();
    scene.add(hero);

    function addTruck(kind, cfg) {
      var t = makeTruck(M, kind, cfg.cab);
      t.position.set(cfg.x, cfg.y, cfg.z);
      t.rotation.set(cfg.rx || 0, cfg.ry, cfg.rz || 0);
      t.scale.setScalar(cfg.s);
      var sh = contactShadow(9 * cfg.s, 4.4 * cfg.s);
      sh.position.x = cfg.x;
      sh.position.z = cfg.z;
      scene.add(sh);
      hero.add(t);
      var entry = { obj: t, shadow: sh, base: cfg, phase: Math.random() * Math.PI * 2, spin: cfg.spin || 1 };
      trucks.push(entry);
      return entry;
    }

    addTruck("curtain", { x: 1.2, y: -0.15, z: 0, s: 0.86, ry: -0.4, rz: 0.02, spin: 0.5, cab: "paintNavy" });
    addTruck("reefer", { x: 6.9, y: 0.45, z: -3.2, s: 0.66, ry: 0.55, rz: -0.03, spin: -0.62, cab: "paintGraphite" });
    addTruck("curtain", { x: -5.2, y: 1.05, z: -4.4, s: 0.55, ry: 0.95, rz: 0.04, spin: 0.75, cab: "paintBlue" });

    /* --- sizing --- */
    function resize() {
      var r = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width));
      var h = Math.max(1, Math.round(r.height));
      var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.4 : 1.9);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // keep the trucks framed on narrow / short screens
      var ar = w / h;
      camera.position.z = ar < 1 ? 23 + (1 - ar) * 13 : 23;
      // on wide screens push the fleet to the right, clear of the copy
      hero.position.x = ar > 1.35 ? 2.2 : 0;
      camera.updateProjectionMatrix();
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener("resize", resize);

    /* --- interaction --- */
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    if (!isMobile && !reduced) {
      window.addEventListener("pointermove", function (e) {
        pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
        pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });
    }

    /* --- scroll link: trucks lift away as the hero scrolls out --- */
    var scrollP = 0;
    var heroEl = canvas.closest(".hero");
    function onScroll() {
      if (!heroEl) return;
      var h = heroEl.offsetHeight || window.innerHeight;
      scrollP = clamp(window.scrollY / h, 0, 1);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    /* --- loop --- */
    var visible = true;
    var t0 = performance.now();
    function frame(now) {
      var time = (now - t0) * 0.001;

      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;

      hero.rotation.y = time * 0.035 + pointer.x * 0.16;
      hero.position.y = -scrollP * 5.2;
      hero.position.z = scrollP * 2.4;

      camera.position.x = pointer.x * 1.5;
      camera.position.y = 1.4 - pointer.y * 0.85;
      camera.lookAt(hero.position.x * 0.6, 0.6 - scrollP * 2.2, 0);

      for (var i = 0; i < trucks.length; i++) {
        var t = trucks[i];
        var b = t.base;
        t.obj.position.y = b.y + Math.sin(time * 0.55 + t.phase) * 0.19;
        t.obj.rotation.y = b.ry + time * 0.055 * t.spin + Math.sin(time * 0.3 + t.phase) * 0.05;
        t.obj.rotation.z = (b.rz || 0) + Math.cos(time * 0.42 + t.phase) * 0.022;
        t.obj.rotation.x = Math.sin(time * 0.34 + t.phase * 1.3) * 0.018;
        t.shadow.position.y = -1.5 - scrollP * 5.2;
        t.shadow.material.opacity = 0.85 * (1 - scrollP * 0.7);
      }

      globe.group.rotation.y = time * 0.035;
      globe.group.position.y = 2.2 + Math.sin(time * 0.28) * 0.35 - scrollP * 3;

      for (var p = 0; p < globe.pulses.length; p++) {
        var pl = globe.pulses[p];
        var u = (time * 0.11 + pl.offset) % 1;
        pl.curve.getPoint(u, pl.mesh.position);
        pl.mesh.material.opacity = 0.35 + 0.6 * Math.sin(u * Math.PI);
      }

      particles.rotation.y = time * 0.012;
      particles.position.y = Math.sin(time * 0.18) * 0.5;
      vol1.position.x = -7 + Math.sin(time * 0.12) * 1.6;
      vol2.position.x = 9 + Math.cos(time * 0.1) * 1.8;

      renderer.render(scene, camera);
      if (window.__ktlHeroReady !== true) {
        window.__ktlHeroReady = true;
        window.__ktlHeroInfo = {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles
        };
        document.documentElement.classList.add("hero-ready");
      }
    }

    function loop() { frame(performance.now()); }

    if (reduced) {
      frame(performance.now());
    } else {
      renderer.setAnimationLoop(loop);
    }

    // stop rendering when the hero is off-screen or the tab is hidden
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var next = en.isIntersecting && !document.hidden;
          if (next === visible) return;
          visible = next;
          if (visible && !reduced) renderer.setAnimationLoop(loop);
        });
      }, { threshold: 0 }).observe(canvas);
    }
    document.addEventListener("visibilitychange", function () {
      visible = !document.hidden && (heroEl ? heroEl.getBoundingClientRect().bottom > 0 : true);
      if (visible && !reduced) renderer.setAnimationLoop(loop);
    });
  }

  /* -------------------------------------------------------------
     Small rotating truck inside the About section
  ------------------------------------------------------------- */
  function initMini() {
    var el = miniCanvas;
    var rect = el.getBoundingClientRect();
    if (!rect.width) return;

    var renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 1.1, 15);
    camera.lookAt(0, 0.8, 0);

    var pmrem = new THREE.PMREMGenerator(renderer);
    var env = buildEnvTexture();
    scene.environment = pmrem.fromEquirectangular(env).texture;
    env.dispose();
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0x9fd0ff, 0x0a1424, 0.6));
    var k = new THREE.DirectionalLight(0xffffff, 1.6);
    k.position.set(5, 8, 7);
    scene.add(k);
    var r = new THREE.DirectionalLight(0x4cc9ff, 1.1);
    r.position.set(-7, 2, -5);
    scene.add(r);
    var p = new THREE.PointLight(0x22d3ee, 12, 20, 2);
    p.position.set(2, -1, 5);
    scene.add(p);

    var M = buildMaterials();
    var truck = makeTruck(M, "curtain");
    truck.scale.setScalar(0.92);
    truck.rotation.y = -0.5;
    scene.add(truck);

    var shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 4),
      new THREE.MeshBasicMaterial({
        map: radialTexture([[0, "rgba(0,0,0,0.8)"], [0.5, "rgba(0,0,0,0.28)"], [1, "rgba(0,0,0,0)"]], 128),
        transparent: true, depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.5;
    scene.add(shadow);

    function resize() {
      var b = el.getBoundingClientRect();
      if (!b.width) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      renderer.setSize(Math.round(b.width), Math.round(b.height), false);
      camera.aspect = b.width / b.height;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    var visible = true;
    function frame(now) {
      var t = now * 0.001;
      truck.rotation.y = -0.5 + t * 0.22;
      truck.position.y = Math.sin(t * 0.7) * 0.13;
      truck.rotation.z = Math.sin(t * 0.5) * 0.02;
      renderer.render(scene, camera);
    }
    if (reduced) frame(performance.now());
    else renderer.setAnimationLoop(frame);

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var next = e.isIntersecting && !document.hidden;
          if (next === visible) return;
          visible = next;
          if (visible && !reduced) renderer.setAnimationLoop(frame);
        });
      }, { threshold: 0 }).observe(el);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      visible = true;
      if (!reduced) renderer.setAnimationLoop(frame);
    });
  }

  /* -------------------------------------------------------------
     Boot (runs last so every declaration above is initialised)
  ------------------------------------------------------------- */
  if (!hasTHREE || !supportsWebGL()) {
    showFallback();
  } else {
    if (canvas) {
      try { initHero(); }
      catch (err) { console.warn("[KTL] 3D init failed: " + ((err && err.stack) || err)); showFallback(); }
    }
    if (miniCanvas) {
      try { initMini(); }
      catch (err) { console.warn("[KTL] preview failed: " + ((err && err.stack) || err)); }
    }
  }
})();

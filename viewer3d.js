/* Smartech Coifas — viewer3d.js
 * Visualizador 3D (three.js) do hero e do showroom.
 *
 * Boas práticas aplicadas:
 *  - three.js só é baixado quando necessário (idle após o load / seção perto da tela / clique em "Ativar 3D").
 *  - Um único download serve os dois visualizadores; cada um pausa fora da tela e com a aba oculta.
 *  - Sem WebGL, com economia de dados ou com falha de rede: fica a ilustração (poster) e uma mensagem.
 *  - Iluminação por mapa de ambiente (PMREM) → inox com reflexo real, sem lâmpadas pesadas.
 *  - Troca de modelo libera geometrias e materiais (sem vazamento de memória na GPU).
 *  - Raio-X, UV-C, vista explodida e câmera usam interpolação por quadro (sem reconstruir o modelo).
 *  - Arrastar na horizontal gira; arrastar na vertical rola a página (touch-action: pan-y).
 */
(function () {
  'use strict';

  var doc = document;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var XRAY_OPACITY = 0.35;
  var XRAY_RATE = 15;

  var SRC = {
    three: {
      url: 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
      integrity: 'sha384-vV17nr/rMaJqmeZkFUzXLpHdQ+ME5QHKdydaqqN+3Ga39RJlNrTatJxHwGV4ml2C'
    },
    orbit: {
      url: 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js',
      integrity: 'sha384-I0DMsfimAPIqWT8lF+oA997gRgdUi3jhidoTq3fN0zmn35smXZukD01FLnsPRU9i'
    }
  };

  var MODELS = {
    1: {
      label: 'Coifa de parede UV-C',
      specs: [['Material', 'Aço inox AISI 304 escovado'], ['Filtros', 'Baffle inerciais, laváveis'], ['Tecnologia UV-C', 'Lâmpadas tubulares 254 nm / 185 nm'], ['Instalação', 'Encostada na parede']]
    },
    2: {
      label: 'Sistema de exaustão completo',
      specs: [['Conjunto', 'Coifa + dutos + caixa exaustora'], ['Exaustor', 'Centrífugo, dimensionado em projeto'], ['Dutos', 'Rota e diâmetro conforme projeto'], ['Tecnologia UV-C', 'Módulo instalado na coifa']]
    },
    3: {
      label: 'Coifa central de ilha',
      specs: [['Material', 'Aço inox AISI 304 escovado'], ['Filtros', 'Baffle defletores duplos'], ['Captação', '4 faces abertas'], ['Instalação', 'Central, suspensa sobre a ilha']]
    }
  };

  /* ====================================================================== */
  /* Carregamento                                                            */
  /* ====================================================================== */

  var threePromise = null;

  function loadScript(item) {
    return new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = item.url;
      s.integrity = item.integrity;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Falha ao carregar ' + item.url)); };
      doc.head.appendChild(s);
    });
  }

  function loadThree() {
    if (window.THREE && window.THREE.OrbitControls) return Promise.resolve();
    if (!threePromise) {
      threePromise = loadScript(SRC.three).then(function () { return loadScript(SRC.orbit); }).catch(function (err) {
        threePromise = null;     // permite tentar de novo
        throw err;
      });
    }
    return threePromise;
  }

  function webglSupported() {
    try {
      var c = doc.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return false;
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (e) { return false; }
  }

  function saveData() {
    var c = navigator.connection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
  }

  /* ====================================================================== */
  /* Utilitários 3D                                                          */
  /* ====================================================================== */

  function disposeObject(obj) {
    obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); });
    });
  }

  function radialTexture(THREE, stops) {
    var c = doc.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    return t;
  }

  function makeMaterials(THREE, tex) {
    function steel(color, rough) { return new THREE.MeshStandardMaterial({ color: color, metalness: 0.92, roughness: rough }); }
    var M = {
      shell: steel(0xc9d1d5, 0.34),
      shellDark: steel(0xa3adb3, 0.4),
      filter: new THREE.MeshStandardMaterial({ color: 0x7b8991, metalness: 0.85, roughness: 0.38 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x232b2f, metalness: 0.6, roughness: 0.5 }),
      fan: new THREE.MeshStandardMaterial({ color: 0x3a4247, metalness: 0.75, roughness: 0.38 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xfad514, metalness: 0.9, roughness: 0.28, emissive: 0x4a3c00, emissiveIntensity: 0.5 }),
      tube: new THREE.MeshStandardMaterial({ color: 0x6c7480, metalness: 0.2, roughness: 0.25, emissive: 0x9a86ff, emissiveIntensity: 0 }),
      glowTex: tex
    };
    M.shell.userData.shell = true;
    M.shellDark.userData.shell = true;
    return M;
  }

  function mesh(THREE, geo, mat, x, y, z) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }
  function box(THREE, w, h, d, mat, x, y, z) { return mesh(THREE, new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
  function cyl(THREE, rt, rb, h, seg, mat, x, y, z) { return mesh(THREE, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z); }

  /** Cassete de filtro baffle (moldura + palhetas inclinadas). */
  function cassette(THREE, M, w, d) {
    var g = new THREE.Group();
    var t = 0.03;
    g.add(box(THREE, w, 0.03, t, M.filter, 0, 0, -d / 2 + t / 2));
    g.add(box(THREE, w, 0.03, t, M.filter, 0, 0, d / 2 - t / 2));
    g.add(box(THREE, t, 0.03, d, M.filter, -w / 2 + t / 2, 0, 0));
    g.add(box(THREE, t, 0.03, d, M.filter, w / 2 - t / 2, 0, 0));
    var n = Math.max(5, Math.round(d / 0.11));
    var pitch = (d - 2 * t) / n;
    for (var i = 0; i < n; i++) {
      var slat = box(THREE, w - 2 * t, 0.07, 0.012, M.filter, 0, 0, -d / 2 + t + (i + 0.5) * pitch);
      slat.rotation.x = 0.55;
      g.add(slat);
    }
    return g;
  }

  function uvTube(THREE, M, len, x, y, z, model) {
    var g = new THREE.Group();
    var tube = mesh(THREE, new THREE.CylinderGeometry(0.035, 0.035, len, 20), M.tube, x, y, z);
    tube.rotation.z = Math.PI / 2;
    g.add(tube);
    [-1, 1].forEach(function (s) {
      var cap = cyl(THREE, 0.05, 0.05, 0.06, 16, M.dark, x + s * (len / 2 + 0.02), y, z);
      cap.rotation.z = Math.PI / 2;
      g.add(cap);
    });
    var light = new THREE.PointLight(0x9a86ff, 0, 3.4, 2);
    light.position.set(x, y, z);
    g.add(light);
    model.uvLights.push(light);
    return g;
  }

  function newModel(THREE) {
    return { group: new THREE.Group(), parts: [], uvLights: [], glow: null, smoke: null, shellMats: [], tubeMat: null };
  }
  function addPart(model, container, obj, ex, ey, ez) {
    var THREE = window.THREE;
    container.add(obj);
    obj.userData.explode = new THREE.Vector3(ex, ey, ez);
    model.parts.push(obj);
    return obj;
  }

  /* ---------------- Modelo 1: coifa de parede ---------------- */
  function buildHood(THREE, M, opts) {
    opts = opts || {};
    var model = newModel(THREE);
    model.tubeMat = M.tube;
    var W = 3.0, D = 1.2, H = 0.75, T = 0.04;
    var pivot = new THREE.Group();
    pivot.position.z = -D / 2;            // centraliza a profundidade na origem
    model.group.add(pivot);

    addPart(model, pivot, box(THREE, W, H, T, M.shell, 0, H / 2, T / 2), 0, 0.1, -0.9);                    // fundo
    addPart(model, pivot, box(THREE, W, T, 0.52, M.shell, 0, H - T / 2, 0.3), 0, 1.0, 0);                  // tampo
    var slope = box(THREE, W, T, Math.hypot(D - 0.56, H - 0.24), M.shell, 0, (H + 0.24) / 2, (0.56 + D) / 2);
    slope.rotation.x = Math.atan2(H - 0.24, D - 0.56);                                                       // frente inclinada
    addPart(model, pivot, slope, 0, 0.55, 0.55);
    addPart(model, pivot, box(THREE, W, 0.24, T, M.shell, 0, 0.12, D - T / 2), 0, -0.1, 0.9);              // testa frontal
    addPart(model, pivot, box(THREE, W + 0.02, 0.035, 0.08, M.gold, 0, 0.0175, D - 0.04), 0, -0.28, 0.9);  // friso dourado

    var shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(D, 0); shape.lineTo(D, 0.24); shape.lineTo(0.56, H); shape.lineTo(0, H); shape.lineTo(0, 0);
    var sideGeo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    sideGeo.rotateY(-Math.PI / 2);                                  // (x,y,z) → (-z,y,x): profundidade vira eixo Z
    var left = mesh(THREE, sideGeo, M.shellDark, -W / 2 + T, 0, 0);
    var right = mesh(THREE, sideGeo, M.shellDark, W / 2, 0, 0);
    addPart(model, pivot, left, -0.9, 0, 0);
    addPart(model, pivot, right, 0.9, 0, 0);

    var collar = new THREE.Group();
    collar.position.set(0, H, 0.3);
    collar.add(cyl(THREE, 0.27, 0.27, 0.38, 40, M.shell, 0, 0.19, 0));
    collar.add(cyl(THREE, 0.34, 0.34, 0.04, 40, M.shell, 0, 0.02, 0));
    collar.add(cyl(THREE, 0.285, 0.285, 0.03, 40, M.gold, 0, 0.26, 0));
    addPart(model, pivot, collar, 0, 1.25, 0);

    var filters = new THREE.Group();
    var cassW = (W - 2 * T - 0.06) / 4;
    for (var c = 0; c < 4; c++) {
      var cass = cassette(THREE, M, cassW - 0.02, 0.9);
      cass.position.set(-W / 2 + T + 0.03 + cassW * (c + 0.5), 0.1, 0.62);
      filters.add(cass);
    }
    addPart(model, pivot, filters, 0, -0.9, 0.1);

    var uv = new THREE.Group();
    [0.38, 0.72].forEach(function (z) { uv.add(uvTube(THREE, M, W - 0.5, 0, 0.42, z, model)); });
    addPart(model, pivot, uv, 0, 0.45, 0);

    var glow = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.4, D - 0.1),
      new THREE.MeshBasicMaterial({ map: M.glowTex, color: 0xb7a8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, -0.02, 0.6);
    pivot.add(glow);
    model.glow = glow;

    // fogão / chapa embaixo (contexto da captação)
    var cook = new THREE.Group();
    cook.position.y = -1.3;
    cook.add(box(THREE, W - 0.3, 0.14, 0.95, M.dark, 0, 0, 0));
    cook.add(box(THREE, W - 0.28, 0.02, 0.97, M.gold, 0, 0.08, 0));
    [-0.9, -0.3, 0.3, 0.9].forEach(function (x) { cook.add(cyl(THREE, 0.17, 0.17, 0.02, 28, M.filter, x, 0.085, 0)); });
    model.group.add(cook);

    model.smoke = { cx: 0, cz: 0, hw: W / 2 - 0.45, hd: 0.3, y0: -1.15, yFilter: 0.08, yTop: H + 0.55, collarX: 0, collarZ: -0.3 };
    return model;
  }

  /* ---------------- Modelo 2: sistema completo ---------------- */
  function buildSystem(THREE, M) {
    var model = newModel(THREE);
    var hood = buildHood(THREE, M);
    var s = 0.6;
    hood.group.scale.setScalar(s);
    hood.group.position.set(-2.0, -0.2, 0.18);    // colar do duto em x = -2, z = 0
    model.group.add(hood.group);
    model.parts = model.parts.concat(hood.parts);
    model.uvLights = hood.uvLights;
    model.glow = hood.glow;
    model.tubeMat = hood.tubeMat;

    var topY = -0.2 + (0.75 + 0.38) * s;          // topo do colar
    var r = 0.165;
    var hy = topY + 1.25;                          // altura do trecho horizontal

    var vDuct = cyl(THREE, r, r, 1.25, 36, M.shell, -2.0, topY + 0.625, 0);
    addPart(model, model.group, vDuct, 0, 0.5, 0);
    var elbow = mesh(THREE, new THREE.SphereGeometry(r * 1.02, 32, 24), M.shell, -2.0, hy, 0);
    addPart(model, model.group, elbow, 0, 0.8, 0);
    var hDuct = cyl(THREE, r, r, 2.75, 36, M.shell, -0.625, hy, 0);
    hDuct.rotation.z = Math.PI / 2;
    addPart(model, model.group, hDuct, 0.1, 0.8, 0);

    [[-2.0, topY + 0.02, 0, false], [-2.0, topY + 1.0, 0, false], [-0.2, hy, 0, true], [0.72, hy, 0, true]].forEach(function (p) {
      var ring = cyl(THREE, r + 0.045, r + 0.045, 0.05, 36, M.gold, p[0], p[1], p[2]);
      if (p[3]) ring.rotation.z = Math.PI / 2;
      model.group.add(ring);
    });

    // caixa exaustora centrífuga
    var fan = new THREE.Group();
    fan.position.set(1.45, hy, 0);
    var housing = cyl(THREE, 0.62, 0.62, 0.55, 56, M.fan, 0, 0, 0);
    housing.rotation.x = Math.PI / 2;
    fan.add(housing);
    [-0.275, 0.275].forEach(function (z) {
      fan.add(mesh(THREE, new THREE.TorusGeometry(0.62, 0.03, 12, 64), M.gold, 0, 0, z));   // aro dourado (eixo Z)
    });
    fan.add(box(THREE, 0.5, 0.62, 0.5, M.fan, 0.3, 0.62, 0));
    fan.add(box(THREE, 0.56, 0.04, 0.56, M.gold, 0.3, 0.94, 0));
    fan.add(box(THREE, 1.05, 0.08, 0.95, M.dark, 0, -0.68, -0.1));
    addPart(model, model.group, fan, 1.0, 0.25, 0);

    var motor = new THREE.Group();
    motor.position.set(1.45, hy, -0.66);
    var body = cyl(THREE, 0.27, 0.27, 0.55, 40, M.fan, 0, 0, 0);
    body.rotation.x = Math.PI / 2;
    motor.add(body);
    for (var i = 0; i < 5; i++) {
      var fin = cyl(THREE, 0.295, 0.295, 0.018, 40, M.filter, 0, 0, -0.2 + i * 0.1);
      fin.rotation.x = Math.PI / 2;
      motor.add(fin);
    }
    addPart(model, model.group, motor, 0, 0, -0.9);

    var cx = -2.0, hw = (3.0 / 2 - 0.45) * s;
    model.smoke = { cx: cx, cz: 0, hw: hw, hd: 0.16, y0: -0.95, yFilter: -0.14, yTop: topY + 0.5, collarX: cx, collarZ: 0 };
    return model;
  }

  /* ---------------- Modelo 3: coifa de ilha ---------------- */
  function buildIsland(THREE, M) {
    var model = newModel(THREE);
    model.tubeMat = M.tube;
    var H = 0.75;
    var shellDS = M.shell.clone();
    shellDS.side = THREE.DoubleSide;
    shellDS.userData.shell = true;

    var frustumGeo = new THREE.CylinderGeometry(0.423, 1, H, 4, 1, true);
    frustumGeo.rotateY(Math.PI / 4);
    var canopy = mesh(THREE, frustumGeo, shellDS, 0, H / 2, 0);
    canopy.scale.set(1.839, 1, 1.202);                 // base 2,6 × 1,7 m → topo 1,1 × 0,72 m
    addPart(model, model.group, canopy, 0, 0.35, 0);

    addPart(model, model.group, box(THREE, 1.1, 0.04, 0.72, M.shell, 0, H, 0), 0, 0.8, 0);
    var chimney = new THREE.Group();
    chimney.add(box(THREE, 0.62, 1.1, 0.62, M.shell, 0, H + 0.55, 0));
    chimney.add(box(THREE, 0.66, 0.04, 0.66, M.gold, 0, H + 0.4, 0));
    addPart(model, model.group, chimney, 0, 1.1, 0);

    var trim = new THREE.Group();
    trim.add(box(THREE, 2.64, 0.035, 0.05, M.gold, 0, 0.0175, 0.85));
    trim.add(box(THREE, 2.64, 0.035, 0.05, M.gold, 0, 0.0175, -0.85));
    trim.add(box(THREE, 0.05, 0.035, 1.7, M.gold, 1.3, 0.0175, 0));
    trim.add(box(THREE, 0.05, 0.035, 1.7, M.gold, -1.3, 0.0175, 0));
    addPart(model, model.group, trim, 0, -0.28, 0);

    var filters = new THREE.Group();
    [[-0.64, -0.4], [0.64, -0.4], [-0.64, 0.4], [0.64, 0.4]].forEach(function (p) {
      var c = cassette(THREE, M, 1.2, 0.76);
      c.position.set(p[0], 0.07, p[1]);
      filters.add(c);
    });
    addPart(model, model.group, filters, 0, -0.9, 0);

    var uv = new THREE.Group();
    [-0.3, 0, 0.3].forEach(function (z) { uv.add(uvTube(THREE, M, 1.5, 0, 0.36, z, model)); });
    addPart(model, model.group, uv, 0, 0.4, 0);

    var glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 1.45),
      new THREE.MeshBasicMaterial({ map: M.glowTex, color: 0xb7a8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.02;
    model.group.add(glow);
    model.glow = glow;

    var cook = new THREE.Group();
    cook.position.y = -1.3;
    cook.add(box(THREE, 2.3, 0.14, 1.1, M.dark, 0, 0, 0));
    cook.add(box(THREE, 2.32, 0.02, 1.12, M.gold, 0, 0.08, 0));
    [-0.75, 0, 0.75].forEach(function (x) { cook.add(cyl(THREE, 0.2, 0.2, 0.02, 28, M.filter, x, 0.085, 0)); });
    model.group.add(cook);

    model.smoke = { cx: 0, cz: 0, hw: 0.9, hd: 0.4, y0: -1.15, yFilter: 0.08, yTop: H + 1.4, collarX: 0, collarZ: 0 };
    return model;
  }

  var BUILDERS = { 1: buildHood, 2: buildSystem, 3: buildIsland };

  /* ====================================================================== */
  /* Fumaça (partículas com sprite suave)                                    */
  /* ====================================================================== */

  function createSmoke(THREE, cfg, count, tex) {
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var speed = new Float32Array(count);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({ size: 0.78, map: tex, vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, sizeAttenuation: true });
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;

    function reset(i, scatter) {
      pos[i * 3] = cfg.cx + (Math.random() - 0.5) * 2 * cfg.hw;
      pos[i * 3 + 1] = scatter ? cfg.y0 + Math.random() * (cfg.yTop - cfg.y0) : cfg.y0 + Math.random() * 0.15;
      pos[i * 3 + 2] = cfg.cz + (Math.random() - 0.5) * 2 * cfg.hd;
      speed[i] = 0.5 + Math.random() * 0.35;
    }
    for (var i = 0; i < count; i++) reset(i, true);

    return {
      points: points,
      update: function (dt, uvOn) {
        var pull = Math.min(1, dt * 1.7);
        for (var i = 0; i < count; i++) {
          var k = i * 3;
          pos[k + 1] += speed[i] * dt;
          var y = pos[k + 1];
          if (y > cfg.yFilter) {                       // depois do filtro: converge para o colar
            pos[k] += (cfg.collarX - pos[k]) * pull;
            pos[k + 2] += (cfg.collarZ - pos[k + 2]) * pull;
            if (uvOn) { col[k] = 0.55; col[k + 1] = 0.78; col[k + 2] = 1.0; }
            else { col[k] = 0.5; col[k + 1] = 0.47; col[k + 2] = 0.42; }
          } else { col[k] = 0.66; col[k + 1] = 0.66; col[k + 2] = 0.64; }
          if (y > cfg.yTop) reset(i, false);
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      },
      dispose: function () { geo.dispose(); mat.dispose(); }
    };
  }

  /* ====================================================================== */
  /* Visualizador                                                            */
  /* ====================================================================== */

  function Viewer(el, kind) {
    this.el = el;
    this.kind = kind;                                  // 'hero' | 'main'
    this.host = el.querySelector('.viewer__canvas');
    this.statusText = el.querySelector('.viewer__status-text');
    this.state = { uv: false, xray: false, explode: false, smoke: kind === 'hero' ? true : !reduceMotion.matches };
    this.levels = { uv: 0, xray: 0, explode: 0 };
    this.model = null;
    this.modelKey = null;
    this.pendingModel = 1;
    this.visible = false;
    this.ratio = 0;
    this.running = false;
    this.ready = false;
    this.introDone = false;
    this.goal = null;
    this.last = 0;
    this.tick = this.tick.bind(this);
  }

  Viewer.prototype.setStatus = function (text) { if (this.statusText) this.statusText.textContent = text; };

  Viewer.prototype.init = function () {
    var THREE = window.THREE;
    var self = this;
    var w = this.host.clientWidth || 600;
    var h = this.host.clientHeight || 400;

    var renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.matchMedia('(max-width: 640px)').matches ? 1.5 : 2));
    renderer.setSize(w, h, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.setClearColor(0x000000, 0);
    this.host.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
    this.camera.position.set(4, 0, 6);

    this.buildEnvironment();
    var key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    var rim = new THREE.PointLight(0xffc83a, 1.3, 14, 1.5);
    rim.position.set(-4, 1.2, -3);
    this.scene.add(rim);

    this.tubeOff = new THREE.Color(0x6c7480);
    this.tubeOn = new THREE.Color(0xe9e4ff);
    this.glowTex = radialTexture(THREE, [[0, 'rgba(255,255,255,0.9)'], [0.4, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    this.smokeTex = radialTexture(THREE, [[0, 'rgba(255,255,255,0.85)'], [0.5, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]);

    this.stage = this.buildStage();
    this.scene.add(this.stage.group);

    var controls = this.controls = new THREE.OrbitControls(this.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.enableZoom = false;                       // a roda do mouse continua rolando a página
    controls.rotateSpeed = 0.7;
    controls.minPolarAngle = Math.PI * 0.3;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.autoRotate = this.kind === 'hero' && !reduceMotion.matches;
    controls.autoRotateSpeed = 1.3;
    renderer.domElement.style.touchAction = 'pan-y';   // arrasto vertical rola a página no celular
    controls.addEventListener('start', function () { self.goal = null; self.userMoved = true; });

    // Teclado (acessibilidade): setas giram, + / − aproximam, Home restaura
    this.host.addEventListener('keydown', function (e) {
      var handled = true;
      if (e.key === 'ArrowLeft') self.rotateBy(-0.25);
      else if (e.key === 'ArrowRight') self.rotateBy(0.25);
      else if (e.key === 'ArrowUp' || e.key === '+' || e.key === '=') self.zoom(0.85);
      else if (e.key === 'ArrowDown' || e.key === '-' || e.key === '_') self.zoom(1.18);
      else if (e.key === 'Home') self.resetCamera();
      else handled = false;
      if (handled) e.preventDefault();
    });

    renderer.domElement.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      self.stop();
      self.ready = false;
      self.el.classList.remove('is-ready');
      self.el.classList.add('is-fallback');
      self.setStatus('A visualização 3D foi interrompida pelo dispositivo.');
    });
    renderer.domElement.addEventListener('webglcontextrestored', function () {
      self.el.classList.remove('is-fallback');
      self.start();
    });

    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver(function () { self.resize(); });
      this.ro.observe(this.host);
    } else {
      window.addEventListener('resize', function () { self.resize(); });
    }

    this.io = new IntersectionObserver(function (entries) {
      var en = entries[entries.length - 1];
      self.visible = en.isIntersecting;
      self.ratio = en.intersectionRatio;
      if (self.visible) self.start(); else self.stop();
      self.checkIntro();
    }, { threshold: [0, 0.35] });
    this.io.observe(this.el);

    doc.addEventListener('visibilitychange', function () { if (doc.hidden) self.stop(); else if (self.visible) self.start(); });

    this.setModel(this.pendingModel);
  };

  Viewer.prototype.buildEnvironment = function () {
    var THREE = window.THREE;
    var env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(14, 9, 14), new THREE.MeshBasicMaterial({ color: 0x0e1417, side: THREE.BackSide })));
    function panel(w, h, color, intensity, x, y, z) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    }
    panel(5, 2.6, 0xffffff, 3.2, 0, 4.2, 0);           // teto (softbox)
    panel(2.6, 2.6, 0xfff1c9, 6.5, -5.5, 1.2, 3);      // luz principal quente
    panel(2.4, 2, 0xcfe6ff, 2.8, 5.5, 0.8, -1.5);      // preenchimento frio
    panel(8, 1, 0xffffff, 1.8, 0, 0.5, -6);            // faixa ao fundo
    panel(4, 1.2, 0xffc83a, 1.4, 0, -1.6, 6);          // reflexo dourado baixo
    var pmrem = new THREE.PMREMGenerator(this.renderer);
    var rt = pmrem.fromScene(env, 0.035);
    this.scene.environment = rt.texture;
    this.envRT = rt;
    pmrem.dispose();
    disposeObject(env);
  };

  /** Anéis no chão (identidade) + sombra suave. Escalam conforme o modelo. */
  Viewer.prototype.buildStage = function () {
    var THREE = window.THREE;
    var group = new THREE.Group();
    var shadowTex = radialTexture(THREE, [[0, 'rgba(0,0,0,0.6)'], [0.6, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);
    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    group.add(shadow);
    function ring(r0, r1, opacity) {
      var m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), new THREE.MeshBasicMaterial({ color: 0xfad514, transparent: true, opacity: opacity, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.002;
      group.add(m);
    }
    ring(1.0, 1.012, 0.55);
    ring(1.28, 1.285, 0.22);
    return { group: group, tex: shadowTex };
  };

  Viewer.prototype.resize = function () {
    if (!this.renderer) return;
    var w = this.host.clientWidth;
    var h = this.host.clientHeight;
    if (!w || !h) return;                              // contêiner oculto: evita aspect = NaN
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.model && !this.userMoved) this.fit(true);
  };

  Viewer.prototype.setModel = function (key) {
    if (!this.renderer) { this.pendingModel = key; return; }
    var THREE = window.THREE;
    if (this.model) {
      this.scene.remove(this.model.group);
      disposeObject(this.model.group);
      if (this.smoke) { this.scene.remove(this.smoke.points); this.smoke.dispose(); }
    }
    var M = makeMaterials(THREE, this.glowTex);
    var model = BUILDERS[key](THREE, M);
    model.group.updateMatrixWorld(true);
    model.parts.forEach(function (p) { p.userData.home = p.position.clone(); });
    var seen = [];
    model.group.traverse(function (o) {
      if (o.material && o.material.userData && o.material.userData.shell && seen.indexOf(o.material) < 0) seen.push(o.material);
    });
    model.shellMats = seen;
    this.model = model;
    this.modelKey = key;
    this.scene.add(model.group);

    this.smoke = createSmoke(THREE, model.smoke, this.kind === 'hero' ? 90 : 150, this.smokeTex);
    this.smoke.points.visible = this.state.smoke;
    this.scene.add(this.smoke.points);

    this.levels.explode = this.state.explode ? 1 : 0;
    this.applyLevels(true);
    this.userMoved = false;
    this.fit(true);
    this.checkIntro();
    if (this.visible) this.start();
  };

  Viewer.prototype.fit = function (snap) {
    var THREE = window.THREE;
    var box = new THREE.Box3().setFromObject(this.model.group);
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    var radius = size.length() / 2;
    var vfov = (this.camera.fov * Math.PI) / 180;
    var hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    var dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.0;

    var dir = new THREE.Vector3(0.62, -0.1, 0.78).normalize();
    var target = center.clone();
    target.y -= size.y * 0.03;                          // sobra de margem embaixo, onde ficam os botões
    this.home = { pos: target.clone().addScaledVector(dir, dist), target: target, dist: dist };
    this.controls.minDistance = dist * 0.5;
    this.controls.maxDistance = dist * 1.7;

    var R = Math.max(size.x, size.z) * 0.62;
    this.stage.group.scale.setScalar(R);
    this.stage.group.position.set(center.x, box.min.y - 0.02, center.z);

    if (snap) {
      this.camera.position.copy(this.home.pos);
      this.controls.target.copy(this.home.target);
      this.controls.update();
      this.goal = null;
    } else {
      this.goal = { pos: this.home.pos.clone(), target: this.home.target.clone() };
    }
  };

  /* ---- API pública ---- */
  Viewer.prototype.setUv = function (on) { this.state.uv = !!on; };
  Viewer.prototype.setXray = function (on) { this.state.xray = !!on; };
  Viewer.prototype.setExplode = function (on) {
    var was = this.state.explode;
    this.state.explode = !!on;
    if (this.home && was !== !!on) this.zoom(on ? 1.4 : 1 / 1.4, true);    // afasta a câmera para caber a explosão
  };
  Viewer.prototype.setSmoke = function (on) {
    this.state.smoke = !!on;
    if (this.smoke) this.smoke.points.visible = this.state.smoke;
  };
  Viewer.prototype.resetCamera = function () { if (this.model) { this.userMoved = false; this.fit(false); } };
  Viewer.prototype.rotateBy = function (angle) {
    if (!this.home) return;
    var THREE = window.THREE;
    var t = this.controls.target;
    var base = this.goal ? this.goal.pos.clone().sub(this.goal.target) : this.camera.position.clone().sub(t);
    base.applyAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
    this.userMoved = true;
    this.controls.autoRotate = false;
    this.goal = { pos: t.clone().add(base), target: t.clone() };
  };
  Viewer.prototype.zoom = function (factor, auto) {
    if (!this.home) return;
    var t = this.controls.target;
    var base = this.goal ? this.goal.pos.clone().sub(this.goal.target) : this.camera.position.clone().sub(t);
    var len = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, base.length() * factor));
    if (!auto) this.userMoved = true;
    this.goal = { pos: t.clone().add(base.setLength(len)), target: t.clone() };
  };

  /** Monta a coifa a partir da vista explodida (uma vez, quando 35% do palco aparece). */
  Viewer.prototype.checkIntro = function () {
    if (this.kind !== 'main' || this.introDone || !this.model || this.ratio < 0.35) return;
    this.introDone = true;
    if (reduceMotion.matches || this.state.explode) return;
    this.levels.explode = 1;
    this.applyLevels(true);
    if (this.home && !this.userMoved) {                 // começa afastado e se aproxima enquanto monta
      var offset = this.home.pos.clone().sub(this.home.target).multiplyScalar(1.4);
      this.camera.position.copy(this.home.target).add(offset);
      this.goal = { pos: this.home.pos.clone(), target: this.home.target.clone() };
    }
  };

  /* ---- ciclo ---- */
  Viewer.prototype.start = function () {
    if (this.running || !this.renderer || !this.model || doc.hidden) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  };
  Viewer.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  };

  Viewer.prototype.applyLevels = function (force) {
    var L = this.levels;
    var model = this.model;
    if (!model) return;

    var xr = L.xray;
    var seeThrough = xr > 0.001;
    model.shellMats.forEach(function (m) {
      if (m.transparent !== seeThrough) {
        m.transparent = seeThrough;
        m.needsUpdate = true;
      }
      m.opacity = 1 - (1 - XRAY_OPACITY) * xr;
      m.depthWrite = xr < 0.6;
    });

    var uv = L.uv;
    model.uvLights.forEach(function (l) { l.intensity = uv * 2.6; });
    if (model.glow) model.glow.material.opacity = uv * 0.8;
    if (model.tubeMat) {
      model.tubeMat.emissiveIntensity = uv * 2.6;
      model.tubeMat.color.copy(this.tubeOff).lerp(this.tubeOn, uv);
    }

    var e = L.explode * L.explode * (3 - 2 * L.explode);       // smoothstep
    model.parts.forEach(function (p) {
      p.position.copy(p.userData.home).addScaledVector(p.userData.explode, e);
    });
  };

  /** Qualidade adaptativa: se o aparelho não sustenta ~22 fps, reduz a resolução e, depois, os efeitos. */
  Viewer.prototype.adapt = function (raw) {
    if (raw > 0.5) return;                              // aba em segundo plano / pausa: ignora a amostra
    this.ema = this.ema ? this.ema * 0.94 + raw * 0.06 : raw;
    this.sampled = (this.sampled || 0) + 1;
    if (this.sampled < 90 || this.ema < 0.045) return;
    this.sampled = 0;
    var pr = this.renderer.getPixelRatio();
    if (pr > 1) {
      this.renderer.setPixelRatio(Math.max(1, pr - 0.5));
      this.renderer.setSize(this.host.clientWidth, this.host.clientHeight, false);
    } else if (!this.lowPower) {
      this.lowPower = true;
      this.controls.autoRotate = false;
      this.setSmoke(false);
      var smokeBtn = this.el.querySelector('[data-action="smoke"]');
      if (smokeBtn) smokeBtn.setAttribute('aria-pressed', 'false');
    }
  };

  Viewer.prototype.tick = function (now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    var raw = (now - this.last) / 1000 || 0.016;
    var dt = Math.min(0.05, raw);
    this.last = now;
    this.adapt(raw);

    var k = 1 - Math.exp(-dt * 6);
    var kXray = 1 - Math.exp(-dt * XRAY_RATE);
    var L = this.levels, S = this.state, changed = false;
    function step(name, target, f) {
      var d = target - L[name];
      if (Math.abs(d) < 0.0008) { if (L[name] !== target) { L[name] = target; changed = true; } return; }
      L[name] += d * (f || k);
      changed = true;
    }
    step('uv', S.uv ? 1 : 0);
    step('xray', S.xray ? 1 : 0, kXray);
    step('explode', S.explode ? 1 : 0);
    if (changed) this.applyLevels();

    if (this.goal) {
      var f = 1 - Math.exp(-dt * 5);
      this.camera.position.lerp(this.goal.pos, f);
      this.controls.target.lerp(this.goal.target, f);
      if (this.camera.position.distanceTo(this.goal.pos) < 0.003) this.goal = null;
    }
    this.controls.update();

    if (this.smoke && S.smoke) this.smoke.update(dt, L.uv > 0.5);
    this.renderer.render(this.scene, this.camera);

    if (!this.ready) {
      this.ready = true;
      this.el.classList.remove('is-loading');
      this.el.classList.add('is-ready');
      var chip = this.el.querySelector('.viewer__chip');
      if (chip) chip.hidden = false;
    }
  };

  /* ====================================================================== */
  /* Montagem e ligação com a interface                                      */
  /* ====================================================================== */

  function boot(viewer) {
    var el = viewer.el;
    el.classList.add('is-loading');
    viewer.setStatus('Carregando modelo 3D…');
    var btn = el.querySelector('.viewer__load');
    if (btn) btn.hidden = true;
    return loadThree().then(function () {
      viewer.init();
    }).catch(function () {
      el.classList.remove('is-loading');
      el.classList.add('is-fallback');
      viewer.setStatus('Não foi possível carregar o 3D agora.');
      if (btn) { btn.hidden = false; btn.textContent = 'Tentar novamente'; }
    });
  }

  function whenIdle(fn) {
    function run() {
      if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 2500 });
      else window.setTimeout(fn, 700);
    }
    if (doc.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  }

  function mount(el, kind, eager) {
    var viewer = new Viewer(el, kind);
    var btn = el.querySelector('.viewer__load');

    if (!webglSupported()) {
      el.classList.add('is-fallback');
      viewer.setStatus('Seu dispositivo não suporta visualização 3D. Veja a ilustração e a ficha técnica.');
      return viewer;
    }
    if (btn) btn.addEventListener('click', function () { boot(viewer); });

    if (saveData()) {                                  // economia de dados: só baixa se o usuário pedir
      if (btn) btn.hidden = false;
      return viewer;
    }
    if (eager) {
      whenIdle(function () { boot(viewer); });
    } else if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { io.disconnect(); boot(viewer); }
      }, { rootMargin: '700px 0px' });
      io.observe(el);
    } else {
      boot(viewer);
    }
    return viewer;
  }

  function wireShowroom(viewer, el) {
    var uvBtn = el.querySelector('[data-action="uv"]');
    var smokeBtn = el.querySelector('[data-action="smoke"]');
    var explodeBtn = el.querySelector('[data-action="explode"]');
    var label = doc.getElementById('modelLabel');
    var specList = doc.getElementById('specList');
    var modelBtns = Array.prototype.slice.call(doc.querySelectorAll('.model-btn'));
    var viewBtns = Array.prototype.slice.call(el.querySelectorAll('[data-view]'));

    function toggle(btn, current, apply) {
      var next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(next));
      apply(next);
      return next;
    }

    if (smokeBtn) smokeBtn.setAttribute('aria-pressed', String(viewer.state.smoke));
    if (uvBtn) uvBtn.addEventListener('click', function () { toggle(uvBtn, viewer.state.uv, function (v) { viewer.setUv(v); }); });
    if (smokeBtn) smokeBtn.addEventListener('click', function () { toggle(smokeBtn, viewer.state.smoke, function (v) { viewer.setSmoke(v); }); });
    if (explodeBtn) explodeBtn.addEventListener('click', function () { toggle(explodeBtn, viewer.state.explode, function (v) { viewer.setExplode(v); }); });

    viewBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        viewBtns.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        viewer.setXray(b.dataset.view === 'xray');
      });
    });

    el.querySelector('[data-action="reset"]').addEventListener('click', function () { viewer.resetCamera(); });
    el.querySelector('[data-action="zoom-in"]').addEventListener('click', function () { viewer.zoom(0.8); });
    el.querySelector('[data-action="zoom-out"]').addEventListener('click', function () { viewer.zoom(1.25); });

    function applyModelText(key) {
      var m = MODELS[key];
      if (label) label.textContent = m.label;
      if (!specList) return;
      specList.textContent = '';
      m.specs.forEach(function (row) {
        var wrap = doc.createElement('div');
        var dt = doc.createElement('dt');
        var dd = doc.createElement('dd');
        dt.textContent = row[0];
        dd.textContent = row[1];
        wrap.appendChild(dt);
        wrap.appendChild(dd);
        specList.appendChild(wrap);
      });
    }

    modelBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var key = Number(b.dataset.model);
        if (!MODELS[key] || (key === viewer.modelKey && viewer.renderer)) return;
        modelBtns.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        applyModelText(key);
        viewer.setModel(key);
        // novo modelo: a vista explodida e o raio-X continuam como o usuário deixou
      });
    });
  }

  function wireHero(viewer, el) {
    var chip = el.querySelector('.viewer__chip');
    if (!chip) return;
    chip.addEventListener('click', function () {
      var next = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(next));
      viewer.setUv(next);
    });
  }

  function init() {
    var heroEl = doc.getElementById('heroViewer');
    var mainEl = doc.getElementById('mainViewer');
    if (heroEl) wireHero(mount(heroEl, 'hero', true), heroEl);
    if (mainEl) wireShowroom(mount(mainEl, 'main', false), mainEl);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();

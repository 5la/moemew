/**
 * MoeMew Cozy Widescreen Home Living Room & Interactive World (js/world.js)
 * Combines spacious minimalist aesthetics with warm "living together" home details:
 * - Warm plaster back wall + honey-oak wooden floor with subtle plank lines
 * - Sunlit picture window (billowing sheer curtains, outside clouds/moon, steaming mug & cat grass)
 * - Slanted sunlit / moonlit window light patch cast onto the wooden floor
 * - Real-time minimalist wall clock & framed mini portrait of our blue-white kitty
 * - Low oak cat-scratching condo with swinging pom-pom, woven rug, cat cushion,
 *   potted indoor plant, interactive warm floor lamp, and twin ceramic cat bowls.
 */
(function () {
  "use strict";

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpRGB(c1, c2, t) {
    return [
      c1[0] + (c2[0] - c1[0]) * t,
      c1[1] + (c2[1] - c1[1]) * t,
      c1[2] + (c2[2] - c1[2]) * t
    ];
  }

  function rgbStr(arr, alpha = 1) {
    const r = Math.round(arr[0]);
    const g = Math.round(arr[1]);
    const b = Math.round(arr[2]);
    return alpha >= 0.999 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }

  const THEME_TARGETS = {
    day: {
      wallTop: [250, 246, 239],
      wallBot: [242, 236, 226],
      floorTop: [233, 220, 203],
      floorBot: [222, 207, 187],
      baseboard: [246, 241, 233],
      skyTop: [192, 228, 252],
      skyBot: [246, 244, 232],
      sunPatchAlpha: 0.36,
      nightFactor: 0.0,
      defaultLamp: false,
      clockBaseMin: 9 * 60 + 20 // 09:20 Morning sunlight
    },
    dusk: {
      wallTop: [242, 225, 214],
      wallBot: [228, 207, 196],
      floorTop: [216, 194, 178],
      floorBot: [201, 177, 160],
      baseboard: [235, 220, 210],
      skyTop: [148, 132, 184],
      skyBot: [252, 188, 162],
      sunPatchAlpha: 0.28,
      nightFactor: 0.35,
      defaultLamp: true,
      clockBaseMin: 17 * 60 + 50 // 17:50 Sunset dusk
    },
    night: {
      wallTop: [30, 34, 50],
      wallBot: [36, 41, 59],
      floorTop: [44, 46, 62],
      floorBot: [35, 37, 51],
      baseboard: [52, 56, 76],
      skyTop: [17, 22, 42],
      skyBot: [34, 44, 78],
      sunPatchAlpha: 0.10,
      nightFactor: 1.0,
      defaultLamp: true,
      clockBaseMin: 22 * 60 + 30 // 22:30 Starry night
    }
  };

  class WidescreenWorld {
    constructor(canvas, cat) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.cat = cat;

      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.theme = "day";
      this.mode = "roam"; // roam | laser | wand | fish | ball | bubble | catnip
      this.time = 0;

      // Smoothly animated room palette
      const initT = THEME_TARGETS.day;
      this.pal = {
        wallTop: [...initT.wallTop],
        wallBot: [...initT.wallBot],
        floorTop: [...initT.floorTop],
        floorBot: [...initT.floorBot],
        baseboard: [...initT.baseboard],
        skyTop: [...initT.skyTop],
        skyBot: [...initT.skyBot],
        sunPatchAlpha: initT.sunPatchAlpha,
        nightFactor: 0.0
      };

      // Interactive Room Prop States
      this.lampOn = false;
      this.lampGlow = 0.0;
      this.pomPomAngle = 0;
      this.pomPomVel = 0;
      this.bowlFoodLevel = 0.7; // 0..1 kibble fullness
      this.grassWiggle = 0;
      this.clockMinutes = initT.clockBaseMin;
      this.targetClockMinutes = initT.clockBaseMin;

      this.pointer = { x: this.width * 0.5, y: this.height * 0.5, active: false, vx: 0, vy: 0 };

      // Dynamic Entities
      this.pawPrints = [];
      this.ripples = [];
      this.particles = [];
      this.motes = [];
      this.clouds = [
        { rx: 0.18, ry: 0.28, s: 1.0, speed: 0.012 },
        { rx: 0.68, ry: 0.48, s: 0.78, speed: 0.008 }
      ];
      this.windowStars = [];
      for (let i = 0; i < 18; i++) {
        this.windowStars.push({
          rx: 0.08 + Math.random() * 0.84,
          ry: 0.08 + Math.random() * 0.68,
          r: 0.8 + Math.random() * 1.2,
          phase: Math.random() * Math.PI * 2
        });
      }

      this.fishes = [];
      this.ball = null;
      this.laser = { x: this.width * 0.56, y: this.height * 0.64, active: false, trail: [] };
      this.bubbles = [];
      this.catnips = [];
      this.zzzTimer = 0;

      // Feather Ribbon Verlet String
      this.wandNodes = [];
      for (let i = 0; i < 9; i++) {
        this.wandNodes.push({
          x: this.width * 0.5,
          y: this.height * 0.35 + i * 14,
          ox: this.width * 0.5,
          oy: this.height * 0.35 + i * 14
        });
      }
      this.wandBatCooldown = 0;

      // Occasional delicate butterfly
      this.butterfly = { active: false, x: -30, y: 200, phase: 0, timer: 6.5 };

      // Wire cat footsteps to leave faint minimalist paw impressions
      this.cat.onPawStep = (x, y, angle, scale) => {
        this.pawPrints.push({ x, y, angle, scale, life: 1.0 });
        if (this.pawPrints.length > 26) this.pawPrints.shift();
      };

      // Wire playful cat events (e.g., reaching catnip triggers sparkly bliss!)
      this.cat.onCatEvent = (ev) => {
        if (ev === "catnip_bliss") {
          let nearestIdx = -1;
          let bestD = Infinity;
          for (let i = 0; i < this.catnips.length; i++) {
            const d = Math.hypot(this.catnips[i].x - this.cat.x, this.catnips[i].y - this.cat.y);
            if (d < bestD) {
              bestD = d;
              nearestIdx = i;
            }
          }
          if (nearestIdx >= 0 && bestD < 92) {
            this.catnips.splice(nearestIdx, 1);
          }
          const s = this.cat.getScale();
          this.spawnHeart(this.cat.x, this.cat.y - 68 * s, 4);
          this.spawnSparkles(this.cat.x, this.cat.y - 38 * s, 12, ["#7DD48E", "#AEEBBA", "#F7A6BA", "#FFE28A"]);
          if (window.MoeAudio) window.MoeAudio.playLevelUp();
        }
      };

      this.resize();
      this.initMotes();
    }

    resize() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.cat.resize(this.width, this.height);
    }

    initMotes() {
      this.motes = [];
      for (let i = 0; i < 18; i++) {
        this.motes.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          r: 1.1 + Math.random() * 2.0,
          vx: 5 + Math.random() * 9,
          vy: -3 + Math.random() * 6,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    /**
     * Computes responsive layout coordinates for all living-room furniture & props
     * so both ultrawide desktop and mobile portrait look balanced and spacious.
     */
    getRoomLayout() {
      const w = this.width;
      const h = this.height;
      const compact = w < 680;
      const horizonY = Math.round(Math.max(155, Math.min(h * 0.36, 360)));

      // Sunlit Picture Window
      const winW = compact ? Math.min(w * 0.58, 250) : Math.min(w * 0.30, 420);
      const winH = Math.min(horizonY * 0.68, 205);
      const winX = compact ? w * 0.5 - winW * 0.5 : w * 0.36 - winW * 0.5;
      const winY = Math.max(44, horizonY - winH - 36);

      // Wall Clock & Framed Kitty Art (Right of Window on Desktop)
      const clockX = compact ? Math.min(w - 42, winX + winW + 34) : w * 0.63;
      const clockY = winY + winH * 0.30;

      // Left Cat Condo & Scratching Post (Near Back Wall)
      const condoX = compact ? Math.max(44, w * 0.13) : Math.max(115, w * 0.14);
      const condoY = horizonY + 8;

      // Cozy Cat Bed Cushion (Left-Mid Back Floor)
      const bedX = compact ? w * 0.24 : w * 0.24;
      const bedY = horizonY + Math.min(54, h * 0.075);

      // Center Woven Area Rug (Flat on Floor — Kitty roams right across it!)
      const rugX = w * 0.50;
      const rugY = horizonY + (h - horizonY) * 0.44;
      const rugRx = compact ? w * 0.36 : Math.min(w * 0.26, 360);
      const rugRy = Math.min((h - horizonY) * 0.22, 92);

      // Right Floor Lamp & Potted Plant (Near Right Back Wall)
      const lampX = compact ? w - 48 : Math.min(w - 120, w * 0.86);
      const lampY = horizonY + 12;
      const plantX = compact ? -999 : lampX - 72;
      const plantY = horizonY + 16;

      // Twin Ceramic Cat Food & Water Bowls (Right-Mid Back Floor)
      const bowlsX = compact ? w * 0.77 : w * 0.75;
      const bowlsY = horizonY + Math.min(52, h * 0.072);

      return {
        compact,
        horizonY,
        win: { x: winX, y: winY, w: winW, h: winH },
        clock: { x: clockX, y: clockY, r: compact ? 16 : 22 },
        condo: { x: condoX, y: condoY },
        bed: { x: bedX, y: bedY, rx: compact ? 32 : 42, ry: compact ? 15 : 19 },
        rug: { x: rugX, y: rugY, rx: rugRx, ry: rugRy },
        lamp: { x: lampX, y: lampY, shadeY: lampY - (compact ? 108 : 138) },
        plant: { x: plantX, y: plantY },
        bowls: { x: bowlsX, y: bowlsY }
      };
    }

    hoverRoomProp(clientX, clientY) {
      const L = this.getRoomLayout();
      if (Math.hypot(clientX - L.clock.x, clientY - L.clock.y) < L.clock.r + 8) return true;
      if (Math.hypot(clientX - L.lamp.x, clientY - L.lamp.shadeY) < 36) return true;
      if (Math.hypot(clientX - L.bowls.x, clientY - L.bowls.y) < 38) return true;
      if (Math.hypot(clientX - L.bed.x, (clientY - L.bed.y) * 1.6) < L.bed.rx + 8) return true;
      if (Math.hypot(clientX - (L.condo.x + 26), clientY - (L.condo.y - 52)) < 28) return true;
      const sillY = L.win.y + L.win.h;
      if (Math.abs(clientY - (sillY - 12)) < 24 && clientX > L.win.x && clientX < L.win.x + L.win.w) return true;
      return false;
    }

    /**
     * Hit-test interactive living room props! Returns action tag or null.
     */
    interactRoomProp(clientX, clientY) {
      const L = this.getRoomLayout();

      // 0. Wall Clock -> Cycle scene time of day (Morning -> Dusk -> Night)!
      if (Math.hypot(clientX - L.clock.x, clientY - L.clock.y) < L.clock.r + 8) {
        if (window.MoeAudio) window.MoeAudio.playBell();
        return "clock";
      }

      // 1. Floor Lamp Shade / Switch -> Toggle warm cozy lamp!
      if (Math.hypot(clientX - L.lamp.x, clientY - L.lamp.shadeY) < 36) {
        this.lampOn = !this.lampOn;
        if (window.MoeAudio) window.MoeAudio.playBoing(this.lampOn ? 1.25 : 0.9);
        return this.lampOn ? "lamp_on" : "lamp_off";
      }

      // 2. Twin Ceramic Cat Bowls -> Refill crunchy kibble & call kitty over to eat!
      if (Math.hypot(clientX - L.bowls.x, clientY - L.bowls.y) < 38) {
        this.bowlFoodLevel = 1.0;
        this.tossFish(L.bowls.x - 10, L.bowls.y + 14);
        if (window.MoeAudio) window.MoeAudio.playMew("happy");
        return "bowls";
      }

      // 3. Cozy Cat Bed Cushion -> Invite kitty to stroll over to its bed!
      if (Math.hypot(clientX - L.bed.x, (clientY - L.bed.y) * 1.6) < L.bed.rx + 8) {
        this.spawnRipple(L.bed.x, L.bed.y);
        this.cat.callTo(L.bed.x, L.bed.y + 4);
        if (window.MoeAudio) window.MoeAudio.playMew("sweet");
        return "bed";
      }

      // 4. Scratching Post Pom-Pom Toy -> Swing it & attract kitty's gaze!
      const pomX = L.condo.x + 26;
      const pomY = L.condo.y - 52;
      if (Math.hypot(clientX - pomX, clientY - pomY) < 28) {
        this.pomPomVel = (Math.random() < 0.5 ? 1 : -1) * 9.5;
        this.cat.callTo(L.condo.x + 28, L.condo.y + 24);
        if (window.MoeAudio) window.MoeAudio.playBell();
        return "pompom";
      }

      // 5. Window Sill Cat Grass or Steaming Mug
      const sillY = L.win.y + L.win.h;
      if (Math.abs(clientY - (sillY - 12)) < 24 && clientX > L.win.x && clientX < L.win.x + L.win.w) {
        this.grassWiggle = 1.0;
        this.spawnHeart(clientX, sillY - 26, 2);
        if (window.MoeAudio) window.MoeAudio.playBoing(1.3);
        return "sill";
      }

      return null;
    }

    setTheme(theme) {
      this.theme = theme;
      this.cat.theme = theme;
      const target = THEME_TARGETS[theme] || THEME_TARGETS.day;
      this.lampOn = target.defaultLamp;

      // Always advance clock hands smoothly forward along the dial to the scene's time!
      let nextMin = target.clockBaseMin;
      const currentMod = ((this.targetClockMinutes % 1440) + 1440) % 1440;
      let delta = nextMin - currentMod;
      if (delta < -360) delta += 1440; // e.g., Night (22:30) -> Morning (09:20) spins smoothly forward!
      this.targetClockMinutes += delta;
    }

    setMode(mode) {
      this.mode = mode;
      if (mode === "laser") {
        const b = this.cat.getFloorBounds();
        this.laser.active = true;
        this.laser.x = this.pointer.active ? this.pointer.x : (b.minX + b.maxX) * 0.58;
        this.laser.y = this.pointer.active ? Math.max(b.minY, Math.min(b.maxY, this.pointer.y)) : (b.minY + b.maxY) * 0.56;
        this.laser.trail = [];
      } else {
        this.laser.active = false;
        this.laser.trail = [];
      }

      if (mode === "wand") {
        const px = this.pointer.active ? this.pointer.x : this.width * 0.58;
        const py = this.pointer.active ? this.pointer.y : this.height * 0.36;
        for (let i = 0; i < this.wandNodes.length; i++) {
          this.wandNodes[i].x = this.wandNodes[i].ox = px;
          this.wandNodes[i].y = this.wandNodes[i].oy = py + i * 14;
        }
      } else if (mode === "ball" && !this.ball) {
        this.spawnBall(this.width * 0.36, this.height * 0.58, 240, 35);
      } else if (mode === "bubble") {
        // Blow 3 inviting iridescent soap bubbles right away!
        const cx = this.cat.x + (this.cat.x > this.width * 0.5 ? -90 : 90);
        const cy = Math.max(180, this.cat.y - 75);
        this.spawnBubble(cx, cy, 3);
      }
    }

    updatePointer(x, y) {
      this.pointer.vx = x - this.pointer.x;
      this.pointer.vy = y - this.pointer.y;
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.active = true;
      this.cat.pointer.x = x;
      this.cat.pointer.y = y;
      this.cat.pointer.active = true;
    }

    // --- Spawners ---

    spawnRipple(x, y) {
      this.ripples.push({ x, y, r: 4, maxR: 44, life: 1.0 });
    }

    spawnHeart(x, y, count = 1) {
      for (let i = 0; i < count; i++) {
        this.particles.push({
          type: "heart",
          x: x + (Math.random() - 0.5) * 26,
          y: y + (Math.random() - 0.5) * 14,
          vx: (Math.random() - 0.5) * 28,
          vy: -36 - Math.random() * 28,
          size: 6.5 + Math.random() * 4.5,
          life: 1.0,
          decay: 0.72
        });
      }
    }

    spawnNote(x, y) {
      const notes = ["♪", "♫"];
      this.particles.push({
        type: "note",
        text: notes[Math.floor(Math.random() * notes.length)],
        x: x + (Math.random() - 0.5) * 18,
        y,
        vx: (Math.random() - 0.5) * 18,
        vy: -28 - Math.random() * 18,
        size: 13,
        life: 1.0,
        decay: 0.55
      });
    }

    spawnSparkles(x, y, count = 8, colors = ["#F9A8C9", "#A6E3F9", "#FFE58F", "#B7EFC5"]) {
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const spd = 38 + Math.random() * 75;
        this.particles.push({
          type: "sparkle",
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 12,
          size: 3.5 + Math.random() * 3.8,
          color: colors[i % colors.length],
          life: 1.0,
          decay: 1.35 + Math.random() * 0.4
        });
      }
    }

    spawnZzz(x, y) {
      this.particles.push({
        type: "zzz",
        text: Math.random() < 0.5 ? "z" : "Z",
        x,
        y,
        vx: 10 + Math.random() * 8,
        vy: -20 - Math.random() * 10,
        size: 12 + Math.random() * 5,
        life: 1.0,
        decay: 0.42
      });
    }

    spawnBubble(x, y, count = 1) {
      for (let i = 0; i < count; i++) {
        if (this.bubbles.length >= 22) this.bubbles.shift();
        const r = 12 + Math.random() * 9;
        this.bubbles.push({
          x: x + (Math.random() - 0.5) * 36,
          y: y + (Math.random() - 0.5) * 28,
          r,
          vx: (Math.random() - 0.5) * 34,
          vy: -14 - Math.random() * 20,
          phase: Math.random() * Math.PI * 2,
          hue: Math.floor(Math.random() * 360),
          life: 9.5 + Math.random() * 4.5
        });
      }
    }

    tryPopBubbleAt(x, y) {
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        if (Math.hypot(x - b.x, y - b.y) <= b.r + 16) {
          this.bubbles.splice(i, 1);
          this.spawnSparkles(b.x, b.y, 9, ["#FF9EC4", "#98E2F7", "#FFF09E", "#C6B6FF"]);
          if (window.MoeAudio) window.MoeAudio.playBubblePop();
          return true;
        }
      }
      return false;
    }

    sprinkleCatnip(targetX, targetY) {
      const b = this.cat.getFloorBounds();
      const landX = Math.max(b.minX + 18, Math.min(b.maxX - 18, targetX));
      const landY = Math.max(b.minY + 12, Math.min(b.maxY - 12, targetY));

      if (this.catnips.length >= 4) this.catnips.shift();
      const leaves = [];
      for (let i = 0; i < 6; i++) {
        leaves.push({
          ox: (Math.random() - 0.5) * 26,
          oy: (Math.random() - 0.5) * 12,
          rot: Math.random() * Math.PI * 2,
          s: 0.78 + Math.random() * 0.45
        });
      }
      this.catnips.push({ x: landX, y: landY, leaves, phase: Math.random() * Math.PI * 2 });
      this.spawnRipple(landX, landY);
      this.spawnSparkles(landX, landY - 8, 6, ["#7CD48C", "#B4EFC0", "#E5F9A8"]);
      this.cat.chaseCatnip(landX, landY);
    }

    tossFish(targetX, targetY) {
      const b = this.cat.getFloorBounds();
      const landX = Math.max(b.minX + 14, Math.min(b.maxX - 14, targetX));
      const landY = Math.max(b.minY + 10, Math.min(b.maxY - 10, targetY));

      if (this.fishes.length >= 5) this.fishes.shift();
      this.fishes.push({
        x: landX,
        y: landY - 90,
        groundY: landY,
        vy: -115,
        rot: (Math.random() - 0.5) * 0.8,
        landed: false
      });

      this.spawnRipple(landX, landY);
      this.cat.chaseFish(landX, landY);
    }

    spawnBall(x, y, vx, vy) {
      const b = this.cat.getFloorBounds();
      const safeX = Math.max(b.minX + 20, Math.min(b.maxX - 20, x));
      const safeY = Math.max(b.minY + 14, Math.min(b.maxY - 14, y));

      const centerX = (b.minX + b.maxX) * 0.5;
      const centerY = (b.minY + b.maxY) * 0.5;
      const defaultVx = safeX < centerX ? 220 : -220;
      const defaultVy = (centerY - safeY) * 0.45 + (Math.random() - 0.5) * 80;

      this.ball = {
        x: safeX,
        y: safeY,
        z: 36,
        vz: 90,
        vx: vx !== undefined ? vx : defaultVx,
        vy: vy !== undefined ? vy : defaultVy,
        r: 15,
        rot: 0,
        batCooldown: 0,
        restCooldown: 0,
        rallyRemaining: 4
      };
      if (window.MoeAudio) window.MoeAudio.playBoing(1.0);
    }

    // --- 60fps Update ---

    update(dt) {
      this.time += dt;

      // Smoothly transition theme colors & lamp glow
      const tPal = THEME_TARGETS[this.theme] || THEME_TARGETS.day;
      const cRate = 1 - Math.exp(-3.2 * dt);
      this.pal.wallTop = lerpRGB(this.pal.wallTop, tPal.wallTop, cRate);
      this.pal.wallBot = lerpRGB(this.pal.wallBot, tPal.wallBot, cRate);
      this.pal.floorTop = lerpRGB(this.pal.floorTop, tPal.floorTop, cRate);
      this.pal.floorBot = lerpRGB(this.pal.floorBot, tPal.floorBot, cRate);
      this.pal.baseboard = lerpRGB(this.pal.baseboard, tPal.baseboard, cRate);
      this.pal.skyTop = lerpRGB(this.pal.skyTop, tPal.skyTop, cRate);
      this.pal.skyBot = lerpRGB(this.pal.skyBot, tPal.skyBot, cRate);
      this.pal.sunPatchAlpha += (tPal.sunPatchAlpha - this.pal.sunPatchAlpha) * cRate;
      this.pal.nightFactor += (tPal.nightFactor - this.pal.nightFactor) * cRate;

      this.lampGlow += ((this.lampOn ? 1 : 0) - this.lampGlow) * (1 - Math.exp(-6 * dt));
      this.clockMinutes += (this.targetClockMinutes - this.clockMinutes) * (1 - Math.exp(-4.2 * dt));

      // Pom-pom pendulum physics
      const pomForce = -28 * this.pomPomAngle;
      this.pomPomVel = (this.pomPomVel + pomForce * dt) * Math.exp(-2.8 * dt);
      this.pomPomAngle += this.pomPomVel * dt;

      if (this.grassWiggle > 0) {
        this.grassWiggle = Math.max(0, this.grassWiggle - dt * 1.8);
      }

      // Window clouds drift
      for (const c of this.clouds) {
        c.rx += c.speed * dt;
        if (c.rx > 1.22) c.rx = -0.22;
      }

      // 1. Update Feather Ribbon Wand
      if (this.mode === "wand") {
        if (this.wandBatCooldown > 0) this.wandBatCooldown -= dt;
        const tx = this.pointer.active ? this.pointer.x : this.width * 0.58 + Math.sin(this.time * 2.1) * 120;
        const ty = this.pointer.active ? this.pointer.y : this.height * 0.42 + Math.cos(this.time * 2.7) * 45;

        if (Math.hypot(this.pointer.vx, this.pointer.vy) > 28 && window.MoeAudio) {
          window.MoeAudio.playBell();
        }

        this.wandNodes[0].x = tx;
        this.wandNodes[0].y = ty;

        for (let i = 1; i < this.wandNodes.length; i++) {
          const n = this.wandNodes[i];
          const vx = (n.x - n.ox) * 0.91;
          const vy = (n.y - n.oy) * 0.91 + 780 * dt * dt;
          n.ox = n.x;
          n.oy = n.y;
          n.x += vx;
          n.y += vy;
        }

        for (let iter = 0; iter < 4; iter++) {
          for (let i = 0; i < this.wandNodes.length - 1; i++) {
            const a = this.wandNodes[i];
            const b = this.wandNodes[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1;
            const diff = (d - 13) / d;
            if (i === 0) {
              b.x -= dx * diff;
              b.y -= dy * diff;
            } else {
              a.x += dx * diff * 0.5;
              a.y += dy * diff * 0.5;
              b.x -= dx * diff * 0.5;
              b.y -= dy * diff * 0.5;
            }
          }
        }

        const tip = this.wandNodes[this.wandNodes.length - 1];
        this.cat.followWand(tip.x, tip.y);

        const catChestY = this.cat.y - 42 * this.cat.getScale();
        if (
          this.wandBatCooldown <= 0 &&
          Math.hypot(tip.x - this.cat.x, tip.y - catChestY) < 58 * this.cat.getScale()
        ) {
          this.wandBatCooldown = 0.55;
          this.cat.triggerPawBat(tip.x, tip.y);
          tip.ox = tip.x - (tip.x >= this.cat.x ? 22 : -22);
          tip.oy = tip.y + 18;
          if (window.MoeAudio) window.MoeAudio.playBell();
        }
      }

      // 2. Update Tossed Fish Treats
      for (let i = this.fishes.length - 1; i >= 0; i--) {
        const f = this.fishes[i];
        if (!f.landed) {
          f.vy += 680 * dt;
          f.y += f.vy * dt;
          if (f.y >= f.groundY) {
            f.y = f.groundY;
            if (Math.abs(f.vy) > 90) {
              f.vy = -f.vy * 0.35;
            } else {
              f.landed = true;
              f.vy = 0;
            }
          }
        }

        if (i === 0 && this.cat.munchTimer <= 0) {
          this.cat.chaseFish(f.x, f.groundY);
        }

        const reachDist = 38 * this.cat.getScale();
        if (f.landed && Math.hypot(this.cat.x - f.x, this.cat.y - f.groundY) < reachDist) {
          this.fishes.splice(i, 1);
          this.cat.eatFishNow();
          this.spawnHeart(this.cat.x, this.cat.y - 82 * this.cat.getScale(), 2);
          if (window.MoeAudio) window.MoeAudio.playMunch();
          if (this.fishes.length > 0) {
            const nextF = this.fishes[0];
            setTimeout(() => {
              if (this.fishes.includes(nextF)) {
                this.cat.chaseFish(nextF.x, nextF.groundY);
              }
            }, 950);
          }
        }
      }

      // 3. Update Rolling Felt Ball
      if (this.ball) {
        const b = this.ball;
        const bounds = this.cat.getFloorBounds();
        if (b.batCooldown > 0) b.batCooldown -= dt;

        if (b.z > 0 || b.vz !== 0) {
          b.vz -= 680 * dt;
          b.z += b.vz * dt;
          if (b.z <= 0) {
            b.z = 0;
            if (Math.abs(b.vz) > 65) {
              b.vz = -b.vz * 0.52;
            } else {
              b.vz = 0;
            }
          }
        }

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const friction = Math.pow(0.44, dt);
        b.vx *= friction;
        b.vy *= friction;
        b.rot += (b.vx * dt) / b.r;

        const minBX = bounds.minX + 18;
        const maxBX = bounds.maxX - 18;
        const minBY = bounds.minY + 14;
        const maxBY = bounds.maxY - 14;

        if (b.x < minBX) {
          b.x = minBX;
          b.vx = Math.max(Math.abs(b.vx) * 0.82, 95);
        } else if (b.x > maxBX) {
          b.x = maxBX;
          b.vx = -Math.max(Math.abs(b.vx) * 0.82, 95);
        }

        if (b.y < minBY) {
          b.y = minBY;
          b.vy = Math.max(Math.abs(b.vy) * 0.82, 75);
        } else if (b.y > maxBY) {
          b.y = maxBY;
          b.vy = -Math.max(Math.abs(b.vy) * 0.82, 75);
        }

        const catScale = this.cat.getScale();
        const dCat = Math.hypot(b.x - this.cat.x, b.y - this.cat.y);
        const ballSpeed = Math.hypot(b.vx, b.vy);

        if (b.restCooldown > 0) {
          b.restCooldown = Math.max(0, b.restCooldown - dt);
          if (b.restCooldown === 0 && this.mode === "ball") {
            b.rallyRemaining = 2 + Math.floor(Math.random() * 2);
          }
        }

        if (this.fishes.length === 0 && b.restCooldown <= 0 && (ballSpeed > 14 || b.rallyRemaining > 0)) {
          const catSpeed = Math.hypot(this.cat.vx, this.cat.vy);
          if (ballSpeed < 8 && catSpeed < 10 && this.cat.state === "chase_ball") {
            b.stallTime = (b.stallTime || 0) + dt;
            if (b.stallTime > 1.0) {
              b.rallyRemaining = 0;
              b.restCooldown = 3.0;
              b.stallTime = 0;
              this.cat.chooseNextWhim();
            }
          } else {
            b.stallTime = 0;
          }
          if (dCat > 36 * catScale) {
            this.cat.chaseBall(b.x, b.y);
          }
        }

        if (b.batCooldown <= 0 && b.restCooldown <= 0 && dCat < 54 * catScale && b.z < 28) {
          const shouldBat = ballSpeed > 10 || b.rallyRemaining > 0 || (this.mode === "roam" && Math.random() < 0.35);
          if (shouldBat) {
            b.batCooldown = 0.72;
            if (b.rallyRemaining > 0) b.rallyRemaining--;

            const centerX = (minBX + maxBX) * 0.5;
            const centerY = (minBY + maxBY) * 0.5;
            const edgeDistX = Math.min(b.x - minBX, maxBX - b.x);
            const edgeDistY = Math.min(b.y - minBY, maxBY - b.y);
            const minEdgeDist = Math.min(edgeDistX, edgeDistY);
            const edgeBias = Math.max(0, Math.min(1, 1 - minEdgeDist / 150));

            const awayDx = b.x - this.cat.x;
            const awayDy = b.y - this.cat.y;
            const awayLen = Math.hypot(awayDx, awayDy) || 1;

            const inDx = centerX - b.x;
            const inDy = centerY - b.y;
            const inLen = Math.hypot(inDx, inDy) || 1;

            const dirX = (awayDx / awayLen) * (1 - edgeBias * 0.85) + (inDx / inLen) * (edgeBias * 0.85);
            const dirY = (awayDy / awayLen) * (1 - edgeBias * 0.85) + (inDy / inLen) * (edgeBias * 0.85);
            const baseAngle = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.45;

            const kickSpeed = 250 + Math.random() * 130;
            b.vx = Math.cos(baseAngle) * kickSpeed;
            b.vy = Math.sin(baseAngle) * kickSpeed * 0.72;
            b.vz = 130;

            this.cat.triggerPawBat(b.x, b.y - 12);
            if (window.MoeAudio) window.MoeAudio.playBoing(1.12);

            if (b.rallyRemaining === 0) {
              b.restCooldown = 3.6 + Math.random() * 2.2;
              this.cat.enterState("sit", 2.8);
            }
          }
        }
      }

      // 3B. Update Red Laser Pointer & Trail
      if (this.mode === "laser") {
        const bounds = this.cat.getFloorBounds();
        let tx;
        let ty;
        if (this.pointer.active) {
          tx = Math.max(bounds.minX - 18, Math.min(bounds.maxX + 18, this.pointer.x));
          ty = Math.max(bounds.minY - 24, Math.min(bounds.maxY + 12, this.pointer.y));
        } else {
          // Playful autonomous figure-8 shimmer until the user moves the cursor
          const cx = (bounds.minX + bounds.maxX) * 0.5;
          const cy = (bounds.minY + bounds.maxY) * 0.55;
          tx = cx + Math.sin(this.time * 1.45) * Math.min(220, (bounds.maxX - bounds.minX) * 0.35);
          ty = cy + Math.sin(this.time * 2.9) * Math.min(85, (bounds.maxY - bounds.minY) * 0.30);
        }
        const followRate = 1 - Math.exp(-18 * dt);
        const prevLx = this.laser.x;
        const prevLy = this.laser.y;
        this.laser.x += (tx - this.laser.x) * followRate;
        this.laser.y += (ty - this.laser.y) * followRate;
        this.laser.active = true;

        if (Math.hypot(this.laser.x - prevLx, this.laser.y - prevLy) > 2.2) {
          this.laser.trail.push({ x: this.laser.x, y: this.laser.y, life: 1.0 });
          if (this.laser.trail.length > 16) this.laser.trail.shift();
        }
        for (let i = this.laser.trail.length - 1; i >= 0; i--) {
          this.laser.trail[i].life -= dt * 3.8;
          if (this.laser.trail[i].life <= 0) this.laser.trail.splice(i, 1);
        }
        this.cat.chaseLaser(this.laser.x, this.laser.y);
      }

      // 3C. Update Rainbow Soap Bubbles (Iridescent float + Kitty jump/paw pop!)
      if (this.bubbles.length > 0) {
        const scale = this.cat.getScale();
        const catHeadY = this.cat.y - this.cat.z - 56 * scale;
        const bounds = this.cat.getFloorBounds();
        let targetBubble = null;
        let bestBubbleDist = Infinity;

        for (let i = this.bubbles.length - 1; i >= 0; i--) {
          const bub = this.bubbles[i];
          bub.phase += dt * 2.4;
          bub.life -= dt;
          bub.x += (bub.vx + Math.sin(bub.phase) * 18) * dt;
          bub.y += (bub.vy + Math.cos(bub.phase * 0.8) * 6) * dt;
          bub.vx *= Math.pow(0.75, dt);

          if (bub.x < 24) { bub.x = 24; bub.vx = Math.abs(bub.vx) + 12; }
          if (bub.x > this.width - 24) { bub.x = this.width - 24; bub.vx = -Math.abs(bub.vx) - 12; }

          // Check if kitty swats or jumps right into the bubble!
          if (Math.hypot(bub.x - this.cat.x, bub.y - catHeadY) < (46 + bub.r) * scale) {
            this.bubbles.splice(i, 1);
            this.cat.triggerPawBat(bub.x, bub.y);
            this.spawnSparkles(bub.x, bub.y, 10, ["#FF9EC4", "#98E2F7", "#FFF09E", "#C6B6FF"]);
            if (window.MoeAudio) window.MoeAudio.playBubblePop();
            continue;
          }

          if (bub.life <= 0 || bub.y < -30) {
            if (bub.y >= 10) {
              this.spawnSparkles(bub.x, bub.y, 5, ["#C8EEFF", "#FFD1E3"]);
            }
            this.bubbles.splice(i, 1);
            continue;
          }

          if (bub.y > bounds.minY - 120) {
            const d = Math.hypot(bub.x - this.cat.x, bub.y - this.cat.y);
            if (d < bestBubbleDist) {
              bestBubbleDist = d;
              targetBubble = bub;
            }
          }
        }

        if (
          targetBubble &&
          this.fishes.length === 0 &&
          this.catnips.length === 0 &&
          this.mode === "bubble" &&
          this.cat.state !== "roll" &&
          this.cat.state !== "spin" &&
          this.cat.state !== "jump"
        ) {
          const dx = Math.abs(targetBubble.x - this.cat.x);
          const heightAbove = this.cat.y - targetBubble.y;
          if (dx < 92 * scale && heightAbove > 46 * scale && heightAbove < 175 * scale && this.cat.z <= 1 && this.cat.jumpPrepTimer <= 0) {
            this.cat.startJumpToward(
              targetBubble.x,
              Math.max(bounds.minY + 12, Math.min(bounds.maxY - 10, targetBubble.y + 42)),
              78
            );
          } else {
            this.cat.chaseBubble(
              targetBubble.x,
              Math.max(bounds.minY + 12, Math.min(bounds.maxY - 10, targetBubble.y + 48))
            );
          }
        }
      }

      // 3D. Update Aromatic Catnip Leaf Clusters
      for (const cn of this.catnips) {
        cn.phase += dt * 2.2;
      }
      if (
        this.catnips.length > 0 &&
        this.fishes.length === 0 &&
        this.cat.state !== "roll" &&
        this.cat.state !== "spin" &&
        this.cat.state !== "jump" &&
        this.cat.munchTimer <= 0
      ) {
        const cn = this.catnips[0];
        this.cat.chaseCatnip(cn.x, cn.y);
      }

      // 4. Delicate Butterfly
      const bf = this.butterfly;
      if (!bf.active) {
        if (this.theme !== "night" && this.mode === "roam" && this.fishes.length === 0) {
          bf.timer -= dt;
          if (bf.timer <= 0) {
            bf.active = true;
            bf.phase = 0;
            bf.x = Math.random() < 0.5 ? -24 : this.width + 24;
            bf.y = this.height * (0.36 + Math.random() * 0.28);
          }
        }
      } else {
        bf.phase += dt;
        const targetX = this.width * 0.5 + Math.sin(bf.phase * 0.55) * (this.width * 0.36);
        const targetY = this.height * 0.48 + Math.sin(bf.phase * 1.35) * (this.height * 0.12);
        bf.x += (targetX - bf.x) * dt * 1.1;
        bf.y += (targetY - bf.y) * dt * 1.1;
        if (bf.phase > 18 || this.theme === "night" || this.mode !== "roam") {
          bf.active = false;
          bf.timer = 9 + Math.random() * 8;
        }
      }

      // 5. Update Cat & Sleepy Night Zzz
      this.cat.update(dt);
      if (this.cat.state === "lie" && this.cat.idleSleepTimer > 2.2) {
        this.zzzTimer -= dt;
        if (this.zzzTimer <= 0) {
          this.zzzTimer = 1.65;
          const s = this.cat.getScale();
          this.spawnZzz(this.cat.x + 28 * this.cat.bodyDir * s, this.cat.y - 54 * s);
        }
      } else {
        this.zzzTimer = 0.6;
      }

      // 6. Paw Prints, Ripples, Motes & Particles
      for (let i = this.pawPrints.length - 1; i >= 0; i--) {
        this.pawPrints[i].life -= dt * 0.22;
        if (this.pawPrints[i].life <= 0) this.pawPrints.splice(i, 1);
      }

      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        r.r += (r.maxR - r.r) * dt * 5.5;
        r.life -= dt * 1.35;
        if (r.life <= 0) this.ripples.splice(i, 1);
      }

      for (const m of this.motes) {
        m.phase += dt * 1.4;
        m.x += (m.vx + Math.sin(m.phase) * 5) * dt;
        m.y += (m.vy + Math.cos(m.phase) * 4) * dt;
        if (m.x > this.width + 20) m.x = -20;
        if (m.y < -20) m.y = this.height + 20;
        if (m.y > this.height + 20) m.y = -20;
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    }

    // =========================================================================
    // Cozy Living Room & Widescreen Render Pipeline
    // =========================================================================

    render() {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;
      const L = this.getRoomLayout();
      const night = this.pal.nightFactor;

      // 1. Warm Plaster Back Wall + Honey-Oak Wooden Floor
      const wallGrad = ctx.createLinearGradient(0, 0, 0, L.horizonY);
      wallGrad.addColorStop(0, rgbStr(this.pal.wallTop));
      wallGrad.addColorStop(1, rgbStr(this.pal.wallBot));
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, 0, w, L.horizonY);

      const floorGrad = ctx.createLinearGradient(0, L.horizonY, 0, h);
      floorGrad.addColorStop(0, rgbStr(this.pal.floorTop));
      floorGrad.addColorStop(1, rgbStr(this.pal.floorBot));
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, L.horizonY, w, h - L.horizonY);

      // Subtle Wooden Floorboard Perspective Lines
      ctx.save();
      ctx.strokeStyle = night > 0.5 ? "rgba(255, 255, 255, 0.03)" : "rgba(130, 102, 74, 0.075)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Horizontal plank rows widening gently with perspective
      let py = L.horizonY + 26;
      let stepY = 28;
      while (py < h) {
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        py += stepY;
        stepY *= 1.18;
      }
      // Gentle radiating perspective grain lines
      const vanishX = w * 0.5;
      const vanishY = L.horizonY - 190;
      for (let i = -5; i <= 5; i++) {
        const bx = w * 0.5 + i * (w * 0.14);
        const tStart = (L.horizonY - vanishY) / (h - vanishY);
        const sx = lerp(vanishX, bx, tStart);
        ctx.moveTo(sx, L.horizonY);
        ctx.lineTo(bx, h);
      }
      ctx.stroke();
      ctx.restore();

      // Clean Minimalist Wooden Baseboard ("踢脚线")
      ctx.fillStyle = rgbStr(this.pal.baseboard);
      ctx.fillRect(0, L.horizonY - 9, w, 9);
      ctx.fillStyle = night > 0.5 ? "rgba(0, 0, 0, 0.28)" : "rgba(125, 105, 85, 0.12)";
      ctx.fillRect(0, L.horizonY - 1, w, 2);

      // 2. Back-Wall Cozy Living Scene (Window, Clock & Framed Art)
      this.drawSunlitWindow(ctx, L.win, night);
      this.drawClockAndFrames(ctx, L, night);

      // 3. Floor-Level Flat Rug, Owner's Reading Book & Slanted Window Light Patch (Underneath Kitty!)
      this.drawCozyRug(ctx, L.rug, night);
      this.drawReadingCorner(ctx, L, night);
      this.drawWindowFloorLight(ctx, L, night);

      // 4. Faint Fading Paw Prints & Call-Over Ripples
      for (const p of this.pawPrints) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(p.scale, p.scale * 0.65);
        ctx.fillStyle = night > 0.5
          ? `rgba(255, 255, 255, ${(p.life * 0.05).toFixed(3)})`
          : `rgba(105, 85, 68, ${(p.life * 0.06).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.6, 3.0, 0, 0, Math.PI * 2);
        ctx.ellipse(4.2, -2.6, 1.5, 1.2, 0, 0, Math.PI * 2);
        ctx.ellipse(5.0, 0, 1.5, 1.2, 0, 0, Math.PI * 2);
        ctx.ellipse(4.2, 2.6, 1.5, 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const r of this.ripples) {
        ctx.strokeStyle = night > 0.5
          ? `rgba(240, 242, 255, ${(r.life * 0.30).toFixed(3)})`
          : `rgba(110, 92, 76, ${(r.life * 0.25).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.r, r.r * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 4B. Aromatic Catnip Leaf Clusters on the Floor (Underneath Kitty so it can roll on them!)
      for (const cn of this.catnips) {
        this.drawCatnip(ctx, cn, night);
      }

      // 5. 2.5D Depth-Sorted Living Room Props + Cat + Toys!
      const renderQueue = [];
      renderQueue.push({ y: L.condo.y, draw: () => this.drawCatCondo(ctx, L.condo, night) });
      if (L.plant.x > 0) {
        renderQueue.push({ y: L.plant.y, draw: () => this.drawPottedPlant(ctx, L.plant, night) });
      }
      renderQueue.push({ y: L.lamp.y, draw: () => this.drawFloorLamp(ctx, L.lamp, night) });
      renderQueue.push({ y: L.bed.y - 6, draw: () => this.drawCatBed(ctx, L.bed, night) });
      renderQueue.push({ y: L.bowls.y, draw: () => this.drawCatBowls(ctx, L.bowls, night) });

      renderQueue.push({ y: this.cat.y, draw: () => this.cat.render(ctx) });

      for (const f of this.fishes) {
        renderQueue.push({ y: f.groundY, draw: () => this.drawFish(ctx, f) });
      }
      if (this.ball) {
        renderQueue.push({ y: this.ball.y, draw: () => this.drawBall(ctx, this.ball) });
      }

      renderQueue.sort((a, b) => a.y - b.y);
      for (const item of renderQueue) {
        item.draw();
      }

      // 6. Warm Cozy Floor-Lamp Light Cone Overlay (Makes Dusk/Night super warm & homey!)
      if (this.lampGlow > 0.01) {
        this.drawLampWarmGlow(ctx, L.lamp, this.lampGlow);
      }

      // 7. Delicate Butterfly & Feather Ribbon Wand
      if (this.butterfly.active) {
        const bf = this.butterfly;
        const flap = 0.25 + 0.75 * Math.abs(Math.sin(bf.phase * 15));
        ctx.save();
        ctx.translate(bf.x, bf.y);
        ctx.scale(flap, 1);
        ctx.fillStyle = night > 0.5 ? "#F5DFA6" : "#F2B880";
        ctx.beginPath();
        ctx.ellipse(-5, -2, 6, 4, -0.3, 0, Math.PI * 2);
        ctx.ellipse(5, -2, 6, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (this.mode === "wand") {
        this.drawWand(ctx);
      }

      if (this.laser.active) {
        this.drawLaser(ctx);
      }

      if (this.bubbles.length > 0) {
        this.drawBubbles(ctx);
      }

      // 8. Soft Floating Sunlit Dust Motes & Hearts/Notes/Sparkles/Zzz
      for (const m of this.motes) {
        ctx.fillStyle = night > 0.5
          ? "rgba(255, 236, 195, 0.14)"
          : "rgba(255, 248, 232, 0.38)";
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const p of this.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.translate(p.x, p.y);
        if (p.type === "heart") {
          ctx.fillStyle = "#EB859B";
          const s = p.size;
          ctx.beginPath();
          ctx.moveTo(0, s * 0.35);
          ctx.bezierCurveTo(-s, -s * 0.35, -s * 0.55, -s, 0, -s * 0.42);
          ctx.bezierCurveTo(s * 0.55, -s, s, -s * 0.35, 0, s * 0.35);
          ctx.fill();
        } else if (p.type === "note") {
          ctx.fillStyle = night > 0.5 ? "rgba(255, 235, 200, 0.75)" : "rgba(95, 82, 74, 0.58)";
          ctx.font = `500 ${p.size}px sans-serif`;
          ctx.fillText(p.text, 0, 0);
        } else if (p.type === "sparkle") {
          ctx.fillStyle = p.color || "#FFE58F";
          const s = p.size * (0.5 + 0.5 * p.life);
          ctx.beginPath();
          ctx.moveTo(0, -s * 1.4);
          ctx.quadraticCurveTo(0, 0, s * 1.4, 0);
          ctx.quadraticCurveTo(0, 0, 0, s * 1.4);
          ctx.quadraticCurveTo(0, 0, -s * 1.4, 0);
          ctx.quadraticCurveTo(0, 0, 0, -s * 1.4);
          ctx.closePath();
          ctx.fill();
        } else if (p.type === "zzz") {
          ctx.fillStyle = night > 0.5 ? "rgba(218, 224, 255, 0.72)" : "rgba(125, 114, 108, 0.52)";
          ctx.font = `600 ${Math.round(p.size)}px sans-serif`;
          ctx.fillText(p.text, 0, 0);
        }
        ctx.restore();
      }
    }

    // --- Living Room Scene Component Renderers ---

    drawSunlitWindow(ctx, win, night) {
      const { x, y, w, h } = win;
      ctx.save();

      // Window sky backdrop
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h);
      ctx.save();
      ctx.clip();

      const skyGrad = ctx.createLinearGradient(x, y, x, y + h);
      skyGrad.addColorStop(0, rgbStr(this.pal.skyTop));
      skyGrad.addColorStop(1, rgbStr(this.pal.skyBot));
      ctx.fillStyle = skyGrad;
      ctx.fillRect(x, y, w, h);

      // Night stars & crescent moon inside window
      if (night > 0.15) {
        for (const s of this.windowStars) {
          const tw = 0.3 + 0.7 * Math.abs(Math.sin(this.time * 1.6 + s.phase));
          ctx.fillStyle = `rgba(255, 250, 224, ${(night * tw * 0.85).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x + s.rx * w, y + s.ry * h, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        // Soft Glowing Full Moon inside Night Window
        const mx = x + w * 0.74;
        const my = y + h * 0.28;
        ctx.fillStyle = `rgba(255, 241, 182, ${(night * 0.22).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(mx, my, 19, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 244, 196, ${Math.min(1, night * 1.1).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(mx, my, 11.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Drifting single-contour fluffy clouds
      const cloudAlpha = lerp(0.86, 0.10, night);
      ctx.fillStyle = `rgba(255, 253, 248, ${cloudAlpha.toFixed(2)})`;
      for (const c of this.clouds) {
        const cx = x + c.rx * w;
        const cy = y + c.ry * h;
        const s = c.s;
        ctx.beginPath();
        ctx.moveTo(cx - 16 * s, cy + 9 * s);
        ctx.bezierCurveTo(cx - 26 * s, cy + 9 * s, cx - 26 * s, cy - 5 * s, cx - 13 * s, cy - 6 * s);
        ctx.bezierCurveTo(cx - 9 * s, cy - 19 * s, cx + 11 * s, cy - 19 * s, cx + 15 * s, cy - 6 * s);
        ctx.bezierCurveTo(cx + 27 * s, cy - 5 * s, cx + 27 * s, cy + 9 * s, cx + 16 * s, cy + 9 * s);
        ctx.closePath();
        ctx.fill();
      }

      // Soft distant garden foliage along bottom of window
      ctx.fillStyle = night > 0.5 ? "#24304B" : (this.theme === "dusk" ? "#9B8694" : "#A6D6B0");
      ctx.beginPath();
      ctx.arc(x + w * 0.16, y + h + 6, 36, Math.PI, 0);
      ctx.arc(x + w * 0.42, y + h + 10, 44, Math.PI, 0);
      ctx.arc(x + w * 0.85, y + h + 8, 38, Math.PI, 0);
      ctx.fill();

      ctx.restore(); // End sky clip

      // Warm Wooden Window Frame & Mullion Crossbars
      const frameCol = night > 0.5 ? "#464960" : "#E5D5C1";
      ctx.strokeStyle = frameCol;
      ctx.lineWidth = 6;
      ctx.strokeRect(x, y, w, h);

      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y);
      ctx.lineTo(x + w * 0.5, y + h);
      ctx.moveTo(x, y + h * 0.58);
      ctx.lineTo(x + w, y + h * 0.58);
      ctx.stroke();

      // Gently Swaying Sheer Linen Curtains (Left & Right)
      const breeze = Math.sin(this.time * 1.1) * 4;
      const curtainFill = night > 0.5 ? "rgba(74, 79, 104, 0.72)" : "rgba(255, 252, 246, 0.82)";
      ctx.fillStyle = curtainFill;

      // Left curtain
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 6);
      ctx.lineTo(x + 36, y - 6);
      ctx.quadraticCurveTo(x + 26 + breeze, y + h * 0.55, x + 18 + breeze * 1.3, y + h + 10);
      ctx.lineTo(x - 12, y + h + 8);
      ctx.closePath();
      ctx.fill();

      // Right curtain
      ctx.beginPath();
      ctx.moveTo(x + w + 10, y - 6);
      ctx.lineTo(x + w - 36, y - 6);
      ctx.quadraticCurveTo(x + w - 26 - breeze, y + h * 0.55, x + w - 18 - breeze * 1.3, y + h + 10);
      ctx.lineTo(x + w + 12, y + h + 8);
      ctx.closePath();
      ctx.fill();

      // Wooden Window Sill
      ctx.fillStyle = night > 0.5 ? "#52556E" : "#DFCCB5";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - 14, y + h - 2, w + 28, 9, 4) : ctx.rect(x - 14, y + h - 2, w + 28, 9);
      ctx.fill();

      // Sill Prop 1: Tiny Potted Cat Grass
      const gx = x + w * 0.28;
      const gy = y + h - 2;
      const wig = Math.sin(this.time * 18) * this.grassWiggle * 5 + Math.sin(this.time * 1.8) * 1.2;
      ctx.strokeStyle = night > 0.5 ? "#5B8E6D" : "#78C289";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(gx - 3, gy - 12); ctx.quadraticCurveTo(gx - 7, gy - 22, gx - 9 + wig, gy - 28);
      ctx.moveTo(gx, gy - 12);     ctx.quadraticCurveTo(gx, gy - 24, gx + 1 + wig, gy - 32);
      ctx.moveTo(gx + 3, gy - 12); ctx.quadraticCurveTo(gx + 8, gy - 22, gx + 10 + wig, gy - 27);
      ctx.stroke();

      ctx.fillStyle = night > 0.5 ? "#8C6558" : "#E59A7C";
      ctx.beginPath();
      ctx.moveTo(gx - 8, gy - 13);
      ctx.lineTo(gx + 8, gy - 13);
      ctx.lineTo(gx + 6, gy);
      ctx.lineTo(gx - 6, gy);
      ctx.closePath();
      ctx.fill();

      // Sill Prop 2: Steaming Ceramic Tea/Coffee Mug (Living-together warmth!)
      const mx = x + w * 0.73;
      const my = y + h - 2;
      ctx.fillStyle = night > 0.5 ? "#B8B9CC" : "#FFFBF6";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(mx - 7, my - 13, 14, 13, 3) : ctx.rect(mx - 7, my - 13, 14, 13);
      ctx.fill();
      ctx.strokeStyle = night > 0.5 ? "#B8B9CC" : "#EFE6DC";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx + 7, my - 6.5, 3.5, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();

      // Rising warm steam wisps
      const steamShift = (this.time * 12) % 16;
      const steamAlpha = (1 - steamShift / 16) * (night > 0.5 ? 0.25 : 0.45);
      ctx.strokeStyle = `rgba(255, 255, 255, ${steamAlpha.toFixed(2)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx - 2, my - 16 - steamShift * 0.5);
      ctx.quadraticCurveTo(mx - 5, my - 21 - steamShift * 0.6, mx - 1, my - 26 - steamShift * 0.7);
      ctx.moveTo(mx + 3, my - 15 - ((steamShift + 8) % 16) * 0.5);
      ctx.quadraticCurveTo(mx + 6, my - 20 - ((steamShift + 8) % 16) * 0.6, mx + 2, my - 25 - ((steamShift + 8) % 16) * 0.7);
      ctx.stroke();

      ctx.restore();
    }

    drawClockAndFrames(ctx, L, night) {
      const { x, y, r } = L.clock;
      ctx.save();

      // 1. Scene-Synced Minimalist Wooden Wall Clock (09:20 Day / 17:50 Dusk / 22:30 Night + live ticking!)
      ctx.fillStyle = night > 0.5 ? "#2B2F44" : "#FCFBF8";
      ctx.strokeStyle = night > 0.5 ? "#635A56" : "#D6BE9F";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Subtle 12 / 3 / 6 / 9 dial dots
      ctx.fillStyle = night > 0.5 ? "rgba(203, 208, 230, 0.35)" : "rgba(120, 108, 96, 0.32)";
      for (let q = 0; q < 4; q++) {
        const qa = (q * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(x + Math.sin(qa) * (r * 0.78), y - Math.cos(qa) * (r * 0.78), 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      const totalMin = this.clockMinutes + this.time / 60;
      const min = totalMin % 60;
      const hr = (totalMin / 60) % 12;

      const handCol = night > 0.5 ? "#CBD0E6" : "#5B544E";
      ctx.strokeStyle = handCol;
      ctx.lineCap = "round";
      // Hour hand
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin((hr * Math.PI) / 6) * (r * 0.48), y - Math.cos((hr * Math.PI) / 6) * (r * 0.48));
      ctx.stroke();
      // Minute hand
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin((min * Math.PI) / 30) * (r * 0.72), y - Math.cos((min * Math.PI) / 30) * (r * 0.72));
      ctx.stroke();
      // Center pin
      ctx.fillStyle = "#E09A82";
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // 2. Framed Mini Portrait of Our Blue-White Kitty (Desktop / Tablet)
      if (!L.compact) {
        const fx = x + 54;
        const fy = y + 8;
        const fw = 42;
        const fh = 50;

        // Soft frame shadow & oak frame
        ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
        ctx.fillRect(fx + 2, fy + 3, fw, fh);

        ctx.fillStyle = night > 0.5 ? "#353A52" : "#FFFDF9";
        ctx.strokeStyle = night > 0.5 ? "#6B605B" : "#D8C1A3";
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.rect(fx, fy, fw, fh);
        ctx.fill();
        ctx.stroke();

        // Cute mini portrait of our smudge-mustache cat inside the frame!
        const cx = fx + fw * 0.5;
        const cy = fy + fh * 0.56;
        ctx.fillStyle = night > 0.5 ? "#44495C" : "#F6EBE6";
        ctx.fillRect(fx + 5, fy + 5, fw - 10, fh - 10);

        // Mini ears & round blue-grey head
        ctx.fillStyle = "#4A5060";
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy - 3); ctx.lineTo(cx - 9, cy - 13); ctx.lineTo(cx - 3, cy - 8);
        ctx.moveTo(cx + 10, cy - 3); ctx.lineTo(cx + 9, cy - 13); ctx.lineTo(cx + 3, cy - 8);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx, cy, 11, 9.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Mini white inverted-V blaze + tiny smudge
        ctx.fillStyle = "#FCFBF9";
        ctx.beginPath();
        ctx.moveTo(cx, cy - 3);
        ctx.lineTo(cx - 7, cy + 6);
        ctx.quadraticCurveTo(cx, cy + 10, cx + 7, cy + 6);
        ctx.closePath();
        ctx.fill();

        // Tiny amber eyes & signature smudge
        ctx.fillStyle = "#D88227";
        ctx.beginPath();
        ctx.arc(cx - 4.5, cy - 1, 1.8, 0, Math.PI * 2);
        ctx.arc(cx + 4.5, cy - 1, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4F5566";
        ctx.beginPath();
        ctx.arc(cx - 2.2, cy + 4.2, 1.5, 0, Math.PI * 2);
        ctx.arc(cx + 2.2, cy + 4.6, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    drawCozyRug(ctx, rug, night) {
      const { x, y, rx, ry } = rug;
      ctx.save();

      // Subtle woven rug thickness shadow
      ctx.fillStyle = night > 0.5 ? "rgba(10, 12, 22, 0.32)" : "rgba(135, 112, 88, 0.14)";
      ctx.beginPath();
      ctx.ellipse(x, y + 3.5, rx + 2, ry + 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Soft warm oatmeal-cream woven rug body
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = night > 0.5 ? "#373B52" : "#F6F0E4";
      ctx.fill();

      // Subtle muted pastel woven stripes inside rug (gentle nod to original photo blanket!)
      ctx.save();
      ctx.clip();
      ctx.translate(x, y);
      ctx.rotate(-0.22);
      const stripeAlpha = night > 0.5 ? 0.14 : 0.34;
      const colors = [
        `rgba(170, 218, 184, ${stripeAlpha})`,
        `rgba(246, 228, 162, ${stripeAlpha})`,
        `rgba(182, 216, 238, ${stripeAlpha})`
      ];
      for (let i = -8; i <= 8; i++) {
        ctx.fillStyle = colors[((i % 3) + 3) % 3];
        ctx.fillRect(i * 38 - 10, -ry * 2.2, 18, ry * 4.4);
      }
      ctx.restore();

      // Inner stitched border ring
      ctx.strokeStyle = night > 0.5 ? "rgba(255, 255, 255, 0.08)" : "rgba(210, 196, 176, 0.65)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.ellipse(x, y, rx - 9, ry - 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();
    }

    /**
     * Warm "Living Together" Storytelling Detail:
     * An open book with a ribbon bookmark & a pair of soft home slippers resting beside the rug.
     */
    drawReadingCorner(ctx, L, night) {
      if (L.compact) return;
      const { rug } = L;

      // 1. Open Hardcover Book resting near the left-front edge of the rug
      const bx = rug.x - rug.rx * 0.72;
      const by = rug.y + rug.ry * 0.52;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(-0.16);

      // Book cover & shadow
      ctx.fillStyle = night > 0.5 ? "rgba(0, 0, 0, 0.28)" : "rgba(110, 90, 70, 0.14)";
      ctx.fillRect(-20, -9, 40, 22);
      ctx.fillStyle = night > 0.5 ? "#5D6986" : "#8FAEC4";
      ctx.fillRect(-21, -11, 42, 22);

      // Creamy open pages (left & right spread)
      ctx.fillStyle = night > 0.5 ? "#C9CCD9" : "#FFFDF8";
      ctx.beginPath();
      ctx.moveTo(-19, -9);
      ctx.quadraticCurveTo(-9, -11, 0, -8);
      ctx.quadraticCurveTo(9, -11, 19, -9);
      ctx.lineTo(19, 9);
      ctx.quadraticCurveTo(9, 7, 0, 10);
      ctx.quadraticCurveTo(-9, 7, -19, 9);
      ctx.closePath();
      ctx.fill();

      // Center spine & pink ribbon bookmark
      ctx.strokeStyle = "rgba(140, 125, 110, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 10);
      ctx.stroke();

      ctx.strokeStyle = "#E58A9E";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 9);
      ctx.quadraticCurveTo(3, 14, 1, 17);
      ctx.stroke();
      ctx.restore();

      // 2. Pair of Soft Cozy Home Slippers tucked near the right edge of the rug
      const sx = rug.x + rug.rx * 0.86;
      const sy = rug.y + rug.ry * 0.38;
      for (let i = 0; i < 2; i++) {
        ctx.save();
        ctx.translate(sx + i * 16, sy + i * 5);
        ctx.rotate(-0.42 + i * 0.12);
        ctx.fillStyle = night > 0.5 ? "rgba(0,0,0,0.25)" : "rgba(110, 90, 70, 0.12)";
        ctx.beginPath();
        ctx.ellipse(0, 1.5, 11, 5.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = night > 0.5 ? "#6E6578" : "#EED5CA";
        ctx.beginPath();
        ctx.ellipse(0, 0, 10.5, 5.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = night > 0.5 ? "#504959" : "#FAF3ED";
        ctx.beginPath();
        ctx.ellipse(-3.5, 0, 5.2, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    drawWindowFloorLight(ctx, L, night) {
      if (this.pal.sunPatchAlpha <= 0.01) return;
      const { win, horizonY } = L;
      ctx.save();

      const topX1 = win.x + 18;
      const topX2 = win.x + win.w - 18;
      const floorY1 = horizonY + 22;
      const floorY2 = Math.min(this.height - 55, horizonY + (this.height - horizonY) * 0.56);
      const slant = this.theme === "dusk" ? 95 : 55;

      const grad = ctx.createLinearGradient(topX1, floorY1, topX1 + slant, floorY2);
      const patchColor = night > 0.5
        ? [180, 198, 255]
        : (this.theme === "dusk" ? [255, 214, 182] : [255, 252, 236]);
      grad.addColorStop(0, rgbStr(patchColor, this.pal.sunPatchAlpha));
      grad.addColorStop(1, rgbStr(patchColor, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(topX1, floorY1);
      ctx.lineTo(topX2, floorY1);
      ctx.lineTo(topX2 + slant * 1.35, floorY2);
      ctx.lineTo(topX1 + slant * 0.65, floorY2);
      ctx.closePath();
      ctx.fill();

      // Window cross-mullion shadow lines inside the sunlit floor patch
      ctx.strokeStyle = night > 0.5 ? "rgba(35, 38, 54, 0.16)" : "rgba(220, 202, 178, 0.22)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo((topX1 + topX2) * 0.5, floorY1);
      ctx.lineTo((topX1 + topX2) * 0.5 + slant, floorY2);
      ctx.stroke();

      ctx.restore();
    }

    drawCatCondo(ctx, condo, night) {
      const { x, y } = condo;
      ctx.save();
      ctx.translate(x, y);

      // Floor shadow
      ctx.fillStyle = night > 0.5 ? "rgba(0,0,0,0.32)" : "rgba(95, 78, 62, 0.14)";
      ctx.beginPath();
      ctx.ellipse(6, 4, 46, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Low Wooden Cat Box / Condo
      ctx.fillStyle = night > 0.5 ? "#433E4F" : "#DFC5A5";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-34, -44, 54, 46, 6) : ctx.rect(-34, -44, 54, 46);
      ctx.fill();

      // Cozy arched cat-hole entrance inside box
      ctx.fillStyle = night > 0.5 ? "#242230" : "#7A6352";
      ctx.beginPath();
      ctx.moveTo(-20, 2);
      ctx.lineTo(-20, -14);
      ctx.bezierCurveTo(-20, -31, 6, -31, 6, -14);
      ctx.lineTo(6, 2);
      ctx.closePath();
      ctx.fill();

      // Sisal Rope Scratching Post + Top Perch
      ctx.fillStyle = night > 0.5 ? "#635B54" : "#CBB292";
      ctx.fillRect(20, -78, 11, 78);
      // Rope texture lines
      ctx.strokeStyle = "rgba(90, 72, 52, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let ry = -72; ry < -6; ry += 6) {
        ctx.moveTo(20, ry);
        ctx.lineTo(31, ry + 2);
      }
      ctx.stroke();

      // Plush top perch platform
      ctx.fillStyle = night > 0.5 ? "#575B75" : "#F7F2E9";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(4, -85, 42, 9, 4.5) : ctx.rect(4, -85, 42, 9);
      ctx.fill();

      // Dangling Interactive Pom-Pom Ball!
      const px = 40 + Math.sin(this.pomPomAngle) * 18;
      const py = -76 + Math.cos(this.pomPomAngle) * 20;
      ctx.strokeStyle = night > 0.5 ? "#9DA2BE" : "#A89888";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(40, -76);
      ctx.lineTo(px, py);
      ctx.stroke();

      ctx.fillStyle = "#F09CB0";
      ctx.beginPath();
      ctx.arc(px, py, 5.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    drawCatBed(ctx, bed, night) {
      const { x, y, rx, ry } = bed;
      ctx.save();

      ctx.fillStyle = night > 0.5 ? "rgba(0,0,0,0.30)" : "rgba(95, 78, 62, 0.14)";
      ctx.beginPath();
      ctx.ellipse(x, y + 4, rx + 3, ry + 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Outer plush donut bolster rim
      ctx.fillStyle = night > 0.5 ? "#4F5470" : "#EBD9CE";
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner warm fleece cushion
      ctx.fillStyle = night > 0.5 ? "#63698A" : "#FAF4EC";
      ctx.beginPath();
      ctx.ellipse(x, y - 1.5, rx * 0.72, ry * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    drawPottedPlant(ctx, plant, night) {
      const { x, y } = plant;
      ctx.save();
      ctx.translate(x, y);

      const sway = Math.sin(this.time * 1.3) * 2.2;

      // Shadow
      ctx.fillStyle = night > 0.5 ? "rgba(0,0,0,0.3)" : "rgba(95, 78, 62, 0.14)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Leaves & Stems
      ctx.strokeStyle = night > 0.5 ? "#3E584C" : "#6A9B76";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      const leaves = [
        { tx: -18 + sway, ty: -58, rx: 11, ry: 6, rot: -0.5 },
        { tx: -4 + sway * 1.2, ty: -74, rx: 12, ry: 7, rot: -0.1 },
        { tx: 16 + sway, ty: -62, rx: 11, ry: 6.5, rot: 0.45 },
        { tx: -14 + sway * 0.7, ty: -38, rx: 9, ry: 5.5, rot: -0.6 },
        { tx: 13 + sway * 0.8, ty: -42, rx: 9.5, ry: 5.5, rot: 0.5 }
      ];
      for (const lf of leaves) {
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.quadraticCurveTo(lf.tx * 0.4, (lf.ty - 22) * 0.5, lf.tx, lf.ty);
        ctx.stroke();

        ctx.save();
        ctx.translate(lf.tx, lf.ty);
        ctx.rotate(lf.rot);
        ctx.fillStyle = night > 0.5 ? "#466958" : "#7CB388";
        ctx.beginPath();
        ctx.ellipse(0, 0, lf.rx, lf.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Woven planter basket
      ctx.fillStyle = night > 0.5 ? "#5C5149" : "#D9B996";
      ctx.beginPath();
      ctx.moveTo(-15, -26);
      ctx.lineTo(15, -26);
      ctx.lineTo(12, 2);
      ctx.lineTo(-12, 2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    drawFloorLamp(ctx, lamp, night) {
      const { x, y, shadeY } = lamp;
      const poleTop = shadeY + 12;
      ctx.save();

      // Base shadow & wooden round base
      ctx.fillStyle = night > 0.5 ? "rgba(0,0,0,0.34)" : "rgba(95, 78, 62, 0.15)";
      ctx.beginPath();
      ctx.ellipse(x, y + 3, 20, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = night > 0.5 ? "#5D534B" : "#C9AE8E";
      ctx.beginPath();
      ctx.ellipse(x, y, 16, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Slender brass/wood stand pole
      ctx.strokeStyle = night > 0.5 ? "#786E65" : "#C4A886";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, poleTop);
      ctx.stroke();

      // Pull-chain switch detail
      ctx.strokeStyle = "rgba(180, 160, 130, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 6, shadeY + 14);
      ctx.lineTo(x + 6, shadeY + 25);
      ctx.stroke();
      ctx.fillStyle = "#E5B976";
      ctx.beginPath();
      ctx.arc(x + 6, shadeY + 26, 2, 0, Math.PI * 2);
      ctx.fill();

      // Warm Pleated Linen Lampshade
      const lit = this.lampGlow;
      ctx.fillStyle = lit > 0.2
        ? `rgb(${Math.round(lerp(244, 255, lit))}, ${Math.round(lerp(236, 232, lit))}, ${Math.round(lerp(222, 178, lit))})`
        : (night > 0.5 ? "#4D526B" : "#F6EFE4");
      ctx.beginPath();
      ctx.moveTo(x - 13, shadeY - 14);
      ctx.lineTo(x + 13, shadeY - 14);
      ctx.lineTo(x + 21, shadeY + 14);
      ctx.lineTo(x - 21, shadeY + 14);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    drawLampWarmGlow(ctx, lamp, glow) {
      const { x, y, shadeY } = lamp;
      ctx.save();
      // Soft golden halo around lampshade & warm cone onto living room floor
      const halo = ctx.createRadialGradient(x, shadeY + 8, 6, x - 24, y + 35, 290);
      halo.addColorStop(0, `rgba(255, 224, 152, ${(glow * 0.34).toFixed(3)})`);
      halo.addColorStop(0.45, `rgba(255, 206, 132, ${(glow * 0.14).toFixed(3)})`);
      halo.addColorStop(1, "rgba(255, 200, 120, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x - 15, (shadeY + y) * 0.5 + 20, 300, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawCatBowls(ctx, bowls, night) {
      const { x, y } = bowls;
      ctx.save();
      ctx.translate(x, y);

      // Low wooden feeding tray
      ctx.fillStyle = night > 0.5 ? "rgba(0,0,0,0.3)" : "rgba(95, 78, 62, 0.14)";
      ctx.beginPath();
      ctx.ellipse(0, 5, 32, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = night > 0.5 ? "#574D47" : "#D6BA99";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-28, -3, 56, 8, 4) : ctx.rect(-28, -3, 56, 8);
      ctx.fill();

      // Left Bowl: Crunchy Cat Food Bowl
      this.drawSingleBowl(ctx, -13, -3, "#F5EFE6", "#C88A56", this.bowlFoodLevel > 0.1, night);
      // Right Bowl: Fresh Water Bowl
      this.drawSingleBowl(ctx, 13, -3, "#F5EFE6", "#9ED4F0", true, night);

      ctx.restore();
    }

    drawSingleBowl(ctx, bx, by, rimCol, innerCol, hasFill, night) {
      ctx.fillStyle = night > 0.5 ? "#878B9E" : rimCol;
      ctx.beginPath();
      ctx.moveTo(bx - 10, by - 6);
      ctx.lineTo(bx + 10, by - 6);
      ctx.lineTo(bx + 8, by + 1);
      ctx.lineTo(bx - 8, by + 1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = night > 0.5 ? "#5B6075" : "#E5DDD2";
      ctx.beginPath();
      ctx.ellipse(bx, by - 6, 10, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();

      if (hasFill) {
        ctx.fillStyle = innerCol;
        ctx.beginPath();
        ctx.ellipse(bx, by - 5.6, 8.2, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Interactive Toy Renderers ---

    drawFish(ctx, f) {
      ctx.save();
      ctx.fillStyle = "rgba(50, 45, 55, 0.15)";
      ctx.beginPath();
      ctx.ellipse(f.x, f.groundY + 3, 12, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);

      ctx.fillStyle = "#DF924E";
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(-17, -6);
      ctx.lineTo(-15, 0);
      ctx.lineTo(-17, 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#EFA860";
      ctx.beginPath();
      ctx.ellipse(1, 0, 11, 6.8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#4A3628";
      ctx.beginPath();
      ctx.arc(6.5, -1.5, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawBall(ctx, b) {
      ctx.save();
      const sScale = Math.max(0.55, 1 - b.z * 0.006);
      ctx.fillStyle = "rgba(50, 45, 55, 0.16)";
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 3, b.r * sScale, b.r * 0.38 * sScale, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.translate(b.x, b.y - b.z);
      ctx.rotate(b.rot);

      const grad = ctx.createRadialGradient(-4, -5, 2, 0, 0, b.r);
      grad.addColorStop(0, "#F7B5C4");
      grad.addColorStop(0.7, "#E38197");
      grad.addColorStop(1, "#C46379");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 245, 247, 0.52)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(-3, 0, b.r * 0.72, -0.8, 1.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(4, -2, b.r * 0.68, 1.8, 3.7);
      ctx.stroke();
      ctx.restore();
    }

    drawWand(ctx) {
      const n0 = this.wandNodes[0];
      const tip = this.wandNodes[this.wandNodes.length - 1];
      const prev = this.wandNodes[this.wandNodes.length - 2];

      ctx.save();
      ctx.strokeStyle = this.theme === "night" ? "#D6CFC7" : "#8E7F74";
      ctx.lineWidth = 3.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(n0.x + 28, n0.y + 22);
      ctx.lineTo(n0.x, n0.y);
      ctx.stroke();

      ctx.strokeStyle = this.theme === "night" ? "rgba(235, 238, 248, 0.45)" : "rgba(90, 84, 96, 0.42)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(n0.x, n0.y);
      for (let i = 1; i < this.wandNodes.length; i++) {
        ctx.lineTo(this.wandNodes[i].x, this.wandNodes[i].y);
      }
      ctx.stroke();

      const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
      ctx.translate(tip.x, tip.y);
      ctx.rotate(angle - Math.PI * 0.5);

      ctx.fillStyle = "#B6DDF2";
      ctx.beginPath();
      ctx.ellipse(-5, 13, 5.5, 14, -0.28, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#F4AABB";
      ctx.beginPath();
      ctx.ellipse(4, 14, 6, 15, 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#E8C170";
      ctx.beginPath();
      ctx.arc(0, 1.5, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawLaser(ctx) {
      const { x, y, trail } = this.laser;
      ctx.save();

      // Soft fading crimson laser beam trail
      for (let i = 0; i < trail.length; i++) {
        const t = trail[i];
        ctx.fillStyle = `rgba(255, 62, 92, ${(t.life * 0.32).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 2.2 + t.life * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pulsing glowing ruby halo
      const pulse = 1 + Math.sin(this.time * 16) * 0.14;
      const halo = ctx.createRadialGradient(x, y, 1, x, y, 22 * pulse);
      halo.addColorStop(0, "rgba(255, 68, 98, 0.72)");
      halo.addColorStop(0.45, "rgba(255, 48, 84, 0.24)");
      halo.addColorStop(1, "rgba(255, 48, 84, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, 22 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Crisp bright laser core
      ctx.fillStyle = "#FF2D55";
      ctx.beginPath();
      ctx.arc(x, y, 4.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#FFF5F7";
      ctx.beginPath();
      ctx.arc(x, y, 2.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawBubbles(ctx) {
      for (const b of this.bubbles) {
        ctx.save();
        ctx.translate(b.x, b.y);
        const alpha = Math.min(1, b.life * 0.8);

        // Translucent iridescent bubble sphere
        const grad = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.35, b.r * 0.1, 0, 0, b.r);
        grad.addColorStop(0, `rgba(255, 255, 255, ${(0.42 * alpha).toFixed(2)})`);
        grad.addColorStop(0.55, `hsla(${b.hue}, 82%, 86%, ${(0.18 * alpha).toFixed(2)})`);
        grad.addColorStop(0.85, `hsla(${(b.hue + 80) % 360}, 88%, 80%, ${(0.34 * alpha).toFixed(2)})`);
        grad.addColorStop(1, `hsla(${(b.hue + 160) % 360}, 90%, 78%, ${(0.56 * alpha).toFixed(2)})`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, Math.PI * 2);
        ctx.fill();

        // Delicate rainbow rim
        ctx.strokeStyle = `hsla(${(b.hue + 40) % 360}, 85%, 84%, ${(0.62 * alpha).toFixed(2)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Crisp glossy crescent highlight
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.78 * alpha).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(-b.r * 0.36, -b.r * 0.36, b.r * 0.24, b.r * 0.13, -0.75, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(b.r * 0.34, b.r * 0.32, b.r * 0.08, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    drawCatnip(ctx, cn, night) {
      ctx.save();
      ctx.translate(cn.x, cn.y);

      // Soft fragrant green aura underneath leaves
      const aura = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
      aura.addColorStop(0, night > 0.5 ? "rgba(120, 220, 145, 0.20)" : "rgba(116, 206, 134, 0.22)");
      aura.addColorStop(1, "rgba(116, 206, 134, 0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Scattered fresh mint-green catnip leaves
      for (const lf of cn.leaves) {
        ctx.save();
        ctx.translate(lf.ox, lf.oy);
        ctx.rotate(lf.rot);
        ctx.scale(lf.s, lf.s);

        ctx.fillStyle = night > 0.5 ? "#5FB075" : "#6DC27D";
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.quadraticCurveTo(0, -4.8, 6, 0);
        ctx.quadraticCurveTo(0, 4.8, -6, 0);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = night > 0.5 ? "#8AE09E" : "#A2E5AE";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(4, 0);
        ctx.stroke();
        ctx.restore();
      }

      // Gently rising aromatic scent wisps
      const shift = (cn.phase * 7) % 18;
      const wAlpha = (1 - shift / 18) * 0.55;
      ctx.strokeStyle = `rgba(126, 212, 142, ${wAlpha.toFixed(2)})`;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-5, -6 - shift * 0.7);
      ctx.quadraticCurveTo(-9, -12 - shift * 0.8, -4, -18 - shift * 0.9);
      ctx.moveTo(6, -4 - ((shift + 9) % 18) * 0.7);
      ctx.quadraticCurveTo(10, -10 - ((shift + 9) % 18) * 0.8, 5, -16 - ((shift + 9) % 18) * 0.9);
      ctx.stroke();

      ctx.restore();
    }
  }

  window.WidescreenWorld = WidescreenWorld;
})();

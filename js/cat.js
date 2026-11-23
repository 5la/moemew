/**
 * MoeMew Expressive 360° Free-Roaming Cat Engine (js/cat.js)
 * Features:
 * - Hand-crafted photo-accurate Sculpted Sitting Pose (broad white chest ruff, plump 3/4 blue-grey
 *   haunch, organic front paws with left-leg grey cuff & right-leg ankle spot, tucked white hind paw)
 * - True 360° Locomotion (Front Straight Walk, Back Straight Walk with cute rear view, & Seamless Side Walk)
 *   -> Zero crab-walking! Cat naturally walks straight toward/away/diagonally anywhere across the room!
 * - Playful Feline Behaviors:
 *   1) Jump / Pounce (parabolic air arc + crouch anticipation + mid-air stretch + shadow scaling)
 *   2) Belly-Up Roll (fluffy white belly + 4 curled paws with pink toe-beans rocking side-to-side!)
 *   3) Tail-Chase Spin (playful 360° spinning chasing its own tail!)
 *   4) Cozy Side-Lying Lounge (stretched comfortably on the rug/floor with slow breathing & lazy tail!)
 */
(function () {
  "use strict";

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function damp(current, target, lambda, dt) {
    return lerp(current, target, 1 - Math.exp(-lambda * dt));
  }

  function angleDiff(target, current) {
    let d = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  class Spring {
    constructor(val = 0, stiffness = 140, damping = 16) {
      this.value = val;
      this.target = val;
      this.vel = 0;
      this.stiffness = stiffness;
      this.damping = damping;
    }

    update(dt) {
      const f = (this.target - this.value) * this.stiffness;
      this.vel = (this.vel + f * dt) * Math.exp(-this.damping * dt);
      this.value += this.vel * dt;
      return this.value;
    }

    impulse(v) {
      this.vel += v;
    }
  }

  function solve2BoneIK(sx, sy, tx, ty, L1, L2, bendDir) {
    let dx = tx - sx;
    let dy = ty - sy;
    let dist = Math.hypot(dx, dy);
    const minReach = Math.abs(L1 - L2) + 4;
    const maxReach = L1 + L2 - 0.5;

    if (dist < 0.001) {
      dx = 0;
      dy = minReach;
      dist = minReach;
    } else if (dist > maxReach) {
      const s = maxReach / dist;
      dx *= s;
      dy *= s;
      dist = maxReach;
    } else if (dist < minReach) {
      const s = minReach / dist;
      dx *= s;
      dy *= s;
      dist = minReach;
    }

    const endX = sx + dx;
    const endY = sy + dy;
    const cosAngle = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const baseAngle = Math.atan2(dy, dx);
    const jointAngle = baseAngle + Math.acos(cosAngle) * bendDir;

    return {
      sx,
      sy,
      jx: sx + Math.cos(jointAngle) * L1,
      jy: sy + Math.sin(jointAngle) * L1,
      px: endX,
      py: endY
    };
  }

  class FreeRoamingCat {
    constructor(width, height) {
      this.vpW = width;
      this.vpH = height;

      this.x = width * 0.5;
      this.y = height * 0.62;
      this.vx = 0;
      this.vy = 0;

      // Vertical Jump Physics (z = height above floor)
      this.z = 0;
      this.vz = 0;
      this.jumpPrepTimer = 0;
      this.pendingJump = null;

      // True 360° Heading (0 = right, +PI/2 = straight toward viewer, PI = left, -PI/2 = straight away)
      this.moveHeading = Math.PI * 0.5;
      this.bodyDir = 1; // +1 right / -1 left for side-view mirror when lying/rolling/side-walking

      // Smooth Posture States
      // States: "sit" | "wander" | "trot" | "lie" | "roll" | "spin" | "jump" | "call" | "chase_fish" | "chase_ball" | "chase_wand" | "chase_laser" | "catnip"
      this.state = "sit";
      this.stateTimer = 2.4;
      this.goal = { x: this.x, y: this.y };
      this.wanderNoisePhase = Math.random() * 100;
      this.theme = "day";
      this.idleSleepTimer = 0;

      // Animation clocks
      this.time = 0;
      this.walkCycle = 0;
      this.strideAmp = 0;
      this.tailPhase = 0;
      this.rollPhase = 0;
      this.spinDir = 1;
      this.spinCenterX = this.x;
      this.spinCenterY = this.y;
      this.spinRx = 135;
      this.spinRy = 68;
      this.spinAngle = 0;
      this.spinOmega = 1.65;
      this.trickCycleIdx = 0;
      this.bowlBiteTimer = 0;
      this.bowlTarget = null;
      this.drinkDuration = 3.4;
      this.drinkSideDir = -1;

      // Paw lift (when batting ball/wand/bubble)
      this.batTimer = 0;
      this.batBlend = 0;
      this.batSide = "FL";
      this.batTargetLocal = { x: 20, y: -14 };

      // Expressive Head Springs
      this.headYaw = new Spring(0, 95, 14);
      this.headPitch = new Spring(0, 95, 14);
      this.headTilt = new Spring(0, 85, 11);
      this.earLeft = new Spring(0, 160, 12);
      this.earRight = new Spring(0, 160, 12);
      this.squish = new Spring(0, 180, 12);
      this.pupilSize = new Spring(1.0, 120, 14);
      this.blush = new Spring(0.38, 70, 12);

      // Blink & Expression Timers
      this.blinkTimer = 2.4;
      this.blinkProg = 0;
      this.isBlinking = false;
      this.happyTimer = 0;
      this.munchTimer = 0;
      this.mewMouthTimer = 0;
      this.earTwitchTimer = 3.0;
      this.curiousTiltTimer = 4.0;
      this.curiousTiltVal = 0;

      this.pointer = { x: this.x, y: this.y - 60, active: false };
      this.onPawStep = null;
      this.onCatEvent = null;
      this.lastPawPrintCycle = 0;
    }

    resize(w, h) {
      this.vpW = w;
      this.vpH = h;
      const b = this.getFloorBounds();
      this.x = clamp(this.x, b.minX, b.maxX);
      this.y = clamp(this.y, b.minY, b.maxY);
    }

    getFloorBounds() {
      const marginX = Math.min(110, Math.max(58, this.vpW * 0.07));
      const horizonY = Math.round(Math.max(155, Math.min(this.vpH * 0.36, 360)));
      return {
        minX: marginX,
        maxX: Math.max(marginX + 40, this.vpW - marginX),
        minY: horizonY + 24,
        maxY: Math.min(this.vpH - 96, this.vpH * 0.86)
      };
    }

    getScale() {
      const b = this.getFloorBounds();
      const depthSpan = Math.max(1, b.maxY - b.minY);
      const depthT = clamp((this.y - b.minY) / depthSpan, 0, 1);
      const shortSide = Math.min(this.vpW, this.vpH);
      const base = clamp(shortSide / 740, 0.72, 1.15);
      return base * lerp(0.80, 1.08, depthT);
    }

    // --- Autonomous Spontaneous Behavior AI ---

    pickRandomFloorPoint(preferFar = false) {
      const b = this.getFloorBounds();

      // Cozy living-room habits: stroll into sunlight patch, cat bed, or straight forward/back!
      if (!preferFar && Math.random() < 0.25) {
        if (this.theme !== "night" && Math.random() < 0.6) {
          return {
            x: clamp(this.vpW * 0.40 + (Math.random() - 0.5) * 90, b.minX + 16, b.maxX - 16),
            y: clamp(b.minY + (b.maxY - b.minY) * 0.36, b.minY + 12, b.maxY - 12)
          };
        }
        return {
          x: clamp(this.vpW * 0.24, b.minX + 16, b.maxX - 16),
          y: clamp(b.minY + 34, b.minY + 12, b.maxY - 12)
        };
      }

      // Occasionally pick a vertical straight-line stroll (straight toward viewer or straight toward window!)
      if (Math.random() < 0.30) {
        const goDown = this.y < (b.minY + b.maxY) * 0.5;
        return {
          x: clamp(this.x + (Math.random() - 0.5) * 70, b.minX + 16, b.maxX - 16),
          y: goDown ? lerp(b.minY, b.maxY, 0.78 + Math.random() * 0.16) : lerp(b.minY, b.maxY, 0.08 + Math.random() * 0.18)
        };
      }

      let best = { x: this.vpW * 0.5, y: this.vpH * 0.62 };
      let bestDist = -1;
      const tries = preferFar ? 5 : 2;
      for (let i = 0; i < tries; i++) {
        const px = lerp(b.minX, b.maxX, 0.06 + Math.random() * 0.88);
        const py = lerp(b.minY, b.maxY, Math.random());
        const d = Math.hypot(px - this.x, py - this.y);
        if (d > bestDist) {
          bestDist = d;
          best = { x: px, y: py };
        }
      }
      return best;
    }

    chooseNextWhim() {
      const r = Math.random();
      if (this.theme === "night" && r < 0.28) {
        this.enterState("lie", 5.5 + Math.random() * 5.0);
      } else if (r < 0.38) {
        this.goal = this.pickRandomFloorPoint(true);
        this.enterState("wander", 4.0 + Math.random() * 4.5);
      } else if (r < 0.54) {
        this.goal = this.pickRandomFloorPoint(true);
        this.enterState("trot", 2.4 + Math.random() * 2.5);
      } else if (r < 0.68) {
        this.enterState("sit", 3.2 + Math.random() * 3.8);
      } else if (r < 0.80) {
        this.enterState("lie", 4.2 + Math.random() * 4.0);
      } else if (r < 0.88) {
        this.startRoll(3.0 + Math.random() * 1.4);
      } else if (r < 0.94) {
        this.startSpin(4.0 + Math.random() * 1.4);
      } else {
        // Spontaneous playful hop!
        const target = this.pickRandomFloorPoint(false);
        this.startJumpToward(target.x, target.y, 68);
      }
    }

    enterState(newState, duration = 3.5) {
      this.state = newState;
      this.stateTimer = duration;
      if (newState === "lie") {
        this.bodyDir = Math.cos(this.moveHeading) >= 0 ? 1 : -1;
      }
    }

    // --- Playful Action Triggers (Autonomous + Interactive!) ---

    startJumpToward(tx, ty, height = 74) {
      if (this.z > 2 || this.jumpPrepTimer > 0) return;
      const b = this.getFloorBounds();
      const clampedX = clamp(tx, b.minX + 12, b.maxX - 12);
      const clampedY = clamp(ty, b.minY + 8, b.maxY - 8);
      const dx = clampedX - this.x;
      const dy = clampedY - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 6) {
        this.moveHeading = Math.atan2(dy, dx);
        if (Math.abs(dx) > 8) this.bodyDir = dx >= 0 ? 1 : -1;
      }

      const jumpStep = Math.min(dist, 145 * this.getScale());
      const flightDur = 0.52;
      this.pendingJump = {
        vx: dist > 6 ? (dx / dist) * (jumpStep / flightDur) : 0,
        vy: dist > 6 ? (dy / dist) * (jumpStep / flightDur) : 0,
        vz: Math.sqrt(2 * 980 * height)
      };
      this.jumpPrepTimer = 0.12;
      this.state = "jump";
      this.stateTimer = 0.9;
      this.earLeft.impulse(-80);
      this.earRight.impulse(80);
    }

    startRoll(duration = 3.4) {
      this.state = "roll";
      this.stateTimer = duration;
      this.rollPhase = 0;
      this.vx *= 0.2;
      this.vy *= 0.2;
      this.happyTimer = duration;
      this.blush.target = 0.85;
      this.mewMouthTimer = 0.45;
      if (window.MoeAudio) window.MoeAudio.playMew("happy");
    }

    startSpin(duration = 4.2) {
      const b = this.getFloorBounds();
      const availW = Math.max(120, b.maxX - b.minX);
      const availH = Math.max(90, b.maxY - b.minY);

      // Wide, natural elliptical circle across the living room floor!
      this.spinRx = Math.min(availW * 0.42, clamp(availW * 0.17, 105, 175));
      this.spinRy = Math.min(availH * 0.42, clamp(availH * 0.28, 52, 92));
      this.spinDir = Math.random() < 0.5 ? 1 : -1;
      this.spinOmega = 1.65;

      // Place circle center toward the open center of the floor, tangent to cat's current spot
      const roomCx = (b.minX + b.maxX) * 0.5;
      const roomCy = (b.minY + b.maxY) * 0.52;
      const dxC = roomCx - this.x;
      const dyC = roomCy - this.y;
      const toCenter = Math.hypot(dxC, dyC) > 18 ? Math.atan2(dyC, dxC) : Math.random() * Math.PI * 2;

      const rawCx = this.x + Math.cos(toCenter) * this.spinRx;
      const rawCy = this.y + Math.sin(toCenter) * this.spinRy;
      this.spinCenterX = clamp(rawCx, b.minX + this.spinRx + 8, b.maxX - this.spinRx - 8);
      this.spinCenterY = clamp(rawCy, b.minY + this.spinRy + 6, b.maxY - this.spinRy - 6);
      this.spinAngle = Math.atan2(
        (this.y - this.spinCenterY) / Math.max(1, this.spinRy),
        (this.x - this.spinCenterX) / Math.max(1, this.spinRx)
      );

      this.state = "spin";
      this.stateTimer = duration;
      this.pupilSize.target = 1.2;
      this.earLeft.impulse(-75);
      this.earRight.impulse(75);
      if (window.MoeAudio) window.MoeAudio.playMew("curious");
    }

    startLie(duration = 5.5) {
      this.enterState("lie", duration);
      this.vx *= 0.2;
      this.vy *= 0.2;
      this.blush.target = 0.55;
      if (window.MoeAudio) window.MoeAudio.pokePurr();
    }

    performNextTrick() {
      const tricks = ["jump", "roll", "spin", "lie", "sit"];
      const t = tricks[this.trickCycleIdx % tricks.length];
      this.trickCycleIdx++;

      if (t === "jump") {
        const b = this.getFloorBounds();
        const tx = clamp(this.x + (Math.random() - 0.5) * 200, b.minX + 20, b.maxX - 20);
        const ty = clamp(this.y + (Math.random() - 0.5) * 120, b.minY + 20, b.maxY - 20);
        this.startJumpToward(tx, ty, 82);
        return { action: "jump", msg: "轻盈起跳！展示敏捷小猫腾空跃 ✨" };
      }
      if (t === "roll") {
        this.startRoll(3.6);
        return { action: "roll", msg: "翻肚皮打滚撒娇啦，露出软软白肚皮与粉肉垫 🐾" };
      }
      if (t === "spin") {
        this.startSpin(4.2);
        return { action: "spin", msg: "迈着轻快猫步在客厅绕一个大大的圆圈~" };
      }
      if (t === "lie") {
        this.startLie(6.0);
        return { action: "lie", msg: "舒舒服服侧躺伸个懒腰，享受阳光小憩 ☀️" };
      }
      this.enterState("sit", 4.5);
      this.happyTimer = 1.2;
      this.mewMouthTimer = 0.5;
      if (window.MoeAudio) window.MoeAudio.playMew("sweet");
      return { action: "sit", msg: "乖巧端坐！露出招牌小胡子与半截蓝灰袖套 💗" };
    }

    // --- Interactive Goal Triggers ---

    callTo(x, y) {
      const b = this.getFloorBounds();
      this.goal = {
        x: clamp(x, b.minX + 14, b.maxX - 14),
        y: clamp(y, b.minY + 10, b.maxY - 10)
      };
      this.idleSleepTimer = 0;
      this.state = "call";
      this.stateTimer = 8.0;
      this.earLeft.impulse(-95);
      this.earRight.impulse(95);
      this.mewMouthTimer = 0.42;
    }

    chaseFish(fishX, fishY) {
      const b = this.getFloorBounds();
      this.goal = {
        x: clamp(fishX, b.minX + 10, b.maxX - 10),
        y: clamp(fishY, b.minY + 6, b.maxY - 6)
      };
      this.idleSleepTimer = 0;
      this.state = "chase_fish";
      this.stateTimer = 10.0;
      this.pupilSize.target = 1.22;
    }

    chaseBall(ballX, ballY) {
      const b = this.getFloorBounds();
      this.goal = {
        x: clamp(ballX, b.minX + 10, b.maxX - 10),
        y: clamp(ballY, b.minY + 6, b.maxY - 6)
      };
      this.idleSleepTimer = 0;
      this.state = "chase_ball";
      this.stateTimer = 2.4;
      this.pupilSize.target = 1.18;
    }

    chaseLaser(lx, ly) {
      const b = this.getFloorBounds();
      this.goal = {
        x: clamp(lx, b.minX + 10, b.maxX - 10),
        y: clamp(ly, b.minY + 6, b.maxY - 6)
      };
      this.idleSleepTimer = 0;
      this.pupilSize.target = 1.24;

      const dist = Math.hypot(this.goal.x - this.x, this.goal.y - this.y);
      if (this.z <= 1 && this.jumpPrepTimer <= 0 && dist > 65 && dist < 165 && Math.random() < 0.045) {
        // Exciting pounce jump right onto the laser dot!
        this.startJumpToward(this.goal.x, this.goal.y, 64);
      } else if (this.state !== "jump") {
        this.state = "chase_laser";
        this.stateTimer = 1.6;
      }
    }

    chaseCatnip(cx, cy) {
      const b = this.getFloorBounds();
      this.goal = {
        x: clamp(cx, b.minX + 14, b.maxX - 14),
        y: clamp(cy, b.minY + 10, b.maxY - 10)
      };
      this.idleSleepTimer = 0;
      this.state = "catnip";
      this.stateTimer = 8.0;
      this.pupilSize.target = 1.24;
    }

    chaseBubble(bx, by) {
      const b = this.getFloorBounds();
      this.goal = {
        x: clamp(bx, b.minX + 12, b.maxX - 12),
        y: clamp(by, b.minY + 8, b.maxY - 8)
      };
      this.idleSleepTimer = 0;
      if (this.state !== "jump") {
        this.state = "chase_bubble";
        this.stateTimer = 1.5;
      }
      this.pupilSize.target = 1.22;
    }

    eatFishNow() {
      this.vx *= 0.15;
      this.vy *= 0.15;
      this.munchTimer = 1.35;
      this.happyTimer = 1.6;
      this.blush.target = 0.88;
      this.squish.impulse(0.85);
      this.enterState("sit", 2.4);
    }

    goToBowl(foodBowlX, foodBowlY) {
      const b = this.getFloorBounds();
      const s = this.getScale();
      this.bowlTarget = { x: foodBowlX, y: foodBowlY };
      // Position kitty neatly to the left of the ceramic food bowl so its lowered mouth kisses the kibble mound!
      const feedX = clamp(foodBowlX - 58 * s, b.minX + 12, b.maxX - 12);
      const feedY = clamp(foodBowlY + 3, b.minY + 4, b.maxY - 12);
      this.goal = { x: feedX, y: feedY };
      this.idleSleepTimer = 0;
      if (this.state === "eat_bowl") {
        // Already eating at bowl -> extend happy meal!
        this.stateTimer = Math.max(this.stateTimer, 3.6);
        this.munchTimer = Math.max(this.munchTimer, 3.6);
        this.happyTimer = Math.max(this.happyTimer, 3.6);
        return;
      }
      this.state = "go_bowl";
      this.stateTimer = 10.0;
      this.pupilSize.target = 1.22;
      this.earLeft.impulse(-80);
      this.earRight.impulse(80);
    }

    goToWaterBowl(waterBowlX, waterBowlY, duration = 3.4) {
      const b = this.getFloorBounds();
      const s = this.getScale();
      this.bowlTarget = { x: waterBowlX, y: waterBowlY };
      this.drinkDuration = duration;

      // Prefer crouching on the RIGHT side of the right water bowl facing LEFT (-1) so neither bowl is blocked;
      // fall back cleanly to the left side facing right (+1) on very narrow mobile screens!
      const rightSideX = waterBowlX + 56 * s;
      if (rightSideX <= b.maxX - 8) {
        this.drinkSideDir = -1;
        this.goal = {
          x: rightSideX,
          y: clamp(waterBowlY + 3, b.minY + 4, b.maxY - 12)
        };
      } else {
        this.drinkSideDir = 1;
        this.goal = {
          x: clamp(waterBowlX - 58 * s, b.minX + 12, b.maxX - 12),
          y: clamp(waterBowlY + 3, b.minY + 4, b.maxY - 12)
        };
      }

      this.idleSleepTimer = 0;
      if (this.state === "drink_bowl") {
        this.stateTimer = Math.max(this.stateTimer, duration);
        this.happyTimer = Math.max(this.happyTimer, duration);
        return;
      }
      this.state = "go_water";
      this.stateTimer = 10.0;
      this.pupilSize.target = 1.18;
      this.earLeft.impulse(-70);
      this.earRight.impulse(70);
    }

    goToFishPlate(plateX, plateY) {
      const b = this.getFloorBounds();
      const s = this.getScale();
      this.bowlTarget = { x: plateX, y: plateY };
      // Position kitty cleanly on the RIGHT side of the left fish-meat plate facing LEFT (-1)
      // so the steaming salmon slices on the ceramic plate remain 100% visible!
      const feedX = clamp(plateX + 64 * s, b.minX + 12, b.maxX - 12);
      const feedY = clamp(plateY + 4, b.minY + 4, b.maxY - 12);
      this.goal = { x: feedX, y: feedY };
      this.idleSleepTimer = 0;

      if (this.state === "eat_fish_plate") {
        this.stateTimer = Math.max(this.stateTimer, 4.0);
        this.munchTimer = Math.max(this.munchTimer, 4.0);
        this.happyTimer = Math.max(this.happyTimer, 4.0);
        return;
      }
      this.state = "go_fish_plate";
      this.stateTimer = 10.0;
      this.pupilSize.target = 1.26;
      this.earLeft.impulse(-90);
      this.earRight.impulse(90);
    }

    followWand(wx, wy) {
      const b = this.getFloorBounds();
      const tx = clamp(wx, b.minX + 12, b.maxX - 12);
      const ty = clamp(wy + 52, b.minY + 10, b.maxY - 10);
      this.goal = { x: tx, y: ty };
      this.idleSleepTimer = 0;

      const dist = Math.hypot(tx - this.x, ty - this.y);
      const wandHeight = this.y - wy;
      if (dist < 110 * this.getScale() && wandHeight > 88 * this.getScale() && this.z <= 1 && this.jumpPrepTimer <= 0 && Math.random() < 0.05) {
        // Jump up to catch high feather wand!
        this.startJumpToward(tx, ty, 78);
        return;
      }

      if (dist > 62 * this.getScale() && this.state !== "jump") {
        this.state = "chase_wand";
        this.stateTimer = 1.2;
      } else if (this.batTimer <= 0) {
        this.triggerPawBat(wx, wy);
      }
    }

    triggerPawBat(worldX, worldY) {
      const s = this.getScale();
      const relX = clamp((worldX - this.x) / s, -24, 24);
      const relY = clamp((worldY - this.y) / s, -24, -8);
      this.batSide = relX >= 0 ? "FL" : "FR";
      this.batTargetLocal = { x: relX, y: relY };
      this.batTimer = 0.34;
      this.earLeft.impulse(-70);
      this.earRight.impulse(70);
    }

    pet() {
      this.idleSleepTimer = 0;
      this.happyTimer = 0.72;
      this.blush.target = 0.88;
      this.earLeft.target = -10;
      this.earRight.target = 10;
      this.squish.impulse(0.24);

      if (this.state === "wander" || this.state === "trot") {
        // Sometimes flops over to roll when petted!
        if (Math.random() < 0.25) {
          this.startRoll(3.2);
        } else {
          this.enterState("sit", 4.5);
        }
      } else {
        this.stateTimer = Math.max(this.stateTimer, 3.0);
      }
    }

    hitTest(clientX, clientY) {
      const s = this.getScale();
      const dx = (clientX - this.x) / s;
      const dy = (clientY - (this.y - this.z)) / s;
      if (dx > -55 && dx < 55 && dy > -108 && dy < 14) {
        if (dy < -42 && Math.abs(dx) < 42) {
          if (Math.hypot(dx, dy + 72) < 16 && (this.state === "sit" || Math.sin(this.moveHeading) > 0)) return "nose";
          return "head";
        }
        return "body";
      }
      return null;
    }

    // --- Core 60fps Update ---

    update(dt) {
      this.time += dt;
      this.wanderNoisePhase += dt * 0.85;

      if (this.happyTimer > 0) this.happyTimer = Math.max(0, this.happyTimer - dt);
      if (this.munchTimer > 0) this.munchTimer = Math.max(0, this.munchTimer - dt);
      if (this.mewMouthTimer > 0) this.mewMouthTimer = Math.max(0, this.mewMouthTimer - dt);
      if (this.batTimer > 0) this.batTimer = Math.max(0, this.batTimer - dt);

      this.stateTimer -= dt;
      const scale = this.getScale();
      const b = this.getFloorBounds();

      // 1. Handle Jump Crouch Anticipation & Air Flight Physics
      if (this.jumpPrepTimer > 0) {
        this.jumpPrepTimer -= dt;
        this.vx *= 0.82;
        this.vy *= 0.82;
        if (this.jumpPrepTimer <= 0 && this.pendingJump) {
          this.vx = this.pendingJump.vx;
          this.vy = this.pendingJump.vy;
          this.vz = this.pendingJump.vz;
          this.z = 2.5;
          this.pendingJump = null;
          this.squish.impulse(-0.35);
          if (window.MoeAudio) window.MoeAudio.playBoing(1.18);
        }
      } else if (this.z > 0 || this.vz > 0) {
        this.vz -= 980 * dt;
        this.z += this.vz * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Soft floor bounds during jump
        this.x = clamp(this.x, b.minX, b.maxX);
        this.y = clamp(this.y, b.minY, b.maxY);

        if (this.z <= 0) {
          this.z = 0;
          this.vz = 0;
          this.vx *= 0.35;
          this.vy *= 0.35;
          this.squish.impulse(0.45);
          this.state = "sit";
          this.stateTimer = 1.4;
          if (this.onPawStep) this.onPawStep(this.x, this.y, this.moveHeading, scale);
        }
      } else {
        // 2. Ground States: Wide Natural Circle, Roll, Lie, Sit, or 360° Free Locomotion
        if (this.state === "spin") {
          // Run smoothly along a wide, natural circular orbit across the room!
          this.spinAngle += this.spinDir * this.spinOmega * dt;
          const targetX = this.spinCenterX + Math.cos(this.spinAngle) * this.spinRx;
          const targetY = this.spinCenterY + Math.sin(this.spinAngle) * this.spinRy;

          const prevX = this.x;
          const prevY = this.y;
          this.x = clamp(damp(this.x, targetX, 11.5, dt), b.minX, b.maxX);
          this.y = clamp(damp(this.y, targetY, 11.5, dt), b.minY, b.maxY);

          const tanVx = -Math.sin(this.spinAngle) * this.spinRx * this.spinDir * this.spinOmega;
          const tanVy = Math.cos(this.spinAngle) * this.spinRy * this.spinDir * this.spinOmega;
          this.vx = damp(this.vx, tanVx, 10, dt);
          this.vy = damp(this.vy, tanVy, 10, dt);

          const actualSpeed = Math.hypot((this.x - prevX) / Math.max(0.001, dt), (this.y - prevY) / Math.max(0.001, dt));
          const targetH = Math.atan2(tanVy, tanVx);
          this.moveHeading += angleDiff(targetH, this.moveHeading) * (1 - Math.exp(-12 * dt));
          if (Math.abs(Math.cos(this.moveHeading)) > 0.2) {
            this.bodyDir = Math.cos(this.moveHeading) >= 0 ? 1 : -1;
          }

          this.strideAmp = damp(this.strideAmp, clamp(actualSpeed / (130 * scale), 0.55, 1.05), 12, dt);
          this.walkCycle += ((Math.max(110, actualSpeed) / scale) * dt) * 0.088;

          if (this.walkCycle - this.lastPawPrintCycle > Math.PI * 0.85) {
            this.lastPawPrintCycle = this.walkCycle;
            if (this.onPawStep) this.onPawStep(this.x, this.y, this.moveHeading, scale);
          }

          if (this.stateTimer <= 0) {
            this.enterState("sit", 2.6);
            this.happyTimer = 1.2;
          }
        } else if (this.state === "roll") {
          this.rollPhase += dt * 4.4;
          this.vx = damp(this.vx, 0, 10, dt);
          this.vy = damp(this.vy, 0, 10, dt);
          this.strideAmp = damp(this.strideAmp, 0, 12, dt);
          if (this.stateTimer <= 0) {
            this.enterState("sit", 2.5);
          }
        } else if (this.state === "eat_bowl") {
          // Crouched right beside the food bowl crunching kibble happily!
          this.x = damp(this.x, this.goal.x, 8, dt);
          this.y = damp(this.y, this.goal.y, 8, dt);
          this.vx = damp(this.vx, 0, 12, dt);
          this.vy = damp(this.vy, 0, 12, dt);
          this.strideAmp = damp(this.strideAmp, 0, 12, dt);
          this.bodyDir = 1;
          this.munchTimer = Math.max(this.munchTimer, 0.25);
          this.happyTimer = Math.max(this.happyTimer, 0.35);
          this.blush.target = 0.86;

          this.bowlBiteTimer -= dt;
          if (this.bowlBiteTimer <= 0) {
            this.bowlBiteTimer = 0.58;
            this.earLeft.impulse(-42);
            this.earRight.impulse(42);
            if (this.onCatEvent) this.onCatEvent("bowl_bite");
          }

          if (this.stateTimer <= 0) {
            this.mewMouthTimer = 0.55;
            this.happyTimer = 1.4;
            this.enterState("sit", 3.2);
            if (this.onCatEvent) this.onCatEvent("bowl_done");
          }
        } else if (this.state === "drink_bowl") {
          // Crouched right beside the blue water bowl lapping refreshing clear water!
          this.x = damp(this.x, this.goal.x, 8, dt);
          this.y = damp(this.y, this.goal.y, 8, dt);
          this.vx = damp(this.vx, 0, 12, dt);
          this.vy = damp(this.vy, 0, 12, dt);
          this.strideAmp = damp(this.strideAmp, 0, 12, dt);
          this.bodyDir = this.drinkSideDir;
          this.happyTimer = Math.max(this.happyTimer, 0.35);
          this.blush.target = 0.78;

          this.bowlBiteTimer -= dt;
          if (this.bowlBiteTimer <= 0) {
            this.bowlBiteTimer = 0.50;
            this.earLeft.impulse(-30);
            this.earRight.impulse(30);
            if (this.onCatEvent) this.onCatEvent("water_lap");
          }

          if (this.stateTimer <= 0) {
            this.mewMouthTimer = 0.5;
            this.happyTimer = 1.3;
            this.enterState("sit", 3.0);
            if (this.onCatEvent) this.onCatEvent("water_done");
          }
        } else if (this.state === "eat_fish_plate") {
          // Ecstatically crouched beside the left porcelain fish platter munching fresh salmon slices!
          this.x = damp(this.x, this.goal.x, 8, dt);
          this.y = damp(this.y, this.goal.y, 8, dt);
          this.vx = damp(this.vx, 0, 12, dt);
          this.vy = damp(this.vy, 0, 12, dt);
          this.strideAmp = damp(this.strideAmp, 0, 12, dt);
          this.bodyDir = -1;
          this.munchTimer = Math.max(this.munchTimer, 0.28);
          this.happyTimer = Math.max(this.happyTimer, 0.4);
          this.blush.target = 0.94;

          this.bowlBiteTimer -= dt;
          if (this.bowlBiteTimer <= 0) {
            this.bowlBiteTimer = 0.62;
            this.earLeft.impulse(-46);
            this.earRight.impulse(46);
            if (this.onCatEvent) this.onCatEvent("fish_plate_bite");
          }

          if (this.stateTimer <= 0) {
            this.mewMouthTimer = 0.6;
            this.happyTimer = 1.8;
            this.enterState("sit", 3.4);
            if (this.onCatEvent) this.onCatEvent("fish_plate_done");
          }
        } else if (this.state === "lie") {
          this.vx = damp(this.vx, 0, 10, dt);
          this.vy = damp(this.vy, 0, 10, dt);
          this.strideAmp = damp(this.strideAmp, 0, 12, dt);
          if (this.theme === "night") this.idleSleepTimer += dt;
          if (this.stateTimer <= 0) {
            this.chooseNextWhim();
          }
        } else {
          // Moving or Sitting
          const isMoving =
            this.state === "wander" ||
            this.state === "trot" ||
            this.state === "call" ||
            this.state === "chase_fish" ||
            this.state === "chase_ball" ||
            this.state === "chase_wand" ||
            this.state === "chase_laser" ||
            this.state === "chase_bubble" ||
            this.state === "catnip" ||
            this.state === "go_bowl" ||
            this.state === "go_water" ||
            this.state === "go_fish_plate";

          let desiredVx = 0;
          let desiredVy = 0;

          if (isMoving) {
            const dx = this.goal.x - this.x;
            const dy = this.goal.y - this.y;
            const dist = Math.hypot(dx, dy);
            const stopR =
              this.state === "go_bowl" || this.state === "go_water" || this.state === "go_fish_plate"
                ? 16 * scale
                : (this.state === "chase_fish" || this.state === "chase_ball" || this.state === "catnip" ? 22 * scale : 24 * scale);

            if (dist <= stopR) {
              if (this.state === "call") {
                this.enterState("sit", 4.2);
              } else if (this.state === "go_bowl") {
                this.state = "eat_bowl";
                this.stateTimer = 3.8;
                this.bowlBiteTimer = 0.22;
                this.bodyDir = 1;
                this.munchTimer = 3.8;
                this.happyTimer = 3.8;
                this.blush.target = 0.86;
              } else if (this.state === "go_water") {
                this.state = "drink_bowl";
                this.stateTimer = this.drinkDuration || 3.4;
                this.bowlBiteTimer = 0.22;
                this.bodyDir = this.drinkSideDir;
                this.happyTimer = this.stateTimer;
                this.blush.target = 0.78;
              } else if (this.state === "go_fish_plate") {
                this.state = "eat_fish_plate";
                this.stateTimer = 4.0;
                this.bowlBiteTimer = 0.24;
                this.bodyDir = -1;
                this.munchTimer = 4.0;
                this.happyTimer = 4.0;
                this.blush.target = 0.94;
              } else if (this.state === "catnip") {
                // Reached catnip -> ecstatic roll or wide playful zoomie circle!
                if (Math.random() < 0.65) this.startRoll(3.8);
                else this.startSpin(4.2);
                if (this.onCatEvent) this.onCatEvent("catnip_bliss");
              } else if (
                this.state !== "chase_fish" &&
                this.state !== "chase_ball" &&
                this.state !== "chase_laser" &&
                this.state !== "chase_bubble"
              ) {
                this.chooseNextWhim();
              }
            } else {
              let maxSpeed = 94 * scale;
              if (this.state === "trot" || this.state === "call") maxSpeed = 162 * scale;
              if (
                this.state === "chase_fish" ||
                this.state === "chase_ball" ||
                this.state === "chase_wand" ||
                this.state === "chase_bubble" ||
                this.state === "catnip" ||
                this.state === "go_bowl" ||
                this.state === "go_water" ||
                this.state === "go_fish_plate"
              ) {
                maxSpeed = 200 * scale;
              }
              if (this.state === "chase_laser") maxSpeed = 235 * scale;

              const arrival = clamp(dist / (70 * scale), 0.30, 1.0);
              const speed = maxSpeed * arrival;
              let moveAngle = Math.atan2(dy, dx);

              if (this.state === "wander" || this.state === "trot") {
                const curve = Math.sin(this.wanderNoisePhase * 1.2) * 0.32 + Math.cos(this.wanderNoisePhase * 0.53) * 0.20;
                moveAngle += curve * clamp(dist / 170, 0, 1);
                if (Math.random() < dt * 0.14) {
                  this.goal = this.pickRandomFloorPoint(false);
                }
              }

              desiredVx = Math.cos(moveAngle) * speed;
              desiredVy = Math.sin(moveAngle) * speed * 0.85;
            }
          }

          if (this.stateTimer <= 0 && this.state !== "chase_fish") {
            this.chooseNextWhim();
          }

          this.vx = damp(this.vx, desiredVx, 8.0, dt);
          this.vy = damp(this.vy, desiredVy, 8.0, dt);
          this.x += this.vx * dt;
          this.y += this.vy * dt;

          if (this.x < b.minX) {
            this.x = b.minX;
            this.vx = Math.max(0, this.vx);
            if (this.state === "wander" || this.state === "trot") this.goal = this.pickRandomFloorPoint(true);
          }
          if (this.x > b.maxX) {
            this.x = b.maxX;
            this.vx = Math.min(0, this.vx);
            if (this.state === "wander" || this.state === "trot") this.goal = this.pickRandomFloorPoint(true);
          }
          if (this.y < b.minY) { this.y = b.minY; this.vy = Math.max(0, this.vy); }
          if (this.y > b.maxY) { this.y = b.maxY; this.vy = Math.min(0, this.vy); }

          const groundSpeed = Math.hypot(this.vx, this.vy);

          // Update true 360° movement heading smoothly!
          if (isMoving && groundSpeed > 12) {
            const targetH = Math.atan2(this.vy, this.vx);
            this.moveHeading += angleDiff(targetH, this.moveHeading) * (1 - Math.exp(-10 * dt));
            if (Math.abs(Math.cos(this.moveHeading)) > 0.25) {
              this.bodyDir = Math.cos(this.moveHeading) >= 0 ? 1 : -1;
            }
            this.idleSleepTimer = 0;
          }

          const targetStride = isMoving && groundSpeed > 8 ? clamp(groundSpeed / (115 * scale), 0.2, 1.15) : 0;
          this.strideAmp = damp(this.strideAmp, targetStride, 13, dt);
          this.walkCycle += ((groundSpeed / scale) * dt) * 0.092;

          if (this.strideAmp > 0.25 && this.walkCycle - this.lastPawPrintCycle > Math.PI * 0.85) {
            this.lastPawPrintCycle = this.walkCycle;
            if (this.onPawStep) {
              this.onPawStep(this.x, this.y, this.moveHeading, scale);
            }
          }
        }
      }

      this.batBlend = damp(this.batBlend, this.batTimer > 0 ? 1 : 0, 16.0, dt);

      // Micro-expressions
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0 && !this.isBlinking) {
        this.isBlinking = true;
        this.blinkProg = 0;
        this.blinkTimer = 2.6 + Math.random() * 3.8;
      }
      if (this.isBlinking) {
        this.blinkProg += dt * 9.5;
        if (this.blinkProg >= Math.PI) {
          this.isBlinking = false;
          this.blinkProg = 0;
        }
      }

      this.earTwitchTimer -= dt;
      if (this.earTwitchTimer <= 0) {
        this.earTwitchTimer = 2.5 + Math.random() * 4.5;
        if (Math.random() < 0.5) this.earLeft.impulse(-90);
        else this.earRight.impulse(90);
      }

      this.curiousTiltTimer -= dt;
      if (this.curiousTiltTimer <= 0) {
        this.curiousTiltTimer = 3.4 + Math.random() * 4.2;
        this.curiousTiltVal = this.state === "sit" ? (Math.random() - 0.5) * 7 : 0;
      }

      const groundSpeed = Math.hypot(this.vx, this.vy);
      if (groundSpeed > 24 && this.state !== "sit") {
        this.headYaw.target = clamp(Math.cos(this.moveHeading) * 0.6, -0.6, 0.6);
        this.headPitch.target = clamp(Math.sin(this.moveHeading) * 0.35, -0.3, 0.35);
        this.headTilt.target = 0;
      } else if (this.pointer.active) {
        const lookDx = this.pointer.x - this.x;
        const lookDy = this.pointer.y - (this.y - 68 * scale);
        this.headYaw.target = clamp(lookDx / (280 * scale), -0.55, 0.55);
        this.headPitch.target = clamp(lookDy / (240 * scale), -0.4, 0.45);
        this.headTilt.target = clamp(lookDx * 0.016, -6, 6) + this.curiousTiltVal * 0.5;
      } else {
        this.headYaw.target = Math.sin(this.time * 0.6) * 0.14;
        this.headPitch.target = 0;
        this.headTilt.target = this.curiousTiltVal;
      }

      if (this.munchTimer > 0) this.headPitch.target = 0.5;
      if (this.happyTimer <= 0) {
        this.earLeft.target = 0;
        this.earRight.target = 0;
        this.blush.target = 0.38;
      }

      const excited =
        this.state === "chase_laser" ||
        this.state === "chase_wand" ||
        this.state === "chase_fish" ||
        this.state === "chase_bubble" ||
        this.state === "catnip" ||
        this.state === "spin" ||
        this.state === "jump";
      this.pupilSize.target = excited ? 1.18 : (this.theme === "night" ? 1.12 : 1.0);

      this.headYaw.update(dt);
      this.headPitch.update(dt);
      this.headTilt.update(dt);
      this.earLeft.update(dt);
      this.earRight.update(dt);
      this.squish.update(dt);
      this.pupilSize.update(dt);
      this.blush.update(dt);

      const tailRate = excited ? 6.5 : (groundSpeed > 15 ? 4.4 : (this.happyTimer > 0 ? 4.8 : 2.1));
      this.tailPhase += dt * tailRate;
    }

    // =========================================================================
    // High-DPI Multi-Pose Vector Renderer
    // =========================================================================

    render(ctx) {
      const scale = this.getScale();
      const isNight = this.theme === "night";

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(scale, scale);

      // 1. Ground Shadow (always stays on floor z=0 and shrinks softly during jump!)
      const airScale = clamp(1 - this.z * 0.006, 0.45, 1.0);
      const isHorizontalPose = this.state === "lie" || this.state === "roll";
      const shadowRx = (isHorizontalPose ? 54 : this.state === "sit" ? 39 : 48) * airScale;
      const shadowRy = (isHorizontalPose ? 12 : 10.5) * airScale;
      const shadowGrad = ctx.createRadialGradient(0, 3, 4, 0, 3, shadowRx);
      shadowGrad.addColorStop(0, isNight ? `rgba(6, 8, 16, ${(0.45 * airScale).toFixed(2)})` : `rgba(62, 56, 68, ${(0.15 * airScale).toFixed(2)})`);
      shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(0, 3, shadowRx, shadowRy, 0, 0, Math.PI * 2);
      ctx.fill();

      // Translate upward for Jump height z + smooth crouch dip (ZERO head/body widening distortion!)
      const crouchDrop = this.jumpPrepTimer > 0
        ? Math.sin(clamp(this.jumpPrepTimer / 0.12, 0, 1) * Math.PI) * 5.2
        : 0;
      ctx.translate(0, -this.z / scale + crouchDrop);

      // Ultra-subtle fur elasticity strictly clamped to ±2.8% (never pancakes or bloats!)
      const sq = clamp(this.squish.value * 0.025, -0.028, 0.028);
      ctx.scale(1 + sq, 1 - sq);

      // Dispatch to dedicated artist-crafted pose renderers!
      if (this.z > 0.1) {
        this.renderJumpPose(ctx, isNight);
      } else if (this.state === "eat_bowl") {
        this.renderBowlPose(ctx, isNight, false, 1);
      } else if (this.state === "eat_fish_plate") {
        this.renderBowlPose(ctx, isNight, false, -1);
      } else if (this.state === "drink_bowl") {
        this.renderBowlPose(ctx, isNight, true, this.drinkSideDir);
      } else if (this.state === "roll") {
        this.renderRollPose(ctx, isNight);
      } else if (this.state === "lie") {
        this.renderLiePose(ctx, isNight);
      } else if (this.state === "sit" || (this.strideAmp < 0.08 && this.state !== "spin")) {
        this.renderSculptedSitPose(ctx, isNight);
      } else {
        // True 360° Continuous Directional Locomotion: Smooth Front <-> 3/4 Side <-> Back!
        const sinH = Math.sin(this.moveHeading);
        if (sinH > 0.68) {
          this.renderFrontWalkPose(ctx, isNight);
        } else if (sinH < -0.68) {
          this.renderBackWalkPose(ctx, isNight);
        } else {
          this.renderSideWalkPose(ctx, isNight);
        }
      }

      ctx.restore();
    }

    // -------------------------------------------------------------------------
    // POSE 1: Completely Rebuilt Photo-Faithful Sculpted Sitting Pose
    // -------------------------------------------------------------------------

    renderSculptedSitPose(ctx, isNight) {
      const breath = Math.sin(this.time * 2.1) * 1.1;
      const outlineCol = isNight ? "rgba(255, 255, 255, 0.18)" : "rgba(136, 126, 116, 0.42)";

      // 1. Graceful S-Curved Blue-Grey Tail behind sitting haunch
      this.drawCurvedTail(ctx, 27, -14, 1, false);

      // 2. Cozy Tucked Snowy-White Back Paw peeking beneath the dark blue-grey right haunch
      ctx.save();
      ctx.fillStyle = outlineCol;
      ctx.beginPath();
      ctx.ellipse(22, -2.5, 11.2, 6.2, 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#F3EFE8";
      ctx.beginPath();
      ctx.ellipse(22, -2.7, 9.8, 5.1, 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 3. Sculpted Pear-Shaped Sitting Torso (Directly modeled on the reference photo!)
      // Left contour: fluffy snowy-white chest ruff tapering gently into left leg;
      // Right contour: plump curved dark blue-grey sitting back & haunch!
      const defineSitBody = () => {
        ctx.beginPath();
        // Neck top-left (-20, -68) -> plump white chest ruff (-30, -48) -> curves down to left ankle (-22, -6)
        ctx.moveTo(-19, -68 + breath);
        ctx.bezierCurveTo(-32, -56 + breath, -31, -30, -23, -8);
        // Bottom softly rounded across front-left to sitting rump
        ctx.quadraticCurveTo(0, -1, 25, -4);
        // Plump dark blue-grey sitting haunch curving richly up the right side (+37 at hip -> +22 at neck)
        ctx.bezierCurveTo(38, -10, 39, -38, 28, -56 + breath);
        ctx.quadraticCurveTo(22, -66 + breath, 15, -69 + breath);
        ctx.closePath();
      };

      // Pass 1: Outer Silhouette Outline of Torso + Both Front Legs
      ctx.save();
      defineSitBody();
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();

      // Front Leg Coordinates (Natural, slightly staggered polite British Shorthair stance!)
      const batOffsetFL = this.batBlend > 0.01 && this.batSide === "FL" ? { x: this.batTargetLocal.x * 0.45 * this.batBlend, y: this.batTargetLocal.y * 0.5 * this.batBlend } : { x: 0, y: 0 };
      const batOffsetFR = this.batBlend > 0.01 && this.batSide === "FR" ? { x: this.batTargetLocal.x * 0.45 * this.batBlend, y: this.batTargetLocal.y * 0.5 * this.batBlend } : { x: 0, y: 0 };

      const drawSitLegPath = (topX, topY, botX, botY, rTop, rBot) => {
        ctx.beginPath();
        ctx.moveTo(topX - rTop, topY);
        ctx.quadraticCurveTo(lerp(topX, botX, 0.55) - rBot - 0.8, lerp(topY, botY, 0.55), botX - rBot, botY);
        // Plump soft rounded mangosteen paw base (no splay, no ankle seam!)
        ctx.bezierCurveTo(botX - rBot - 0.5, botY + 6.8, botX + rBot + 0.5, botY + 6.8, botX + rBot, botY);
        ctx.quadraticCurveTo(lerp(topX, botX, 0.55) + rBot + 0.8, lerp(topY, botY, 0.55), topX + rTop, topY);
        ctx.closePath();
      };

      // Left Front Leg (FR): (-15, -36) -> (-14.5, -2.5)
      const frTopX = -15.5, frTopY = -36 + breath * 0.5, frBotX = -14.8 + batOffsetFR.x, frBotY = -3.2 + batOffsetFR.y;
      // Right Front Leg (FL, with sleeve): (+2.5, -35) -> (+2.5, -1.2) — slightly forward in 3/4 depth!
      const flTopX = 2.5, flTopY = -35 + breath * 0.5, flBotX = 2.2 + batOffsetFL.x, flBotY = -1.5 + batOffsetFL.y;

      // Outline pass for both front legs
      ctx.save();
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      drawSitLegPath(frTopX, frTopY, frBotX, frBotY, 8.2, 7.0);
      ctx.stroke();
      drawSitLegPath(flTopX, flTopY, flBotX, flBotY, 8.6, 7.3);
      ctx.stroke();
      ctx.restore();

      // Pass 2: Seamless Sculpted Body Fill (Snowy-White Chest + Plump Blue-Grey Back/Haunch!)
      ctx.save();
      defineSitBody();
      ctx.clip();

      // Base creamy snowy-white chest ruff
      ctx.fillStyle = "#FCFBF8";
      ctx.fillRect(-45, -80, 95, 95);

      // Organic blue-grey back & sitting haunch coat (curving smoothly behind the white shoulder!)
      ctx.fillStyle = "#454B5A";
      ctx.beginPath();
      ctx.moveTo(16, -74);
      ctx.bezierCurveTo(15, -52, 13, -34, 15, -14);
      ctx.quadraticCurveTo(16, -4, 14, 6);
      ctx.lineTo(50, 6);
      ctx.lineTo(50, -76);
      ctx.closePath();
      ctx.fill();

      // Subtle warm fluff creases on the big snowy-white chest ruff
      ctx.strokeStyle = "rgba(210, 200, 188, 0.52)";
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(-5, -52 + breath, 12, 0.35, Math.PI - 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-6, -43 + breath, 15, 0.42, Math.PI - 0.42);
      ctx.stroke();
      ctx.restore();

      // Pass 3: Seamless Front Legs Fill & Photo-Accurate Markings!
      // 3A. Viewer's Left Front Leg (FR — Snowy white + small dark slate inner ankle patch)
      ctx.save();
      drawSitLegPath(frTopX, frTopY, frBotX, frBotY, 8.2, 7.0);
      ctx.clip();
      ctx.fillStyle = "#FCFBF8";
      ctx.fillRect(frTopX - 14, frTopY - 6, 30, 50);
      // Iconic small dark inner ankle patch hugging right edge of left leg
      ctx.fillStyle = "#454B5A";
      ctx.beginPath();
      ctx.ellipse(frBotX + 5.2, frBotY - 8.5, 3.0, 4.8, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Soft inner separation shading between the two front legs
      ctx.save();
      ctx.strokeStyle = "rgba(162, 152, 142, 0.34)";
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(frTopX + 7.2, frTopY + 8);
      ctx.quadraticCurveTo(frBotX + 7.4, lerp(frTopY, frBotY, 0.6), frBotX + 6.9, frBotY + 1);
      ctx.stroke();
      ctx.restore();

      // 3B. Viewer's Right Front Leg (FL — White shoulder -> Iconic Blue-Grey Sleeve -> White Sock & Paw!)
      ctx.save();
      drawSitLegPath(flTopX, flTopY, flBotX, flBotY, 8.6, 7.3);
      ctx.clip();
      ctx.fillStyle = "#FCFBF8";
      ctx.fillRect(flTopX - 15, flTopY - 6, 32, 52);

      // Iconic rounded blue-grey forearm sleeve cuff ("半截蓝灰袖套")!
      const sleeveTopY = lerp(flTopY, flBotY, 0.28);
      const sleeveBotY = lerp(flTopY, flBotY, 0.68);
      ctx.fillStyle = "#454B5A";
      ctx.beginPath();
      ctx.moveTo(flTopX - 12, sleeveTopY + 1.5);
      ctx.quadraticCurveTo(flTopX, sleeveTopY - 4.2, flTopX + 12, sleeveTopY + 1.5);
      ctx.lineTo(flBotX + 12, sleeveBotY - 1.2);
      ctx.quadraticCurveTo(flBotX, sleeveBotY + 3.2, flBotX - 12, sleeveBotY - 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Soft outer contour on FL so the sleeved arm stands cleanly in front of the plush chest/haunch
      ctx.save();
      ctx.strokeStyle = "rgba(162, 152, 142, 0.34)";
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(flTopX - 7.8, flTopY + 9);
      ctx.quadraticCurveTo(flBotX - 7.6, lerp(flTopY, flBotY, 0.6), flBotX - 7.2, flBotY + 1);
      ctx.moveTo(flTopX + 8.0, flTopY + 6);
      ctx.quadraticCurveTo(flBotX + 7.8, lerp(flTopY, flBotY, 0.6), flBotX + 7.3, flBotY + 1);
      ctx.stroke();
      ctx.restore();

      // Delicate dainty toe-cleft ticks on both sitting mangosteen paws
      this.drawPawToes(ctx, frBotX, frBotY + 4.4);
      this.drawPawToes(ctx, flBotX, flBotY + 4.4);

      // 4. Chubby British Shorthair Head perched naturally above the fluffy white chest!
      this.drawHead(ctx, -4 + this.headYaw.value * 3.5, -88 + breath + this.headPitch.value * 3.5, this.headYaw.value * 0.45, false);
    }

    // -------------------------------------------------------------------------
    // POSE 2: True Straight-Ahead Front Walk ("正面直走过来" — Zero Crab Walk!)
    // -------------------------------------------------------------------------

    renderFrontWalkPose(ctx, isNight) {
      const outlineCol = isNight ? "rgba(255, 255, 255, 0.18)" : "rgba(136, 126, 116, 0.42)";
      const bob = Math.sin(this.walkCycle * 2) * 2.2 * this.strideAmp;
      const sway = Math.cos(this.walkCycle) * 2.2 * this.strideAmp;
      const turn = clamp(Math.cos(this.moveHeading), -0.78, 0.78);

      // Smooth 3/4 parallax between rear blue-grey haunch and front snowy-white chest!
      const rumpCx = -turn * 14 + sway * 0.45;
      const rumpCy = -45 + bob * 0.85;
      const rumpRx = 26.5;
      const rumpRy = 23.0;

      const chestCx = turn * 6.5 + sway * 0.6;
      const chestCy = -43 + bob;
      const chestRx = 24.5;
      const chestRy = 22.0;

      // 1. Smooth Continuous Blue-Grey Tail curving behind rump opposite the turn
      const tailWave = Math.sin(this.tailPhase) * 7;
      const tailSpan = -turn * 56;
      const tailLift = 26 + Math.abs(turn) * 28;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#393E4C";
      ctx.lineWidth = 13.5;
      ctx.beginPath();
      ctx.moveTo(rumpCx, rumpCy + 4);
      ctx.bezierCurveTo(
        rumpCx + tailSpan * 0.65, rumpCy,
        rumpCx + tailSpan * 1.05 + tailWave * 0.5, rumpCy - tailLift * 0.65,
        rumpCx + tailSpan * 0.92 + tailWave, rumpCy - tailLift
      );
      ctx.stroke();
      ctx.strokeStyle = "#4B5263";
      ctx.lineWidth = 9.5;
      ctx.stroke();
      ctx.restore();

      // 2. SEAMLESS TWO-PASS BLUE-GREY HAUNCH + BOTH BLUE-GREY HIND LEGS!
      // Both hind leg roots anchor deeply inside the plump blue-grey rump ellipse,
      // and share one unified outline pass -> ZERO flat top cutoff & ZERO hip seam!
      const lHindLift = Math.max(0, Math.sin(this.walkCycle)) * 7.5 * this.strideAmp;
      const rHindLift = Math.max(0, -Math.sin(this.walkCycle)) * 7.5 * this.strideAmp;
      const blTopX = rumpCx - 13.5;
      const brTopX = rumpCx + 13.5;
      const hindTopY = rumpCy + 6;
      const blBotX = rumpCx - 15.0 + sway * 0.2;
      const brBotX = rumpCx + 15.0 + sway * 0.2;
      const blBotY = -5 - lHindLift;
      const brBotY = -5 - rHindLift;

      // Pass 2A: Unified outer silhouette outline for [Rump + BL + BR]
      ctx.save();
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(rumpCx, rumpCy, rumpRx, rumpRy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      this.drawFrontViewLegOutline(ctx, blTopX, hindTopY, blBotX, blBotY, outlineCol, 8.6, 6.8);
      this.drawFrontViewLegOutline(ctx, brTopX, hindTopY, brBotX, brBotY, outlineCol, 8.6, 6.8);

      // Pass 2B: Seamless solid #454B5A interior fill for [Rump + Both Hind Legs] + Snowy-White Paws!
      ctx.fillStyle = "#454B5A";
      ctx.beginPath();
      ctx.ellipse(rumpCx, rumpCy, rumpRx, rumpRy, 0, 0, Math.PI * 2);
      ctx.fill();
      this.drawFrontViewLeg(ctx, blTopX, hindTopY, blBotX, blBotY, true, "BL", outlineCol, true, 8.6, 6.8);
      this.drawFrontViewLeg(ctx, brTopX, hindTopY, brBotX, brBotY, true, "BR", outlineCol, true, 8.6, 6.8);

      // Subtle connecting saddle bridge between rump and chest so the blue-grey back merges seamlessly
      ctx.fillStyle = "#454B5A";
      ctx.beginPath();
      ctx.ellipse((rumpCx + chestCx) * 0.5, -47 + bob, Math.abs(rumpCx - chestCx) * 0.5 + 16, 20, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3. SEAMLESS TWO-PASS SNOWY-WHITE CHEST + BOTH FRONT LEGS!
      const lFrontLift = Math.max(0, -Math.sin(this.walkCycle)) * 9.5 * this.strideAmp;
      const rFrontLift = Math.max(0, Math.sin(this.walkCycle)) * 9.5 * this.strideAmp;
      const frTopX = chestCx - 11.5;
      const flTopX = chestCx + 11.5;
      const frontTopY = chestCy + 7;
      const frBotX = chestCx - 12.0 + sway * 0.2;
      const flBotX = chestCx + 12.0 + sway * 0.2;
      const frBotY = -1 - lFrontLift;
      const flBotY = -1 - rFrontLift;

      // Pass 3A: Unified outlines for [Chest + FR + FL]
      ctx.save();
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(chestCx, chestCy, chestRx, chestRy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      this.drawFrontViewLegOutline(ctx, frTopX, frontTopY, frBotX, frBotY, outlineCol);
      this.drawFrontViewLegOutline(ctx, flTopX, frontTopY, flBotX, flBotY, outlineCol);

      // Pass 3B: Seamless Chest Fill (blue-grey upper shoulders halo + big snowy-white chest)
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(chestCx, chestCy, chestRx, chestRy, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#454B5A";
      ctx.fillRect(chestCx - 36, chestCy - 34, 72, 68);
      ctx.fillStyle = "#FCFBF8";
      ctx.beginPath();
      ctx.ellipse(chestCx + turn * 2, chestCy + 5, 23.5, 20.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Pass 3C: Seamless Front Legs Fill (FR white w/ spot on viewer's left; FL w/ grey sleeve on viewer's right!)
      this.drawFrontViewLeg(ctx, frTopX, frontTopY, frBotX, frBotY, false, "FR", outlineCol, true);
      this.drawFrontViewLeg(ctx, flTopX, frontTopY, flBotX, flBotY, false, "FL", outlineCol, true);

      // 4. Front-Facing Chubby Head turning continuously into the curve!
      this.drawHead(ctx, chestCx * 1.15 + turn * 4, -77 + bob * 1.1, turn * 0.52, false);
    }

    traceFrontViewLegPath(ctx, tx, ty, bx, by, rTop = 7.8, rBot = 6.8) {
      ctx.beginPath();
      // Smooth rounded dome top cap so there is NEVER a sharp flat rectangular top corner!
      ctx.moveTo(tx - rTop, ty);
      ctx.quadraticCurveTo(tx, ty - rTop * 1.15, tx + rTop, ty);
      ctx.lineTo(bx + rBot, by);
      ctx.bezierCurveTo(bx + rBot + 0.4, by + 6.2, bx - rBot - 0.4, by + 6.2, bx - rBot, by);
      ctx.closePath();
    }

    drawFrontViewLegOutline(ctx, tx, ty, bx, by, outlineCol, rTop = 7.8, rBot = 6.8) {
      ctx.save();
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      this.traceFrontViewLegPath(ctx, tx, ty, bx, by, rTop, rBot);
      ctx.stroke();
      ctx.restore();
    }

    drawFrontViewLeg(ctx, tx, ty, bx, by, isHind, legId, outlineCol, skipOutline = false, rTop = 7.8, rBot = 6.8) {
      ctx.save();
      if (isHind && !skipOutline) {
        this.drawFrontViewLegOutline(ctx, tx, ty, bx, by, outlineCol, rTop, rBot);
      }
      this.traceFrontViewLegPath(ctx, tx, ty, bx, by, rTop, rBot);

      ctx.save();
      ctx.clip();
      if (isHind) {
        // Match exact #454B5A blue-grey rump color so hind legs blend seamlessly into the haunch!
        ctx.fillStyle = "#454B5A";
        ctx.fillRect(tx - 16, ty - rTop - 4, 32, Math.abs(by - ty) + rTop + 22);
        // Snowy-white hind paw with soft curved ankle line
        ctx.fillStyle = "#F4F1EB";
        ctx.beginPath();
        ctx.moveTo(bx - 12, by - 3.2);
        ctx.quadraticCurveTo(bx, by - 5.2, bx + 12, by - 3.2);
        ctx.lineTo(bx + 12, by + 12);
        ctx.lineTo(bx - 12, by + 12);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = "#FCFBF8";
        ctx.fillRect(tx - 16, ty - rTop - 4, 32, Math.abs(by - ty) + rTop + 22);
        if (legId === "FL") {
          ctx.fillStyle = "#454B5A";
          const cy = lerp(ty, by, 0.52);
          ctx.beginPath();
          ctx.ellipse(lerp(tx, bx, 0.52), cy, 9.5, 6.5, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (legId === "FR") {
          ctx.fillStyle = "#454B5A";
          ctx.beginPath();
          ctx.ellipse(bx + 4.4, by - 7.5, 2.6, 3.8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      if (!isHind) this.drawPawToes(ctx, bx, by + 4.0);
      ctx.restore();
    }

    // -------------------------------------------------------------------------
    // POSE 3: Adorable Back-View Walk ("圆滚滚蓝灰小背影直走离开"!)
    // -------------------------------------------------------------------------

    renderBackWalkPose(ctx, isNight) {
      const outlineCol = isNight ? "rgba(255, 255, 255, 0.18)" : "rgba(136, 126, 116, 0.42)";
      const bob = Math.sin(this.walkCycle * 2) * 2.2 * this.strideAmp;
      const hipSway = Math.cos(this.walkCycle) * 2.8 * this.strideAmp;
      const turn = clamp(Math.cos(this.moveHeading), -0.78, 0.78);
      const headX = hipSway * 0.4 + turn * 18;
      const rumpX = hipSway - turn * 8;

      // 1. Back of Chubby Blue-Grey Head (Smoothly peeks left/right as cat turns!)
      ctx.save();
      ctx.translate(headX, -77 + bob * 0.9);
      // Whiskers peeking subtly on sides
      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-36, 8); ctx.lineTo(-50, 10);
      ctx.moveTo(-35, 13); ctx.lineTo(-49, 17);
      ctx.moveTo(36, 8); ctx.lineTo(50, 10);
      ctx.moveTo(35, 13); ctx.lineTo(49, 17);
      ctx.stroke();

      // Upright dark blue-grey ears (back of ears — solid dark slate!)
      ctx.fillStyle = "#434958";
      ctx.beginPath();
      ctx.moveTo(-16, -18); ctx.lineTo(-37, -45); ctx.quadraticCurveTo(-42, -49, -42, -41); ctx.lineTo(-40, -10); ctx.closePath();
      ctx.moveTo(16, -18); ctx.lineTo(37, -45); ctx.quadraticCurveTo(42, -49, 42, -41); ctx.lineTo(40, -10); ctx.closePath();
      ctx.fill();

      // Round blue-grey back of head
      ctx.fillStyle = "#474D5C";
      ctx.beginPath();
      ctx.ellipse(0, 0, 44, 33, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Front Paws peeking gently on the outer sides as they step
      const lFrontLift = Math.max(0, -Math.sin(this.walkCycle)) * 6.5 * this.strideAmp;
      const rFrontLift = Math.max(0, Math.sin(this.walkCycle)) * 6.5 * this.strideAmp;
      ctx.fillStyle = "#F3EFE8";
      ctx.beginPath();
      ctx.ellipse(-22 + headX * 0.6, -4 - lFrontLift, 6.5, 4.5, 0, 0, Math.PI * 2);
      ctx.ellipse(22 + headX * 0.6, -4 - rFrontLift, 6.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3. Two-Pass Seamless Blue-Grey Round Back + Both Blue-Grey Hind Legs w/ Snowy-White Paws!
      const lHindLift = Math.max(0, Math.sin(this.walkCycle)) * 9.0 * this.strideAmp;
      const rHindLift = Math.max(0, -Math.sin(this.walkCycle)) * 9.0 * this.strideAmp;
      const rumpRx = 29 + Math.abs(turn) * 5.5;

      // Pass 1: Unified Outlines
      ctx.save();
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(rumpX, -44 + bob, rumpRx, 25, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      this.drawFrontViewLegOutline(ctx, -13 + rumpX, -35 + bob, -13.5 + rumpX * 0.7, -2 - lHindLift, outlineCol, 8.2, 6.8);
      this.drawFrontViewLegOutline(ctx, 13 + rumpX, -35 + bob, 13.5 + rumpX * 0.7, -2 - rHindLift, outlineCol, 8.2, 6.8);

      // Pass 2: Seamless Solid #454B5A Rump & Both Blue-Grey Hind Legs -> Crisp White Paws!
      ctx.fillStyle = "#454B5A";
      ctx.beginPath();
      ctx.ellipse(rumpX, -44 + bob, rumpRx, 25, 0, 0, Math.PI * 2);
      ctx.fill();

      const drawRearHindLeg = (tx, ty, bx, by, lifted) => {
        ctx.save();
        this.traceFrontViewLegPath(ctx, tx, ty, bx, by, 8.2, 6.8);
        ctx.clip();

        ctx.fillStyle = "#454B5A";
        ctx.fillRect(tx - 16, ty - 12, 32, 54);
        // Snowy white hind paw!
        ctx.fillStyle = "#FCFBF8";
        ctx.fillRect(bx - 12, by - 4.5, 24, 15);
        // Tiny pink paw pad peeks when hind foot lifts!
        if (lifted > 3.5) {
          ctx.fillStyle = "#F5A0B3";
          ctx.beginPath();
          ctx.arc(bx, by + 1.5, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      };

      drawRearHindLeg(-13 + rumpX, -35 + bob, -13.5 + rumpX * 0.7, -2 - lHindLift, lHindLift);
      drawRearHindLeg(13 + rumpX, -35 + bob, 13.5 + rumpX * 0.7, -2 - rHindLift, rHindLift);

      // 4. Center Swishing Blue-Grey Tail sweeping naturally with the turn!
      const tailW = Math.sin(this.tailPhase) * 14 - turn * 18;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#393E4C";
      ctx.lineWidth = 14.5;
      ctx.beginPath();
      ctx.moveTo(rumpX, -36 + bob);
      ctx.bezierCurveTo(rumpX + tailW * 0.5, -62 + bob, rumpX + tailW * 1.05, -86 + bob, rumpX + tailW * 0.85, -102 + bob);
      ctx.stroke();
      ctx.strokeStyle = "#4D5466";
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.restore();
    }

    // -------------------------------------------------------------------------
    // POSE 4: Seamless Continuous 3/4 Side & Diagonal Walk (Zero 4-Corner Snap!)
    // -------------------------------------------------------------------------

    renderSideWalkPose(ctx, isNight) {
      const cosH = Math.cos(this.moveHeading);
      const sinH = Math.sin(this.moveHeading);
      const walkSign = cosH >= 0 ? 1 : -1;
      // Smooth continuous perspective foreshortening as cat curves toward Front/Back!
      const foreshort = lerp(0.58, 0.96, clamp(Math.abs(cosH), 0, 1));
      const dir = walkSign * foreshort;
      const stride = this.strideAmp;
      const stepBob = Math.sin(this.walkCycle * 2) * 2.0 * stride;

      const chestX = dir * 26;
      const chestY = -47 + stepBob + sinH * 3.0;
      const hipX = -dir * 27;
      const hipY = -48 - stepBob * 0.5 - sinH * 3.0;
      const p = { dir, sit: 0, chestX, chestY, hipX, hipY };

      const stepOffset = (phase) => ({
        x: Math.cos(phase) * 8.0 * foreshort * stride * walkSign,
        y: -Math.max(0, -Math.sin(phase)) * 7.5 * stride
      });

      const sBL = stepOffset(this.walkCycle);
      const sFL = stepOffset(this.walkCycle - Math.PI * 0.5);
      const sBR = stepOffset(this.walkCycle - Math.PI);
      const sFR = stepOffset(this.walkCycle - Math.PI * 1.5);

      const frSocketX = chestX + dir * 3.0 - 2.0;
      const flSocketX = chestX + dir * 3.0 + 2.0;
      const fSocketY = chestY + 10;
      const brSocketX = hipX - dir * 3.0 - 2.0;
      const blSocketX = hipX - dir * 3.0 + 2.0;
      const bSocketY = hipY + 10;

      const legs = {
        FL: solve2BoneIK(flSocketX, fSocketY, flSocketX + sFL.x, sFL.y - 3.2, 20.5, 20.5, walkSign * 0.16),
        FR: solve2BoneIK(frSocketX, fSocketY, frSocketX + sFR.x, sFR.y - 3.2, 20.5, 20.5, walkSign * 0.16),
        BL: solve2BoneIK(blSocketX, bSocketY, blSocketX + sBL.x, sBL.y - 3.6, 21.5, 20.5, walkSign * 0.18),
        BR: solve2BoneIK(brSocketX, bSocketY, brSocketX + sBR.x, sBR.y - 3.6, 21.5, 20.5, walkSign * 0.18)
      };

      const farHind = dir >= 0 ? "BL" : "BR";
      const farFront = dir >= 0 ? "FL" : "FR";
      const nearHind = dir >= 0 ? "BR" : "BL";
      const nearFront = dir >= 0 ? "FR" : "FL";

      this.drawWalkLegOutline(ctx, legs[farHind], farHind, isNight);
      this.drawWalkLegFill(ctx, legs[farHind], farHind, true, dir);
      this.drawWalkLegOutline(ctx, legs[farFront], farFront, isNight);
      this.drawWalkLegFill(ctx, legs[farFront], farFront, true, dir);

      const isPerky = this.state === "trot" || this.state === "chase_laser" || this.state === "spin";
      this.drawCurvedTail(ctx, hipX - walkSign * 20 * foreshort, hipY - 2, -walkSign, isPerky);

      // Two-pass unified silhouette for [Torso + Near Legs]
      this.drawWalkTorsoOutline(ctx, p, isNight);
      this.drawWalkLegOutline(ctx, legs[nearHind], nearHind, isNight);
      this.drawWalkLegOutline(ctx, legs[nearFront], nearFront, isNight);

      this.drawWalkTorsoFill(ctx, p);
      this.drawWalkLegFill(ctx, legs[nearHind], nearHind, false, dir);
      this.drawWalkLegFill(ctx, legs[nearFront], nearFront, false, dir);

      // Head looks naturally forward in the walking direction!
      this.drawHead(ctx, chestX + dir * 15, chestY - 29, dir * 0.54, false);
    }

    // -------------------------------------------------------------------------
    // POSE 5: Playful Mid-Air Jump / Pounce Pose ("轻盈腾空跳跃扑抓")
    // -------------------------------------------------------------------------

    renderJumpPose(ctx, isNight) {
      const dir = this.bodyDir >= 0 ? 1 : -1;
      const pitch = clamp(-this.vz * 0.00072, -0.30, 0.30) * dir;

      ctx.save();
      ctx.translate(0, -40);
      ctx.rotate(pitch);

      // Streaming outstretched tail
      this.drawCurvedTail(ctx, -dir * 34, -4, -dir, true);

      // Stretched hind legs trailing gracefully back (blue-grey w/ white paws!)
      const hindLeg = solve2BoneIK(-dir * 26, 4, -dir * 46, 22, 22, 20, -dir * 0.15);
      // Outstretched front paws reaching eagerly forward!
      const frontLegFar = solve2BoneIK(dir * 22, 2, dir * 42, 14, 20, 19, dir * 0.15);
      const frontLegNear = solve2BoneIK(dir * 24, 5, dir * 46, 18, 20, 19, dir * 0.18);

      this.drawWalkLegOutline(ctx, frontLegFar, dir >= 0 ? "FL" : "FR", isNight);
      this.drawWalkLegFill(ctx, frontLegFar, dir >= 0 ? "FL" : "FR", true, dir);

      // Sleek stretched agile leaping body (never chunky or bloated!)
      const p = { dir, sit: 0, chestX: dir * 25, chestY: -4, hipX: -dir * 26, hipY: -2, rHip: 21.8, rChest: 21.0 };
      this.drawWalkTorsoOutline(ctx, p, isNight);
      this.drawWalkLegOutline(ctx, hindLeg, dir >= 0 ? "BR" : "BL", isNight);
      this.drawWalkLegOutline(ctx, frontLegNear, dir >= 0 ? "FR" : "FL", isNight);

      this.drawWalkTorsoFill(ctx, p);
      this.drawWalkLegFill(ctx, hindLeg, dir >= 0 ? "BR" : "BL", false, dir);
      this.drawWalkLegFill(ctx, frontLegNear, dir >= 0 ? "FR" : "FL", false, dir);

      // Eager starry-eyed head looking toward landing spot!
      this.drawHead(ctx, dir * 36, -24, dir * 0.45, false);

      ctx.restore();
    }

    // -------------------------------------------------------------------------
    // POSE 6: Belly-Up Playful Roll Pose ("露白肚皮打滚卖萌")
    // -------------------------------------------------------------------------

    renderRollPose(ctx, isNight) {
      const rock = Math.sin(this.rollPhase) * 0.24; // Gentle playful side-to-side belly rock!
      const dir = this.bodyDir >= 0 ? 1 : -1;
      const outlineCol = isNight ? "rgba(255, 255, 255, 0.2)" : "rgba(136, 126, 116, 0.42)";

      ctx.save();
      ctx.translate(Math.sin(this.rollPhase) * 4, -22);
      ctx.rotate(rock);

      // Happily wagging tail curving cleanly OUTWARD behind rump (never crossing belly!)
      const tw = Math.sin(this.tailPhase) * 10;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#393E4C";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(-dir * 46, 4);
      ctx.bezierCurveTo(-dir * 66, 2, -dir * 72, -18 + tw, -dir * 62, -32 + tw);
      ctx.stroke();
      ctx.strokeStyle = "#4A5061";
      ctx.lineWidth = 9.5;
      ctx.stroke();
      ctx.restore();

      // Plush Rounded Blue-Grey Back Underneath + Big Fluffy Snowy-White Belly Facing Up!
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(-dir * 10, 2, 42, 23, 0, 0, Math.PI * 2);
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.clip();

      ctx.fillStyle = "#454B5A";
      ctx.fillRect(-62, -30, 110, 62);
      // Big soft snowy-white belly rolled upward!
      ctx.fillStyle = "#FCFBF8";
      ctx.beginPath();
      ctx.ellipse(-dir * 6, -5, 34, 17.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Four Cute Curled Paws Wiggling in the Air with Tiny Pink Toe Beans!
      const wig = Math.sin(this.rollPhase * 2.2) * 3.0;
      const drawUpPaw = (px, py, isGreyLeg, hasSleeve) => {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.sin(this.rollPhase * 2 + px * 0.1) * 0.18);

        ctx.strokeStyle = outlineCol;
        ctx.lineWidth = 14.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(0, -5);
        ctx.stroke();

        ctx.strokeStyle = isGreyLeg ? "#454B5A" : "#FCFBF8";
        ctx.lineWidth = 12.2;
        ctx.stroke();

        if (hasSleeve) {
          ctx.strokeStyle = "#454B5A";
          ctx.lineWidth = 12.2;
          ctx.beginPath();
          ctx.moveTo(0, 5);
          ctx.lineTo(0, -1);
          ctx.stroke();
        }

        // Snowy-white paw tip + tiny pink toe beans!
        ctx.fillStyle = "#FCFBF8";
        ctx.beginPath();
        ctx.ellipse(0, -8, 7.0, 6.0, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#F5A0B3";
        ctx.beginPath();
        ctx.arc(0, -7, 2.2, 0, Math.PI * 2);
        ctx.arc(-3.0, -10.0, 1.1, 0, Math.PI * 2);
        ctx.arc(0, -11.0, 1.1, 0, Math.PI * 2);
        ctx.arc(3.0, -10.0, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      // Hind paws on left (blue-grey legs + snowy white paws + pink beans)
      drawUpPaw(-dir * 38, -14 + wig * 0.6, true, false);
      drawUpPaw(-dir * 24, -18 - wig * 0.6, true, false);
      // Front paws near chest (white + FL sleeve + pink beans!)
      drawUpPaw(-dir * 2, -19 + wig, false, true);
      drawUpPaw(dir * 12, -16 - wig, false, false);

      // Happy playfully tilted head resting beside the white belly!
      ctx.save();
      ctx.translate(dir * 42, -6);
      ctx.rotate(dir * 0.28 + rock * 0.5);
      this.drawHead(ctx, 0, 0, -dir * 0.12, false);
      ctx.restore();

      ctx.restore();
    }

    // -------------------------------------------------------------------------
    // POSE 7: Cozy Stretched Side-Lying Lounge ("暖阳侧躺打盹")
    // -------------------------------------------------------------------------

    renderLiePose(ctx, isNight) {
      const dir = this.bodyDir >= 0 ? 1 : -1;
      const breath = Math.sin(this.time * 1.45) * 1.4;
      const outlineCol = isNight ? "rgba(255, 255, 255, 0.18)" : "rgba(136, 126, 116, 0.42)";
      const isSleeping = this.idleSleepTimer > 4.5 && this.theme === "night";

      // 1. Lazy Curled Tail resting softly along the floor behind the rump
      const tipWag = Math.sin(this.time * 1.5) * 6;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#393E4C";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(-dir * 42, -10);
      ctx.bezierCurveTo(-dir * 64, -4, -dir * 70, -20 + tipWag, -dir * 58, -32 + tipWag);
      ctx.stroke();
      ctx.strokeStyle = "#4B5263";
      ctx.lineWidth = 9.5;
      ctx.stroke();
      ctx.restore();

      // 2. Stretched Plush Lying Body (Arched dark blue-grey back + cozy snowy-white chest/belly!)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-dir * 44, -6);
      ctx.bezierCurveTo(-dir * 48, -38 - breath, -dir * 10, -46 - breath, dir * 28, -36 - breath);
      ctx.bezierCurveTo(dir * 42, -30, dir * 44, -8, dir * 32, -3);
      ctx.quadraticCurveTo(0, 1, -dir * 44, -6);
      ctx.closePath();

      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.6;
      ctx.stroke();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#FCFBF8";
      ctx.fillRect(-60, -60, 120, 70);

      // Smooth blue-grey back & tucked haunch
      ctx.fillStyle = "#454B5A";
      ctx.beginPath();
      ctx.moveTo(dir * 22, -48);
      ctx.bezierCurveTo(dir * 6, -24, -dir * 8, -14, -dir * 16, 4);
      ctx.lineTo(-dir * 60, 4);
      ctx.lineTo(-dir * 60, -55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.restore();

      // 3. Tucked Snowy-White Hind Paw peeking under the blue-grey haunch
      ctx.save();
      ctx.fillStyle = outlineCol;
      ctx.beginPath();
      ctx.ellipse(-dir * 26, -3, 11, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FCFBF8";
      ctx.beginPath();
      ctx.ellipse(-dir * 26, -3.2, 9.8, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 4. Two Cute Front Paws Stretched Politely Out in Front of Chest!
      const drawRestingFrontPaw = (xStart, xEnd, yPos, hasSleeve) => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.strokeStyle = outlineCol;
        ctx.lineWidth = 14.5;
        ctx.beginPath();
        ctx.moveTo(xStart, yPos);
        ctx.lineTo(xEnd, yPos);
        ctx.stroke();

        ctx.strokeStyle = "#FCFBF8";
        ctx.lineWidth = 12.2;
        ctx.stroke();

        if (hasSleeve) {
          ctx.strokeStyle = "#454B5A";
          ctx.lineWidth = 12.2;
          ctx.beginPath();
          ctx.moveTo(lerp(xStart, xEnd, 0.25), yPos);
          ctx.lineTo(lerp(xStart, xEnd, 0.62), yPos);
          ctx.stroke();
        }
        ctx.restore();
      };

      drawRestingFrontPaw(dir * 22, dir * 48, -6.5, dir >= 0);
      drawRestingFrontPaw(dir * 26, dir * 55, -2.5, dir < 0);

      // 5. Peaceful Head Resting Low Above Front Paws!
      this.drawHead(ctx, dir * 32, -37 - breath * 0.6, dir * 0.35, isSleeping);
    }

    // -------------------------------------------------------------------------
    // POSE 8: Happy Low-Head Bowl Feeding & Water-Lapping Pose ("埋头干饭 / 吧嗒舔水")
    // -------------------------------------------------------------------------

    renderBowlPose(ctx, isNight, isDrinking = false, forcedDir = null) {
      const dir = forcedDir !== null ? (forcedDir >= 0 ? 1 : -1) : (isDrinking ? (this.drinkSideDir >= 0 ? 1 : -1) : 1);
      const bobRate = isDrinking ? 9.2 : 7.4;
      const bobAmp = isDrinking ? 4.2 : 5.2;
      const munchBob = Math.abs(Math.sin(this.time * bobRate)) * bobAmp;
      const bodyBreath = Math.sin(this.time * 3.8) * 1.1;
      const outlineCol = isNight ? "rgba(255, 255, 255, 0.18)" : "rgba(136, 126, 116, 0.42)";

      // 1. Happily swaying tail behind plump crouched haunch
      this.drawCurvedTail(ctx, -dir * 38, -18, -dir, true);

      // 2. Far front paw braced steadily on floor
      const farLegId = dir >= 0 ? "FL" : "FR";
      const nearLegId = dir >= 0 ? "FR" : "FL";
      const farFront = solve2BoneIK(dir * 16, -24, dir * 21, -2.5, 16, 16, dir * 0.14);
      this.drawWalkLegOutline(ctx, farFront, farLegId, isNight);
      this.drawWalkLegFill(ctx, farFront, farLegId, true, dir);

      // 3. Crouched Feeding / Drinking Torso
      const p = {
        dir,
        sit: 0,
        chestX: dir * 16,
        chestY: -34 + bodyBreath,
        hipX: -dir * 22,
        hipY: -30 - bodyBreath * 0.5,
        rHip: 24.0,
        rChest: 21.5
      };

      const nearFront = solve2BoneIK(dir * 14, -22, dir * 18, -1.8, 16, 16, dir * 0.16);
      this.drawWalkTorsoOutline(ctx, p, isNight);
      this.drawWalkLegOutline(ctx, nearFront, nearLegId, isNight);

      // Tucked snowy-white hind paw peeking cleanly beneath blue-grey crouched haunch
      ctx.save();
      ctx.fillStyle = outlineCol;
      ctx.beginPath();
      ctx.ellipse(-dir * 20, -2.2, 11.2, 5.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FCFBF8";
      ctx.beginPath();
      ctx.ellipse(-dir * 20, -2.4, 9.8, 4.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      this.drawWalkTorsoFill(ctx, p);
      this.drawWalkLegFill(ctx, nearFront, nearLegId, false, dir);

      // 4. Head lowered eagerly over the bowl, nodding happily with each crunch or lap!
      ctx.save();
      ctx.translate(dir * 34, -36 + munchBob);
      ctx.rotate(dir * (0.24 + munchBob * 0.018));
      this.drawHead(ctx, 0, 0, dir * 0.42, false);
      ctx.restore();
    }

    // -------------------------------------------------------------------------
    // Shared Torso, Leg, Tail & Head Helpers
    // -------------------------------------------------------------------------

    traceLimbGeometry(ctx, ik, legId) {
      const { sx, sy, jx, jy, px, py } = ik;
      const isHind = legId === "BL" || legId === "BR";
      const rTop = isHind ? 11.8 : 9.6;
      const rBot = 6.4;

      const midX = (sx + px) * 0.5;
      const midY = (sy + py) * 0.5;
      const cx = midX + (jx - midX) * 1.3;
      const cy = midY + (jy - midY) * 1.3;

      const sample = (t) => {
        const mt = 1 - t;
        const x = mt * mt * sx + 2 * mt * t * cx + t * t * px;
        const y = mt * mt * sy + 2 * mt * t * cy + t * t * py;
        let tx = 2 * mt * (cx - sx) + 2 * t * (px - cx);
        let ty = 2 * mt * (cy - sy) + 2 * t * (py - cy);
        const len = Math.hypot(tx, ty) || 1;
        tx /= len;
        ty /= len;
        const r = lerp(rTop, rBot, Math.pow(t, 0.85));
        return { x, y, ux: tx, uy: ty, nx: -ty, ny: tx, r };
      };

      const pts = [0, 0.22, 0.45, 0.68, 0.86, 1.0].map(sample);
      const end = pts[pts.length - 1];
      const capReach = 5.6;

      ctx.beginPath();
      ctx.moveTo(pts[0].x + pts[0].nx * pts[0].r, pts[0].y + pts[0].ny * pts[0].r);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x + pts[i].nx * pts[i].r, pts[i].y + pts[i].ny * pts[i].r);
      }
      const lx = end.x + end.nx * end.r;
      const ly = end.y + end.ny * end.r;
      const rx = end.x - end.nx * end.r;
      const ry = end.y - end.ny * end.r;
      ctx.bezierCurveTo(
        lx + end.ux * capReach,
        ly + end.uy * capReach,
        rx + end.ux * capReach,
        ry + end.uy * capReach,
        rx,
        ry
      );
      for (let i = pts.length - 2; i >= 0; i--) {
        ctx.lineTo(pts[i].x - pts[i].nx * pts[i].r, pts[i].y - pts[i].ny * pts[i].r);
      }
      ctx.closePath();

      return { sample, end, capReach };
    }

    drawWalkLegOutline(ctx, ik, legId, isNight) {
      ctx.save();
      this.traceLimbGeometry(ctx, ik, legId);
      ctx.strokeStyle = isNight ? "rgba(255, 255, 255, 0.18)" : "rgba(138, 128, 118, 0.42)";
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();
    }

    drawWalkLegFill(ctx, ik, legId, isFarSide, dir) {
      const { sx, sy, jx, jy, px, py } = ik;
      const isHind = legId === "BL" || legId === "BR";
      const whiteFur = isFarSide ? "#F4F1EB" : "#FCFBF8";
      const greyFur = isFarSide ? "#3A404E" : "#454B5A";

      ctx.save();
      const { sample, end, capReach } = this.traceLimbGeometry(ctx, ik, legId);

      ctx.save();
      ctx.clip();

      const boxX = Math.min(sx, jx, px) - 28;
      const boxY = Math.min(sy, jy, py) - 28;
      const boxW = Math.abs(px - sx) + 64;
      const boxH = Math.abs(py - sy) + 64;

      if (isHind) {
        // Solid blue-grey hind leg (zero white under-fill -> zero fringe seam against blue-grey rump!) + white paw!
        ctx.fillStyle = greyFur;
        ctx.fillRect(boxX, boxY, boxW, boxH);

        const pAnkle = sample(0.72);
        const nx = pAnkle.nx * 14;
        const ny = pAnkle.ny * 14;
        const pawTipX = end.x + end.ux * (capReach + 12);
        const pawTipY = end.y + end.uy * (capReach + 12);

        ctx.fillStyle = whiteFur;
        ctx.beginPath();
        ctx.moveTo(pAnkle.x - nx, pAnkle.y - ny);
        ctx.quadraticCurveTo(pAnkle.x, pAnkle.y - 2.6, pAnkle.x + nx, pAnkle.y + ny);
        ctx.lineTo(pawTipX + nx, pawTipY + ny);
        ctx.lineTo(pawTipX - nx, pawTipY - ny);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = whiteFur;
        ctx.fillRect(boxX, boxY, boxW, boxH);

        if (legId === "FL") {
          const pTopCuff = sample(0.38);
          const pBotCuff = sample(0.68);
          const nx = pTopCuff.nx * 14;
          const ny = pTopCuff.ny * 14;
          const bnx = pBotCuff.nx * 14;
          const bny = pBotCuff.ny * 14;
          ctx.fillStyle = greyFur;
          ctx.beginPath();
          ctx.moveTo(pTopCuff.x - nx, pTopCuff.y - ny + 1.2);
          ctx.quadraticCurveTo(pTopCuff.x, pTopCuff.y - 3.5, pTopCuff.x + nx, pTopCuff.y + ny + 1.2);
          ctx.lineTo(pBotCuff.x + bnx, pBotCuff.y + bny - 0.8);
          ctx.quadraticCurveTo(pBotCuff.x, pBotCuff.y + 2.8, pBotCuff.x - bnx, pBotCuff.y - bny - 0.8);
          ctx.closePath();
          ctx.fill();
        } else if (legId === "FR" && !isFarSide) {
          const pSpot = sample(0.68);
          ctx.fillStyle = greyFur;
          ctx.beginPath();
          ctx.ellipse(pSpot.x + (dir >= 0 ? -3.4 : 3.4), pSpot.y, 2.7, 4.0, 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      if (!isFarSide) {
        const tipX = end.x + end.ux * (capReach * 0.76);
        const tipY = end.y + end.uy * (capReach * 0.76);
        ctx.strokeStyle = "rgba(158, 148, 138, 0.38)";
        ctx.lineWidth = 1.05;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const offset of [-2.2, 2.2]) {
          const bx = tipX + end.nx * offset;
          const by = tipY + end.ny * offset;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx - end.ux * 2.5, by - end.uy * 2.5);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    traceWalkTorsoGeometry(ctx, p) {
      const { chestX, chestY, hipX, hipY } = p;
      const rHip = p.rHip !== undefined ? p.rHip : 24.5;
      const rChest = p.rChest !== undefined ? p.rChest : 23.5;
      const angle = Math.atan2(chestY - hipY, chestX - hipX);
      const a1 = angle - Math.PI * 0.5;
      const a2 = angle + Math.PI * 0.5;
      ctx.beginPath();
      ctx.arc(hipX, hipY, rHip, a2, a1 + Math.PI * 2, false);
      ctx.arc(chestX, chestY, rChest, a1, a2, false);
      ctx.closePath();
    }

    drawWalkTorsoOutline(ctx, p, isNight) {
      ctx.save();
      this.traceWalkTorsoGeometry(ctx, p);
      ctx.strokeStyle = isNight ? "rgba(255, 255, 255, 0.16)" : "rgba(138, 128, 118, 0.40)";
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();
    }

    drawWalkTorsoFill(ctx, p) {
      const { chestX, chestY, hipX, hipY, dir } = p;
      ctx.save();
      this.traceWalkTorsoGeometry(ctx, p);
      ctx.clip();

      ctx.fillStyle = "#FCFBF8";
      ctx.fillRect(-130, -140, 260, 170);

      // Solid blue-grey back & ENTIRE rear hip circle -> seamless join into blue-grey hind legs!
      const wSign = dir >= 0 ? 1 : -1;
      const neckBackX = chestX - wSign * 6;
      const hipFrontX = hipX + wSign * 14;
      ctx.fillStyle = "#454B5A";
      ctx.beginPath();
      ctx.moveTo(neckBackX, chestY - 40);
      ctx.bezierCurveTo(chestX - wSign * 14, chestY - 8, hipFrontX + wSign * 2, hipY + 2, hipFrontX, hipY + 32);
      ctx.lineTo(hipX - wSign * 75, hipY + 35);
      ctx.lineTo(hipX - wSign * 75, chestY - 65);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    drawPawToes(ctx, cx, cy) {
      ctx.save();
      ctx.strokeStyle = "rgba(158, 148, 138, 0.40)";
      ctx.lineWidth = 1.05;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 2.3, cy);
      ctx.lineTo(cx - 2.3, cy - 2.6);
      ctx.moveTo(cx + 2.3, cy);
      ctx.lineTo(cx + 2.3, cy - 2.6);
      ctx.stroke();
      ctx.restore();
    }

    drawCurvedTail(ctx, rootX, rootY, backSign, isPerky) {
      const wave1 = Math.sin(this.tailPhase) * 10;
      const wave2 = Math.cos(this.tailPhase - 0.8) * 14;

      const c1x = rootX + backSign * 22;
      const c1y = rootY + (isPerky ? -6 : 8) + wave1 * 0.4;
      const c2x = rootX + backSign * (isPerky ? 38 : 42) + wave2 * 0.5;
      const c2y = rootY + (isPerky ? -34 : -18) + wave1 * 0.5;
      const tipX = rootX + backSign * (isPerky ? 30 : 40) + wave2;
      const tipY = rootY + (isPerky ? -52 : -38) + wave1 * 0.3;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#393E4C";
      ctx.lineWidth = 14.5;
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tipX, tipY);
      ctx.stroke();

      ctx.strokeStyle = "#4A5061";
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.restore();
    }

    drawHead(ctx, headX, headY, faceTurn, isSleeping) {
      const tiltRad = (this.headTilt.value * Math.PI) / 180;
      const mx = clamp(faceTurn, -0.55, 0.55) * 12.5;
      const my = 1 + this.headPitch.value * 4.5;

      ctx.save();
      ctx.translate(headX, headY);
      ctx.rotate(tiltRad);

      // Soft chin shadow
      ctx.fillStyle = "rgba(42, 38, 52, 0.11)";
      ctx.beginPath();
      ctx.ellipse(0, 31, 31, 8.2, 0, 0, Math.PI * 2);
      ctx.fill();

      this.drawEar(ctx, -28, -22, -1, this.earLeft.value);
      this.drawEar(ctx, 28, -22, 1, this.earRight.value);

      // Plump British Shorthair Round Head
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, -35);
      ctx.bezierCurveTo(28, -35, 44, -20, 47, 2);
      ctx.bezierCurveTo(50, 22, 36, 34, 16, 35);
      ctx.bezierCurveTo(6, 36, -6, 36, -16, 35);
      ctx.bezierCurveTo(-36, 34, -50, 22, -47, 2);
      ctx.bezierCurveTo(-44, -20, -28, -35, 0, -35);
      ctx.closePath();

      const headGrad = ctx.createRadialGradient(mx * 0.4, -12, 6, 0, 4, 52);
      headGrad.addColorStop(0, "#596072");
      headGrad.addColorStop(0.62, "#474D5C");
      headGrad.addColorStop(1, "#373C48");
      ctx.fillStyle = headGrad;
      ctx.fill();

      ctx.clip();

      // Snowy White Inverted-V Blaze ("正八字开脸")
      ctx.fillStyle = "#FCFBF9";
      ctx.beginPath();
      ctx.moveTo(mx, -14 + my * 0.3);
      ctx.bezierCurveTo(mx - 5, -2 + my * 0.4, mx - 13, 8 + my * 0.5, mx - 28, 18 + my * 0.5);
      ctx.bezierCurveTo(mx - 34, 28, mx - 20, 40, mx, 40);
      ctx.bezierCurveTo(mx + 20, 40, mx + 34, 28, mx + 28, 18 + my * 0.5);
      ctx.bezierCurveTo(mx + 13, 8 + my * 0.5, mx + 5, -2 + my * 0.4, mx, -14 + my * 0.3);
      ctx.closePath();
      ctx.fill();

      // Rosy Blush
      ctx.fillStyle = `rgba(255, 142, 168, ${(this.blush.value * 0.45).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(mx - 26, 15 + my * 0.4, 8.5, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(mx + 26, 15 + my * 0.4, 8.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Copper-Amber Eyes
      const eyeY = -1 + my * 0.35;
      this.drawEye(ctx, mx * 0.72 - 19, eyeY, isSleeping);
      this.drawEye(ctx, mx * 0.72 + 19, eyeY, isSleeping);

      // Muzzle: Left Smudge + Right Beauty Mole + Dark Heart Nose
      const noseX = mx;
      const noseY = 9 + my * 0.55;

      ctx.fillStyle = "#4E5464";
      ctx.beginPath();
      ctx.ellipse(noseX - 8.5, noseY + 6.2, 6.2, 4.0, -0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(noseX + 7.8, noseY + 7.5, 3.1, 2.7, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1E2028";
      ctx.beginPath();
      ctx.moveTo(noseX - 4.8, noseY - 1.5);
      ctx.quadraticCurveTo(noseX, noseY - 3.2, noseX + 4.8, noseY - 1.5);
      ctx.quadraticCurveTo(noseX + 4.2, noseY + 2.5, noseX, noseY + 4.2);
      ctx.quadraticCurveTo(noseX - 4.2, noseY + 2.5, noseX - 4.8, noseY - 1.5);
      ctx.closePath();
      ctx.fill();

      const mouthOpen = this.mewMouthTimer > 0 || (this.munchTimer > 0 && Math.sin(this.time * 26) > 0);
      if (this.state === "drink_bowl") {
        // Adorable pink lapping tongue flicking out rhythmically while drinking water!
        const tongueOut = Math.max(0, Math.sin(this.time * 9.8));
        if (tongueOut > 0.08) {
          const tLen = 3.5 + tongueOut * 6.2;
          ctx.fillStyle = "#F48CA5";
          ctx.beginPath();
          ctx.ellipse(noseX, noseY + 8.5 + tLen * 0.55, 3.6, tLen * 0.65, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(noseX, noseY + 9.2);
          ctx.lineTo(noseX, noseY + 8.5 + tLen * 0.8);
          ctx.stroke();
        }
      } else if (mouthOpen) {
        ctx.fillStyle = "#E07A90";
        ctx.beginPath();
        ctx.ellipse(noseX, noseY + 9.2, 4.2, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "#5B565E";
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(noseX, noseY + 4);
      ctx.lineTo(noseX, noseY + 7);
      ctx.moveTo(noseX - 5.5, noseY + 9.5);
      ctx.quadraticCurveTo(noseX - 2.5, noseY + 11.8, noseX, noseY + 7.2);
      ctx.quadraticCurveTo(noseX + 2.5, noseY + 11.8, noseX + 5.5, noseY + 9.5);
      ctx.stroke();

      // Delicate White Whiskers
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(noseX - 18, noseY + 5);
      ctx.quadraticCurveTo(noseX - 36, noseY + 2, noseX - 52, noseY + 6);
      ctx.moveTo(noseX - 18, noseY + 9);
      ctx.quadraticCurveTo(noseX - 36, noseY + 10, noseX - 51, noseY + 15);
      ctx.moveTo(noseX + 18, noseY + 5);
      ctx.quadraticCurveTo(noseX + 36, noseY + 2, noseX + 52, noseY + 6);
      ctx.moveTo(noseX + 18, noseY + 9);
      ctx.quadraticCurveTo(noseX + 36, noseY + 10, noseX + 51, noseY + 15);
      ctx.stroke();

      ctx.restore();
    }

    drawEar(ctx, baseX, baseY, side, extraDeg) {
      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate((extraDeg * Math.PI) / 180);

      ctx.fillStyle = "#454B5A";
      ctx.beginPath();
      ctx.moveTo(-side * 12, 4);
      ctx.lineTo(side * 11, -24);
      ctx.quadraticCurveTo(side * 16, -28, side * 17, -21);
      ctx.lineTo(side * 16, 12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#524652";
      ctx.beginPath();
      ctx.moveTo(-side * 6, 3);
      ctx.lineTo(side * 10, -18);
      ctx.quadraticCurveTo(side * 13, -20, side * 13.5, -16);
      ctx.lineTo(side * 12, 8);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    drawEye(ctx, ex, ey, isSleeping) {
      ctx.save();
      ctx.translate(ex, ey);

      if (this.happyTimer > 0) {
        ctx.strokeStyle = "#23252E";
        ctx.lineWidth = 2.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(0, 3, 7.2, Math.PI + 0.35, -0.35);
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (isSleeping) {
        ctx.strokeStyle = "#2A2D38";
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(0, -1, 6.8, 0.3, Math.PI - 0.3);
        ctx.stroke();
        ctx.restore();
        return;
      }

      ctx.beginPath();
      ctx.ellipse(0, 0, 9.2, 8.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#22242D";
      ctx.fill();
      ctx.clip();

      const irisGrad = ctx.createRadialGradient(-1, -1, 1.5, 0, 0, 8.5);
      irisGrad.addColorStop(0, "#F5B356");
      irisGrad.addColorStop(0.55, "#D67F24");
      irisGrad.addColorStop(1, "#7B410C");
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8.4, 8.0, 0, 0, Math.PI * 2);
      ctx.fill();

      const gx = this.headYaw.value * 2.2;
      const gy = this.headPitch.value * 1.8;
      const pr = 5.4 * this.pupilSize.value;

      ctx.fillStyle = "#14131A";
      ctx.beginPath();
      ctx.arc(gx, gy, pr, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(gx - 2.4, gy - 2.5, 2.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(gx + 2.1, gy + 2.1, 0.9, 0, Math.PI * 2);
      ctx.fill();

      if (this.isBlinking) {
        const close = Math.sin(this.blinkProg);
        ctx.fillStyle = "#474D5C";
        ctx.fillRect(-11, -11, 22, close * 21);
      }

      ctx.restore();
    }
  }

  window.FreeRoamingCat = FreeRoamingCat;
})();

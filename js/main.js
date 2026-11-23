/**
 * MoeMew Minimalist Main Controller (js/main.js)
 * Connects full-screen free-roaming cat, minimalist controls, and Web Audio BGM.
 */
(function () {
  "use strict";

  const THEME_META = {
    day: "#FAF8F4",
    dusk: "#EFE3DC",
    night: "#161925"
  };

  document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("stage-canvas");
    const musicPill = document.getElementById("music-pill");
    const musicToggle = document.getElementById("music-toggle");
    const musicNext = document.getElementById("music-next");
    const musicTitle = document.getElementById("music-title");
    const toastEl = document.getElementById("whisper-toast");
    const metaTheme = document.getElementById("meta-theme-color");

    const cat = new window.FreeRoamingCat(window.innerWidth, window.innerHeight);
    const world = new window.WidescreenWorld(canvas, cat);

    let mode = "roam";
    let toastTimer = null;

    function whisper(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add("visible");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastEl.classList.remove("visible");
      }, 2400);
    }

    // 1. Audio BGM Integration (Auto-unlocks on first touch/click)
    if (window.MoeAudio) {
      window.MoeAudio.onStateChange = ({ isPlaying, track }) => {
        musicTitle.textContent = track.name.replace(" ♪", "");
        musicPill.classList.toggle("playing", isPlaying);
      };

      window.MoeAudio.onMelodyNote = () => {
        if (document.hidden) return;
        if (Math.random() < 0.35) {
          const s = cat.getScale();
          world.spawnNote(cat.x + (Math.random() - 0.5) * 30, cat.y - 88 * s);
        }
      };
    }

    const autoUnlockAudio = () => {
      if (window.MoeAudio && !window.MoeAudio.unlocked) {
        window.MoeAudio.unlockAndPlay();
      }
    };
    window.addEventListener("pointerdown", autoUnlockAudio, { passive: true });
    window.addEventListener("keydown", autoUnlockAudio, { passive: true });

    musicToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.MoeAudio) {
        const on = window.MoeAudio.toggleBGM();
        whisper(on ? `正在播放 · ${window.MoeAudio.getCurrentTrack().name}` : "背景音乐已静音");
      }
    });

    musicNext.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.MoeAudio) {
        window.MoeAudio.unlockAndPlay();
        const t = window.MoeAudio.nextTrack();
        whisper(`切换曲目 · ${t.name}`);
      }
    });

    // 2. Theme Controls (Auto System Time + Day / Dusk / Night) synced with Wall Clock
    const themeBtns = document.querySelectorAll("[data-theme-btn]");
    const THEME_ORDER = ["auto", "day", "dusk", "night"];
    const THEME_LABELS = {
      day: "晨光",
      dusk: "暮色",
      night: "星夜"
    };
    const THEME_TIME_NOTES = {
      day: "09:20 · 晨光洒落原木地板",
      dusk: "17:50 · 落日余晖，暖灯初上",
      night: "22:30 · 星夜静谧，呼噜伴眠"
    };

    let themeMode = "auto"; // "auto" | "day" | "dusk" | "night"

    function detectSystemScene(now = new Date()) {
      const hours = now.getHours();
      const mins = now.getMinutes();
      const totalMin = hours * 60 + mins;
      let theme = "day";
      if (totalMin >= 17 * 60 && totalMin < 19 * 60 + 30) {
        theme = "dusk";
      } else if (totalMin >= 19 * 60 + 30 || totalMin < 6 * 60) {
        theme = "night";
      }
      const hh = String(hours).padStart(2, "0");
      const mm = String(mins).padStart(2, "0");
      return {
        theme,
        hhmm: `${hh}:${mm}`,
        clockMinutes: totalMin + now.getSeconds() / 60
      };
    }

    function applySceneTheme(selection, { silent = false, instant = false } = {}) {
      themeMode = selection;
      const isAuto = selection === "auto";
      const sys = isAuto ? detectSystemScene() : null;
      const resolvedTheme = isAuto ? sys.theme : selection;

      document.documentElement.setAttribute("data-theme", resolvedTheme);
      if (metaTheme) metaTheme.setAttribute("content", THEME_META[resolvedTheme] || "#FAF8F4");
      themeBtns.forEach((b) => b.classList.toggle("active", b.dataset.themeBtn === selection));

      world.setTheme(resolvedTheme, {
        useRealClock: isAuto,
        clockMinutes: isAuto ? sys.clockMinutes : null,
        instant
      });

      if (window.MoeAudio) {
        const idx = resolvedTheme === "day" ? 0 : resolvedTheme === "dusk" ? 1 : 2;
        if (instant || (window.MoeAudio.isPlaying && window.MoeAudio.trackIndex !== idx)) {
          window.MoeAudio.nextTrack(idx);
        }
      }

      if (!silent) {
        if (isAuto) {
          whisper(`跟随系统时间 · ${sys.hhmm} 自动切换至${THEME_LABELS[resolvedTheme]}场景`);
        } else if (THEME_TIME_NOTES[resolvedTheme]) {
          whisper(THEME_TIME_NOTES[resolvedTheme]);
        }
      }
    }

    // Automatically initialize scene & live wall clock from user's device system time!
    const initSys = detectSystemScene();
    applySceneTheme("auto", { silent: true, instant: true });

    // Subtle initial welcome hint that fades away cleanly
    setTimeout(() => {
      whisper(`已按系统时间 ${initSys.hhmm} 进入${THEME_LABELS[initSys.theme]} · 下方8种趣味互动 ✨`);
    }, 600);

    // Keep auto scene synced seamlessly when time crosses into Morning / Dusk / Night
    function syncAutoSceneIfNeeded() {
      if (themeMode !== "auto") return;
      const sys = detectSystemScene();
      if (sys.theme !== world.theme) {
        applySceneTheme("auto");
      }
    }
    setInterval(syncAutoSceneIfNeeded, 30000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) syncAutoSceneIfNeeded();
    });

    themeBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        applySceneTheme(btn.dataset.themeBtn);
      });
    });

    // 3. Minimalist Bottom Mode Dock (7 Modes + Instant Trick Button)
    const dockBtns = document.querySelectorAll(".dock-btn[data-mode]");
    const trickBtn = document.getElementById("trick-btn");

    const MODE_HINTS = {
      roam: "自由漫步 · 点击空地唤猫直走，轻抚或双击小猫触发撒娇动作",
      laser: "红外激光点 · 移动红点引小猫360°急停猛扑，点击诱发腾空扑抓",
      wand: "逗猫羽 · 全屏滑动或高举羽毛，引小猫起跳扑抓",
      fish: "小鱼干 · 点击地面抛投香脆鱼干，小猫会直奔过来大口品尝",
      ball: "小绒球 · 点击地面滚出毛毡球，陪小猫来回扑球接力",
      bubble: "彩虹泡 · 点击或滑动吹出七彩泡泡，小猫会蹦跳戳破，也可点破泡泡",
      catnip: "猫薄荷 · 点击地面撒下猫薄荷叶，小猫闻到后会开心地打滚转圈 🌿"
    };

    dockBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        mode = btn.dataset.mode;
        dockBtns.forEach((b) => {
          const active = b === btn;
          b.classList.toggle("active", active);
          b.setAttribute("aria-pressed", String(active));
        });
        world.setMode(mode);
        document.body.dataset.cursor = mode === "laser" ? "laser" : "action";
        if (MODE_HINTS[mode]) whisper(MODE_HINTS[mode]);
      });
    });

    if (trickBtn) {
      trickBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const res = cat.performNextTrick();
        const s = cat.getScale();
        world.spawnSparkles(cat.x, cat.y - 52 * s, 8);
        if (res && res.msg) whisper(res.msg);
      });
    }

    // Brand click calls kitty politely to center
    document.getElementById("brand-mark").addEventListener("click", (e) => {
      e.preventDefault();
      cat.callTo(window.innerWidth * 0.5, window.innerHeight * 0.62);
      if (window.MoeAudio) window.MoeAudio.playMew("happy");
    });

    // 4. Unified Fullscreen Pointer & Touch Interaction
    let isPressing = false;
    let rubAccum = 0;
    let lastHeartAt = 0;
    let lastCatTapAt = 0;
    let lastBubbleDragAt = 0;

    function isHudTarget(target) {
      return Boolean(target.closest(".hud-top, .hud-bottom"));
    }

    window.addEventListener("pointerdown", (e) => {
      if (isHudTarget(e.target)) return;

      isPressing = true;
      rubAccum = 0;
      world.updatePointer(e.clientX, e.clientY);

      // Interactive living-room furniture & home props (works naturally in roam mode)
      if (mode === "roam") {
        // Pop any floating leftover bubble when tapped
        if (world.tryPopBubbleAt(e.clientX, e.clientY)) return;

        const propHit = world.interactRoomProp(e.clientX, e.clientY);
        if (propHit) {
          if (propHit === "clock") {
            const nextIdx = (THEME_ORDER.indexOf(themeMode) + 1) % THEME_ORDER.length;
            applySceneTheme(THEME_ORDER[nextIdx]);
          }
          if (propHit === "lamp_on") whisper("啪嗒 · 点亮了温暖的客厅落地灯");
          if (propHit === "lamp_off") whisper("啪嗒 · 关上了落地灯");
          if (propHit === "bowls") whisper("添上香脆小鱼粮，唤小猫过来开饭啦");
          if (propHit === "bed") whisper("拍了拍软乎乎的小猫窝，过来歇会儿吧");
          if (propHit === "pompom") whisper("拨动了猫爬架上的小绒球 ♪");
          if (propHit === "sill") whisper("窗台上的热茶与小猫草正伴着微风轻晃");
          return;
        }
      }

      if (mode === "laser") {
        const dist = Math.hypot(e.clientX - cat.x, e.clientY - cat.y);
        if (dist > 45 && dist < 240 && cat.z <= 1) {
          cat.startJumpToward(e.clientX, e.clientY, 72);
        } else {
          cat.chaseLaser(e.clientX, e.clientY);
        }
        return;
      }

      if (mode === "bubble") {
        if (world.tryPopBubbleAt(e.clientX, e.clientY)) return;
        world.spawnBubble(e.clientX, e.clientY, 2);
        lastBubbleDragAt = performance.now();
        if (window.MoeAudio) window.MoeAudio.playBoing(1.38);
        return;
      }

      if (mode === "catnip") {
        world.sprinkleCatnip(e.clientX, e.clientY);
        if (window.MoeAudio) window.MoeAudio.playBoing(1.25);
        whisper("撒下了清香猫薄荷 🌿 小猫闻着味儿跑来啦~");
        return;
      }

      if (mode === "fish") {
        world.tossFish(e.clientX, e.clientY);
        if (window.MoeAudio) window.MoeAudio.playBoing(1.2);
        return;
      }

      if (mode === "ball") {
        const bounds = cat.getFloorBounds();
        const centerX = (bounds.minX + bounds.maxX) * 0.5;
        const centerY = (bounds.minY + bounds.maxY) * 0.5;
        let dx = cat.x - e.clientX;
        let dy = cat.y - e.clientY;
        let d = Math.hypot(dx, dy);
        // If clicked very close to kitty or near an edge behind kitty, roll toward open center!
        if (d < 70) {
          dx = centerX - e.clientX;
          dy = centerY - e.clientY;
          d = Math.hypot(dx, dy) || 1;
        }
        world.spawnBall(e.clientX, e.clientY, (dx / d) * 260, (dy / d) * 150);
        return;
      }

      if (mode === "wand") {
        if (window.MoeAudio) window.MoeAudio.playBell();
        return;
      }

      // In roam mode, tapping an existing resting ball nudges it back into play!
      if (world.ball && Math.hypot(e.clientX - world.ball.x, e.clientY - world.ball.y) < 34) {
        const bounds = cat.getFloorBounds();
        const centerX = (bounds.minX + bounds.maxX) * 0.5;
        const centerY = (bounds.minY + bounds.maxY) * 0.5;
        const dx = centerX - world.ball.x + (Math.random() - 0.5) * 160;
        const dy = centerY - world.ball.y + (Math.random() - 0.5) * 120;
        const d = Math.hypot(dx, dy) || 1;
        world.ball.vx = (dx / d) * 270;
        world.ball.vy = (dy / d) * 170;
        world.ball.vz = 110;
        world.ball.restCooldown = 0;
        world.ball.rallyRemaining = 3;
        if (window.MoeAudio) window.MoeAudio.playBoing(1.08);
        return;
      }

      // Default "roam" mode: pet kitty if tapped on kitty (double-tap triggers playful roll/jump!),
      // otherwise call kitty to walk straight to the tapped spot!
      const hit = cat.hitTest(e.clientX, e.clientY);
      if (hit) {
        const now = performance.now();
        const isDoubleTap = now - lastCatTapAt < 380;
        lastCatTapAt = now;

        if (isDoubleTap) {
          if (cat.state === "roll") {
            cat.startJumpToward(cat.x + (Math.random() - 0.5) * 140, cat.y + (Math.random() - 0.5) * 70, 76);
            whisper("小猫欢快地蹦了起来 ✨");
          } else {
            cat.startRoll(3.6);
            world.spawnHeart(e.clientX, e.clientY - 26, 3);
            whisper("翻肚皮撒娇打滚啦~ 揉揉软乎乎的白肚皮 💗");
          }
          return;
        }

        if (hit === "nose") {
          cat.pet(e.clientX, e.clientY);
          cat.mewMouthTimer = 0.45;
          world.spawnHeart(e.clientX, e.clientY - 18, 2);
          if (window.MoeAudio) window.MoeAudio.playMew("tiny");
          document.body.dataset.cursor = "petting";
        } else {
          cat.pet(e.clientX, e.clientY);
          world.spawnHeart(e.clientX, e.clientY - 20, 1);
          if (window.MoeAudio) {
            window.MoeAudio.pokePurr();
            if (Math.random() < 0.4) window.MoeAudio.playMew("sweet");
          }
          document.body.dataset.cursor = "petting";
        }
      } else {
        // Call kitty over to this spot on the widescreen floor!
        world.spawnRipple(e.clientX, e.clientY);
        cat.callTo(e.clientX, e.clientY);
        if (window.MoeAudio && Math.random() < 0.55) {
          window.MoeAudio.playMew("curious");
        }
      }
    });

    window.addEventListener("pointermove", (e) => {
      const prevX = world.pointer.x;
      const prevY = world.pointer.y;
      world.updatePointer(e.clientX, e.clientY);

      if (mode === "bubble" && isPressing) {
        const now = performance.now();
        if (now - lastBubbleDragAt > 135) {
          lastBubbleDragAt = now;
          world.spawnBubble(e.clientX, e.clientY, 1);
        }
        document.body.dataset.cursor = "action";
        return;
      }

      if (mode === "laser") {
        document.body.dataset.cursor = "laser";
        return;
      }

      if (mode === "roam") {
        const hit = cat.hitTest(e.clientX, e.clientY);
        if (isPressing && hit) {
          document.body.dataset.cursor = "petting";
          cat.pet(e.clientX, e.clientY);
          if (window.MoeAudio) window.MoeAudio.pokePurr();

          rubAccum += Math.hypot(e.clientX - prevX, e.clientY - prevY);
          const now = performance.now();
          if (rubAccum > 48 && now - lastHeartAt > 240) {
            rubAccum = 0;
            lastHeartAt = now;
            world.spawnHeart(e.clientX, e.clientY - 22, cat.state === "roll" ? 2 : 1);
          }
        } else {
          document.body.dataset.cursor = hit ? "pet" : (world.hoverRoomProp(e.clientX, e.clientY) ? "action" : "action");
        }
      } else {
        document.body.dataset.cursor = "action";
      }
    }, { passive: true });

    const releasePointer = () => {
      isPressing = false;
      if (document.body.dataset.cursor === "petting") {
        document.body.dataset.cursor = "pet";
      }
    };
    window.addEventListener("pointerup", releasePointer, { passive: true });
    window.addEventListener("pointercancel", releasePointer, { passive: true });

    window.addEventListener("resize", () => {
      world.resize();
    });

    // 5. 60fps Main Animation Loop
    let lastNow = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      world.update(dt);
      world.render();

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
})();

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

    // Shared Moments & Vitals Drawer Elements
    const momentsToggle = document.getElementById("moments-toggle");
    const momentsDrawer = document.getElementById("moments-drawer");
    const momentsClose = document.getElementById("moments-close");
    const onlineDot = document.getElementById("online-dot");
    const momentsStatusBadge = document.getElementById("moments-status-badge");
    const syncModeBadge = document.getElementById("sync-mode-badge");
    const visitorIdentityLine = document.getElementById("visitor-identity-line");
    const statFullnessBar = document.getElementById("stat-fullness-bar");
    const statFullnessVal = document.getElementById("stat-fullness-val");
    const statHydrationBar = document.getElementById("stat-hydration-bar");
    const statHydrationVal = document.getElementById("stat-hydration-val");
    const statHappinessBar = document.getElementById("stat-happiness-bar");
    const statHappinessVal = document.getElementById("stat-happiness-val");
    const vitalsTip = document.getElementById("vitals-tip");
    const momentsList = document.getElementById("moments-list");
    const shareSnapshotBtn = document.getElementById("share-snapshot-btn");

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

      // Single source of truth: open kitty's mouth if & ONLY if audio vocalization actually plays!
      window.MoeAudio.onCatVocalize = (dur) => {
        cat.openMewMouth(dur);
      };
    }

    const autoUnlockAudio = () => {
      if (window.MoeAudio && (!window.MoeAudio.unlocked || (window.MoeAudio.ctx && window.MoeAudio.ctx.state === "suspended"))) {
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

    // 3. Minimalist Bottom Mode Dock (7 Modes + Instant Kibble Feed & Trick Buttons)
    const dockBtns = document.querySelectorAll(".dock-btn[data-mode]");
    const feedKibbleBtn = document.getElementById("feed-kibble-btn");
    const feedFishMeatBtn = document.getElementById("feed-fish-meat-btn");
    const pourWaterBtn = document.getElementById("pour-water-btn");
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

    // 3B. Multi-Visitor Shared State, Fullness Check & Moments Drawer Wiring
    const social = window.MoeSocial || null;

    function renderMomentsUI(snapshot) {
      if (!snapshot || !snapshot.state) return;
      const { mode, storageMode, you, onlineCount, state } = snapshot;

      if (onlineDot) onlineDot.classList.toggle("is-full", Boolean(state.isFull));
      if (momentsStatusBadge) {
        momentsStatusBadge.classList.toggle("is-full", Boolean(state.isFull));
        momentsStatusBadge.textContent = state.isFull ? "已吃饱" : `${state.fullness}%`;
      }
      if (syncModeBadge) {
        const modeLabel = mode === "cloud"
          ? (storageMode === "kv" ? "云端KV实时" : "云端跨域同步")
          : "纯静态共享";
        syncModeBadge.textContent = mode === "cloud"
          ? `${modeLabel} · ${onlineCount}人在线`
          : `${modeLabel} · ${onlineCount}窗`;
      }
      if (visitorIdentityLine && you) {
        visitorIdentityLine.textContent = `你的身份：${you.label}`;
      }

      if (statFullnessBar) {
        statFullnessBar.style.width = `${state.fullness}%`;
        statFullnessBar.classList.toggle("is-full", Boolean(state.isFull));
      }
      if (statFullnessVal) statFullnessVal.textContent = `${state.fullness}%`;
      if (statHydrationBar) statHydrationBar.style.width = `${state.hydration}%`;
      if (statHydrationVal) statHydrationVal.textContent = `${state.hydration}%`;
      if (statHappinessBar) statHappinessBar.style.width = `${state.happiness}%`;
      if (statHappinessVal) statHappinessVal.textContent = `${state.happiness}%`;

      if (vitalsTip) {
        if (state.isFull && state.lastFedBy) {
          vitalsTip.textContent = `喵喵刚被【${state.lastFedBy.label}】喂得圆滚滚的，现在喂它会摇头打饱嗝哦~ 陪它玩激光/逗猫羽可加速消化！`;
        } else {
          vitalsTip.textContent = "饱腹 ≥ 88% 时会捂肚拒食；陪它玩激光/逗猫羽/毛毡球可加速消化~";
        }
      }

      if (momentsList) {
        const items = state.moments || [];
        if (items.length === 0) {
          momentsList.innerHTML = `<li class="moment-empty">还没有互动足迹，快去喂猫粮或摸摸它吧~</li>`;
        } else {
          momentsList.innerHTML = "";
          for (const m of items) {
            const li = document.createElement("li");
            li.className = `moment-item${m.refused ? " refused" : ""}`;

            const iconSpan = document.createElement("span");
            iconSpan.className = "moment-icon";
            iconSpan.textContent = m.icon || "🐾";

            const bodyDiv = document.createElement("div");
            bodyDiv.className = "moment-body";

            const headDiv = document.createElement("div");
            headDiv.className = "moment-head";

            const whoSpan = document.createElement("span");
            whoSpan.className = "moment-who";
            const isSelf = you && m.visitorId === you.visitorId;
            whoSpan.textContent = isSelf ? `${m.label}（你）` : (m.label || "匿名访客");

            const timeSpan = document.createElement("span");
            timeSpan.className = "moment-time";
            timeSpan.textContent = social ? social.formatRelativeTime(m.at) : "刚刚";

            const textDiv = document.createElement("div");
            textDiv.className = "moment-text";
            textDiv.textContent = m.text || "";

            headDiv.appendChild(whoSpan);
            headDiv.appendChild(timeSpan);
            bodyDiv.appendChild(headDiv);
            bodyDiv.appendChild(textDiv);
            li.appendChild(iconSpan);
            li.appendChild(bodyDiv);
            momentsList.appendChild(li);
          }
        }
      }

      world.syncSharedLevels(state);
    }

    function setMomentsDrawerOpen(open) {
      if (!momentsDrawer || !momentsToggle) return;
      momentsDrawer.hidden = !open;
      momentsToggle.setAttribute("aria-expanded", String(open));
      if (open && social) {
        renderMomentsUI(social.getSnapshot());
      }
    }

    if (momentsToggle) {
      momentsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setMomentsDrawerOpen(Boolean(momentsDrawer && momentsDrawer.hidden));
      });
    }
    if (momentsClose) {
      momentsClose.addEventListener("click", (e) => {
        e.stopPropagation();
        setMomentsDrawerOpen(false);
      });
    }
    if (shareSnapshotBtn && social) {
      shareSnapshotBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = social.buildShareSnapshotUrl();
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(() => {
            whisper("已复制共享现场链接！发给好友打开可接力触发吃饱拒食与足迹 🔗");
          }).catch(() => {
            whisper("已生成共享链接，可直接复制浏览器地址栏分享给好友 🔗");
            if (typeof history !== "undefined" && history.replaceState) {
              history.replaceState(null, "", url.slice(url.indexOf("#")));
            }
          });
        } else {
          if (typeof history !== "undefined" && history.replaceState && url.includes("#")) {
            history.replaceState(null, "", url.slice(url.indexOf("#")));
          }
          whisper("已将当前饱腹与足迹写入地址栏，复制网址即可发给好友接力 🔗");
        }
      });
    }

    if (social) {
      social.onStateUpdate = (snap) => renderMomentsUI(snap);
      social.onImportedShare = (info) => {
        if (info && info.isFull && info.lastFedBy) {
          setTimeout(() => {
            cat.refuseFoodFull("full");
            whisper(`🐾 好友分享的喵喵刚被【${info.lastFedBy.label}】喂得圆滚滚啦，现在喂它会打饱嗝哦~`);
          }, 900);
        } else {
          setTimeout(() => {
            whisper("🐾 已载入好友分享的喵喵互动现场，继续一起照顾它吧！");
          }, 900);
        }
      };
      social.onRemoteMoment = (moment, state) => {
        if (momentsToggle) {
          momentsToggle.classList.remove("pulse");
          void momentsToggle.offsetWidth;
          momentsToggle.classList.add("pulse");
        }
        world.replayRemoteMoment(moment);
        whisper(`🐾 ${moment.label} ${moment.text}`);
        if (state) world.syncSharedLevels(state);
      };
      social.init();
    }

    // Sync real-time hydration & bowl levels when kitty finishes eating or autonomously sips water!
    world.onWorldEvent = (ev, payload = {}) => {
      if (!social) return;
      if (ev === "auto_drink_lap") {
        social.applyAutoDrinkSip(5, payload.bowlWaterLevel);
      } else if (ev === "auto_drink_done") {
        social.finalizeAutoDrink(payload.bowlWaterLevel, payload.laps || 0);
        whisper("吃完猫粮乖乖去水碗补了口清水，水分值回升啦 💧");
      } else if (ev === "bowl_done") {
        social.syncBowlLevels({ bowlFoodLevel: payload.bowlFoodLevel });
      } else if (ev === "water_done") {
        social.syncBowlLevels({ bowlWaterLevel: payload.bowlWaterLevel });
      } else if (ev === "fish_plate_done") {
        social.syncBowlLevels({ plateMeatLevel: payload.plateMeatLevel });
      }
    };

    /**
     * Checks shared fullness / hydration before feeding or pouring water.
     * If another visitor (or yourself) just fed kitty full, kitty pats its round belly & refuses!
     */
    function handleFeedOrDrink(action, onAccepted) {
      if (!social) {
        onAccepted();
        return true;
      }
      const res = social.recordInteraction(action);
      if (res.refused) {
        cat.refuseFoodFull(res.reason === "hydrated" ? "hydrated" : "full");
        const s = cat.getScale();
        world.spawnSparkles(cat.x, cat.y - 78 * s, 6, ["#F7B5C4", "#FFE28A", "#B6DDF2"]);

        if (res.reason === "hydrated") {
          if (res.lastDrankBy && !res.isSameVisitor) {
            whisper(`喵喵刚喝完【${res.lastDrankBy.label}】倒的清水，摇摇头表示现在不渴啦 💧`);
          } else {
            whisper("刚才已经喝得水饱啦，喵喵晃晃脑袋表示不渴咯 💧");
          }
        } else {
          if (res.lastFedBy && !res.isSameVisitor) {
            whisper(`喵喵刚被【${res.lastFedBy.label}】喂得圆滚滚的啦，捂着肚皮打了个饱嗝~（玩耍消食或约${res.minutesUntilHungry}分钟后再喂）`);
          } else {
            whisper("已经吃得圆滚滚啦，喵喵捂着肚皮摆摆爪拒食咯~ 陪它玩会儿激光点帮它消化吧 🫧");
          }
        }
        return false;
      }
      onAccepted(res);
      return true;
    }

    if (feedKibbleBtn) {
      feedKibbleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleFeedOrDrink("feed_kibble", (res) => {
          world.pourKibbleIntoBowl();
          const tail = res && res.justGotFull ? "（吃完这碗就要圆滚滚吃饱啦~）" : "";
          whisper(`沙沙沙~ 往猫碗倒满香脆猫粮，小猫听见声音跑去干饭啦 🥣${tail}`);
        });
      });
    }

    if (feedFishMeatBtn) {
      feedFishMeatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleFeedOrDrink("feed_fish_meat", (res) => {
          world.serveFishMeatOnPlate();
          const tail = res && res.justGotFull ? "（吃完这盘三文鱼就要撑住啦~）" : "";
          whisper(`香喷喷的三文鱼肉端上左边鱼肉盘啦，小猫闻香飞奔过去大快朵颐 🍣${tail}`);
        });
      });
    }

    if (pourWaterBtn) {
      pourWaterBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleFeedOrDrink("pour_water", () => {
          world.pourWaterIntoBowl();
          whisper("哗啦啦~ 给水碗倒满清甜泉水，小猫跑去吧嗒吧嗒喝水啦 💧");
        });
      });
    }

    if (trickBtn) {
      trickBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const res = cat.performNextTrick();
        const s = cat.getScale();
        world.spawnSparkles(cat.x, cat.y - 52 * s, 8);
        if (social) social.recordInteraction("trick", res && res.msg ? `逗喵喵表演：${res.msg}` : "");
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
      return Boolean(target && target.closest && target.closest(".hud-top, .hud-bottom, .moments-drawer"));
    }

    window.addEventListener("pointerdown", (e) => {
      if (isHudTarget(e.target)) return;
      if (momentsDrawer && !momentsDrawer.hidden) {
        setMomentsDrawerOpen(false);
      }

      isPressing = true;
      rubAccum = 0;
      world.updatePointer(e.clientX, e.clientY);

      // Interactive living-room furniture & home props (works naturally in roam mode)
      if (mode === "roam") {
        // Pop any floating leftover bubble when tapped
        if (world.tryPopBubbleAt(e.clientX, e.clientY)) return;

        // Check feeding props FIRST through shared fullness/hydration validation!
        const L = world.getRoomLayout();
        if (Math.hypot(e.clientX - L.bowls.x, e.clientY - L.bowls.y) < 42) {
          if (e.clientX > L.bowls.x) {
            handleFeedOrDrink("pour_water", () => {
              world.pourWaterIntoBowl();
              whisper("哗啦啦~ 给水碗添满甘甜清水，小猫跑去吧嗒喝水防噎着啦 💧");
            });
          } else {
            handleFeedOrDrink("feed_kibble", () => {
              world.pourKibbleIntoBowl();
              whisper("沙沙沙~ 往猫碗添满香脆猫粮，小猫马上跑来埋头干饭啦 🥣");
            });
          }
          return;
        }
        if (Math.hypot(e.clientX - L.bed.x, (e.clientY - L.bed.y) * 1.6) < L.bed.rx + 10) {
          handleFeedOrDrink("feed_fish_meat", () => {
            world.serveFishMeatOnPlate();
            whisper("往左边鱼肉盘放上鲜嫩三文鱼肉，小猫高兴得飞奔过来开吃啦 🍣");
          });
          return;
        }

        const propHit = world.interactRoomProp(e.clientX, e.clientY);
        if (propHit) {
          if (propHit === "clock") {
            const nextIdx = (THEME_ORDER.indexOf(themeMode) + 1) % THEME_ORDER.length;
            applySceneTheme(THEME_ORDER[nextIdx]);
          }
          if (propHit === "fairy_on") whisper("叮铃 · 点亮了窗前的暖光星星串灯 ✨");
          if (propHit === "fairy_off") whisper("啪嗒 · 关上了窗前小串灯");
          if (propHit === "lamp_on") whisper("啪嗒 · 点亮了温暖的客厅落地灯");
          if (propHit === "lamp_off") whisper("啪嗒 · 关上了落地灯");
          if (propHit === "vinyl") {
            if (window.MoeAudio) {
              if (!window.MoeAudio.isPlaying) {
                window.MoeAudio.userPaused = false;
                window.MoeAudio.unlockAndPlay();
                whisper(`放下黑胶唱针 · 正在播放 ${window.MoeAudio.getCurrentTrack().name}`);
              } else {
                const t = window.MoeAudio.nextTrack();
                whisper(`轻换一张黑胶唱片 · ${t.name}`);
              }
            }
          }
          if (propHit === "sofa") {
            whisper("拍了拍软乎乎的奶油小沙发，小猫晃着尾巴走来啦");
            if (social) social.recordInteraction("prop", "拍了拍奶油沙发邀喵喵来旁边歇息");
          }
          if (propHit === "basket_ball") {
            whisper("从编织玩具篮里滚出了一颗小绒球 🧶");
            if (social) social.recordInteraction("ball");
          }
          if (propHit === "basket_fish") {
            whisper("从玩具篮里摸出一条藏着的香脆小鱼干 🐟");
            if (social) social.recordInteraction("feed_fish_snack");
          }
          if (propHit === "pompom") {
            whisper("拨动了猫爬架上的小绒球 ♪");
            if (social) social.recordInteraction("prop", "拨动了猫爬架上的粉色小绒球");
          }
          if (propHit === "sill") whisper("窗台上的热茶、多肉与小猫草正伴着微风轻晃");
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
        if (social) social.recordInteraction("laser");
        return;
      }

      if (mode === "bubble") {
        if (world.tryPopBubbleAt(e.clientX, e.clientY)) return;
        world.spawnBubble(e.clientX, e.clientY, 2);
        lastBubbleDragAt = performance.now();
        if (window.MoeAudio) window.MoeAudio.playBoing(1.38);
        if (social) social.recordInteraction("bubble");
        return;
      }

      if (mode === "catnip") {
        world.sprinkleCatnip(e.clientX, e.clientY);
        if (window.MoeAudio) window.MoeAudio.playBoing(1.25);
        if (social) social.recordInteraction("catnip");
        whisper("撒下了清香猫薄荷 🌿 小猫闻着味儿跑来啦~");
        return;
      }

      if (mode === "fish") {
        handleFeedOrDrink("feed_fish_snack", () => {
          world.tossFish(e.clientX, e.clientY);
          if (window.MoeAudio) window.MoeAudio.playBoing(1.2);
        });
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
        if (social) social.recordInteraction("ball");
        return;
      }

      if (mode === "wand") {
        if (window.MoeAudio) window.MoeAudio.playBell();
        if (social) social.recordInteraction("wand");
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
            if (social) social.recordInteraction("roll");
            whisper("翻肚皮撒娇打滚啦~ 揉揉软乎乎的白肚皮 💗");
          }
          return;
        }

        if (hit === "nose") {
          cat.pet(e.clientX, e.clientY);
          world.spawnHeart(e.clientX, e.clientY - 18, 2);
          if (window.MoeAudio) window.MoeAudio.playMew("tiny");
          if (social) social.recordInteraction("pet", "轻轻点了一下喵喵的小黑鼻子，喵了一声");
          document.body.dataset.cursor = "petting";
        } else {
          cat.pet(e.clientX, e.clientY);
          world.spawnHeart(e.clientX, e.clientY - 20, 1);
          if (window.MoeAudio) {
            window.MoeAudio.pokePurr();
            if (Math.random() < 0.4) window.MoeAudio.playMew("sweet");
          }
          if (social) social.recordInteraction("pet");
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

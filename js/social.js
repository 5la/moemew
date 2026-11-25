/**
 * MoeMew GitHub Pages Static & Optional Cloud Sync Engine (js/social.js)
 *
 * Designed specifically for GitHub Pages pure-static hosting:
 * 1. Pure Static Mode (default when MOEMEW_CONFIG.syncEndpoint is empty):
 *    - Zero 404 console errors (does not probe missing /api routes)
 *    - Automatically resolves visitor's real public IP via CORS-safe ipify -> masked a.b.*.* + deterministic cute nickname
 *    - Real-time multi-tab sync via BroadcastChannel + localStorage
 *    - Cross-device pure-static sharing via compact URL hash (#m=...) so sending a link to a friend
 *      preserves kitty's exact fullness, feeder identity & recent moments without any server/database!
 * 2. Optional Cross-Origin Sync Mode (when MOEMEW_CONFIG.syncEndpoint is set to a Cloudflare Worker URL):
 *    - Automatically syncs live across ALL visitors worldwide via CORS GET /state & POST /interact!
 */
(function () {
  "use strict";

  const STORAGE_KEY = "moemew:shared_state:v1";
  const SESSION_ID_KEY = "moemew:session_visitor:v1";
  const CHANNEL_NAME = "moemew_shared_cat_v1";
  const MAX_MOMENTS = 40;

  const FULL_REFUSE_THRESHOLD = 88;
  const WATER_REFUSE_THRESHOLD = 92;
  const FULLNESS_DIGEST_PER_MIN = 4.5;
  const HYDRATION_DECAY_PER_MIN = 3.2;
  const HAPPINESS_DECAY_PER_MIN = 1.2;

  const CUTE_NICKNAMES = [
    "橘子汽水", "奶盖波波", "草莓布丁", "芝士团子",
    "蜜桃乌龙", "焦糖麻薯", "海盐奶昔", "抹茶大福",
    "香草可丽饼", "芋泥波波", "红豆铜锣烧", "棉花糖云",
    "柚子苏打", "蜂蜜华夫", "蓝莓蛋挞", "白桃慕斯",
    "黑糖珍珠", "奶油泡芙", "焦糖布蕾", "柠檬雪芭",
    "杨枝甘露", "桂花米露", "可可曲奇", "杏仁豆腐"
  ];

  const ACTION_META = {
    feed_kibble:     { kind: "food",  full: 32, water: -8, happy: 8,  icon: "🥣", text: "往猫碗倒满香脆猫粮，喵喵埋头咔嚓干饭" },
    feed_fish_meat:  { kind: "food",  full: 42, water: 4,  happy: 15, icon: "🍣", text: "在左边鱼肉盘端上鲜嫩三文鱼，喵喵香迷糊啦" },
    feed_fish_snack: { kind: "food",  full: 22, water: -3, happy: 9,  icon: "🐟", text: "抛投了一条香脆小鱼干，喵喵飞奔叼走" },
    pour_water:      { kind: "water", full: 0,  water: 38, happy: 6,  icon: "💧", text: "给水碗添满清甜泉水，喵喵伸出小粉舌吧嗒喝水" },
    auto_sip:        { kind: "auto_water", full: 0, water: 20, happy: 3, icon: "💧", text: "吃完猫粮乖乖去水碗补了口清水，水分值回升啦" },
    pet:             { kind: "play",  full: -1, water: 0,  happy: 10, icon: "💗", text: "轻轻顺毛撸了撸喵喵，收获一阵呼噜噜" },
    roll:            { kind: "play",  full: -3, water: -1, happy: 12, icon: "🐾", text: "把喵喵逗得翻出软白肚皮左右打滚卖萌" },
    catnip:          { kind: "play",  full: -4, water: -2, happy: 16, icon: "🌿", text: "撒下清香猫薄荷，喵喵闻香开心转圈打滚" },
    bubble:          { kind: "play",  full: -6, water: -2, happy: 10, icon: "🫧", text: "吹起一串彩虹泡泡，陪喵喵蹦跳戳破" },
    laser:           { kind: "play",  full: -7, water: -3, happy: 9,  icon: "🔴", text: "用红激光点陪喵喵满屋360°急停扑抓消食" },
    wand:            { kind: "play",  full: -6, water: -2, happy: 10, icon: "🪶", text: "高举逗猫羽引得喵喵轻盈腾空扑抓" },
    ball:            { kind: "play",  full: -6, water: -2, happy: 9,  icon: "🧶", text: "和喵喵在客厅玩起了毛毡球接力赛" },
    trick:           { kind: "play",  full: -5, water: -1, happy: 8,  icon: "✨", text: "逗喵喵表演了拿手绝活" },
    prop:            { kind: "play",  full: 0,  water: 0,  happy: 4,  icon: "🏡", text: "轻点了客厅里的温馨小摆件" }
  };

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function maskIpAddress(rawIp) {
    const ip = String(rawIp || "").trim().replace(/^::ffff:/, "");
    if (!ip || ip === "::1" || ip === "127.0.0.1") return "127.0.*.*";
    if (ip.includes(".")) {
      const parts = ip.split(".");
      if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
    }
    if (ip.includes(":")) {
      const parts = ip.split(":").filter(Boolean);
      if (parts.length >= 2) return `${parts[0]}:${parts[1]}:*:*`;
    }
    return "127.0.*.*";
  }

  function buildIdentityFromIp(rawIp, idPrefix = "ip") {
    const maskedIp = maskIpAddress(rawIp);
    const h = hashString(`moemew-v1:${rawIp}`);
    const nickname = CUTE_NICKNAMES[h % CUTE_NICKNAMES.length];
    return {
      visitorId: `${idPrefix}_${h.toString(36)}`,
      maskedIp,
      nickname,
      label: `访客 ${maskedIp} · ${nickname}`,
      ipVerified: idPrefix === "ip"
    };
  }

  function safeStorageGet(store, key) {
    try { return store.getItem(key); } catch (_) { return null; }
  }

  function safeStorageSet(store, key, val) {
    try { store.setItem(key, val); } catch (_) {}
  }

  // UTF-8 safe Base64URL helpers for pure-static URL snapshot sharing (#m=...)
  function encodeBase64Url(str) {
    try {
      const bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
      return btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } catch (_) {
      return "";
    }
  }

  function decodeBase64Url(b64) {
    try {
      const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
      const pad = norm.length % 4 === 0 ? "" : "=".repeat(4 - (norm.length % 4));
      const bin = atob(norm + pad);
      const pct = Array.from(bin, (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
      return decodeURIComponent(pct);
    } catch (_) {
      return null;
    }
  }

  function createDefaultLocalState(now = Date.now()) {
    return {
      version: 1,
      fullness: 30,
      hydration: 42,
      happiness: 68,
      bowlFoodLevel: 0.25,
      bowlWaterLevel: 0.35,
      plateMeatLevel: 0.0,
      lastFedBy: null,
      lastDrankBy: null,
      totalInteractions: 0,
      visitors: {},
      moments: [],
      updatedAt: now
    };
  }

  function decayState(state, now = Date.now()) {
    const s = { ...createDefaultLocalState(now), ...state };
    const elapsedMin = Math.max(0, now - (s.updatedAt || now)) / 60000;
    if (elapsedMin > 0.001) {
      s.fullness = clamp(s.fullness - elapsedMin * FULLNESS_DIGEST_PER_MIN, 0, 100);
      s.hydration = clamp(s.hydration - elapsedMin * HYDRATION_DECAY_PER_MIN, 0, 100);
      const targetHappy = 58;
      const step = elapsedMin * HAPPINESS_DECAY_PER_MIN;
      if (s.happiness > targetHappy) s.happiness = Math.max(targetHappy, s.happiness - step);
      else if (s.happiness < targetHappy) s.happiness = Math.min(targetHappy, s.happiness + step * 0.5);
    }
    const cleanVisitors = {};
    const rawV = s.visitors && typeof s.visitors === "object" ? s.visitors : {};
    for (const [vid, info] of Object.entries(rawV)) {
      if (info && now - info.lastSeen <= 90000) cleanVisitors[vid] = info;
    }
    s.visitors = cleanVisitors;
    s.moments = Array.isArray(s.moments) ? s.moments.slice(0, MAX_MOMENTS) : [];
    s.updatedAt = now;
    return s;
  }

  function getOrCreateInitialVisitor() {
    const existing = typeof sessionStorage !== "undefined" ? safeStorageGet(sessionStorage, SESSION_ID_KEY) : null;
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        if (parsed && parsed.visitorId && parsed.label) return parsed;
      } catch (_) {}
    }
    const seed = `${Date.now()}_${Math.random()}`;
    const h = hashString(seed);
    const ipA = 10 + (h % 180);
    const ipB = 12 + ((h >>> 8) % 210);
    const identity = buildIdentityFromIp(`${ipA}.${ipB}.0.1`, "local");
    if (typeof sessionStorage !== "undefined") {
      safeStorageSet(sessionStorage, SESSION_ID_KEY, JSON.stringify(identity));
    }
    return identity;
  }

  class MoeSocialEngine {
    constructor() {
      const cfg = (typeof window !== "undefined" && window.MOEMEW_CONFIG) || {};
      this.syncEndpoint = typeof cfg.syncEndpoint === "string" ? cfg.syncEndpoint.trim().replace(/\/+$/, "") : "";
      this.mode = "static"; // "cloud" | "static"
      this.storageMode = "github-pages-static";
      this.you = getOrCreateInitialVisitor();
      this.onlineCount = 1;
      this.state = this.formatPublicState(createDefaultLocalState());
      this.seenMomentIds = new Set();
      this.playCooldowns = new Map();
      this.channel = null;
      this.pollTimer = null;
      this.digestTimer = null;

      this.onStateUpdate = null;
      this.onRemoteMoment = null;
      this.onImportedShare = null;
    }

    formatPublicState(raw) {
      return {
        fullness: Math.round(raw.fullness),
        hydration: Math.round(raw.hydration),
        happiness: Math.round(raw.happiness),
        isFull: raw.fullness >= FULL_REFUSE_THRESHOLD,
        isHydrated: raw.hydration >= WATER_REFUSE_THRESHOLD,
        bowlFoodLevel: raw.bowlFoodLevel ?? 0.25,
        bowlWaterLevel: raw.bowlWaterLevel ?? 0.35,
        plateMeatLevel: raw.plateMeatLevel ?? 0.0,
        lastFedBy: raw.lastFedBy || null,
        lastDrankBy: raw.lastDrankBy || null,
        totalInteractions: raw.totalInteractions || 0,
        moments: Array.isArray(raw.moments) ? raw.moments : [],
        updatedAt: raw.updatedAt || Date.now()
      };
    }

    async init() {
      // 1. Optional Cross-Origin Cloud Sync Mode (only when user explicitly configures syncEndpoint in js/config.js)
      if (this.syncEndpoint && typeof fetch === "function") {
        try {
          const res = await fetch(`${this.syncEndpoint}/state`, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            if (data && data.ok && data.state) {
              this.mode = "cloud";
              this.storageMode = data.storageMode || "cloud";
              this.you = data.you || this.you;
              this.onlineCount = data.onlineCount || 1;
              this.applyIncomingState(data.state, true);
              this.startCloudPolling();
              return;
            }
          }
        } catch (_) {
          // Fall through seamlessly to pure static mode
        }
      }

      // 2. Pure GitHub Pages Static Mode (Zero 404s, Zero Server Required!)
      this.mode = "static";
      this.storageMode = "github-pages-static";

      // Check if opened via a friend's shared snapshot URL (#m=...)
      const imported = this.importHashSnapshot();
      this.syncLocalState(true);
      this.setupLocalMultiTabSync();

      if (imported && typeof this.onImportedShare === "function") {
        this.onImportedShare(imported, this.state);
      }

      // Quietly resolve visitor's real public IP (masked to a.b.*.*) when online over HTTP(S)
      this.detectRealPublicIp();
    }

    async detectRealPublicIp() {
      if (this.you && this.you.ipVerified) return;
      if (typeof fetch !== "function" || typeof location === "undefined") return;
      if (location.protocol !== "http:" && location.protocol !== "https:") return;

      try {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 2800) : null;
        const res = await fetch("https://api.ipify.org?format=json", {
          cache: "no-store",
          signal: ctrl ? ctrl.signal : undefined
        });
        if (timer) clearTimeout(timer);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.ip) {
          this.you = buildIdentityFromIp(data.ip, "ip");
          if (typeof sessionStorage !== "undefined") {
            safeStorageSet(sessionStorage, SESSION_ID_KEY, JSON.stringify(this.you));
          }
          this.syncLocalState(false);
        }
      } catch (_) {
        // Offline or blocked -> quietly keep local masked identity
      }
    }

    /**
     * Pure Static Cross-Device Sharing: encode kitty's current fullness, bowls & recent moments into #m=...
     */
    buildShareSnapshotUrl() {
      const s = this.state;
      const compact = {
        f: s.fullness,
        w: s.hydration,
        h: s.happiness,
        bf: Number((s.bowlFoodLevel || 0).toFixed(2)),
        bw: Number((s.bowlWaterLevel || 0).toFixed(2)),
        pm: Number((s.plateMeatLevel || 0).toFixed(2)),
        fb: s.lastFedBy ? { v: s.lastFedBy.visitorId, l: s.lastFedBy.label, a: s.lastFedBy.action, t: s.lastFedBy.at } : null,
        db: s.lastDrankBy ? { v: s.lastDrankBy.visitorId, l: s.lastDrankBy.label, a: s.lastDrankBy.action, t: s.lastDrankBy.at } : null,
        m: (s.moments || []).slice(0, 10).map((item) => ({
          i: item.id, t: item.at, v: item.visitorId, l: item.label, a: item.action, c: item.icon, r: item.refused ? 1 : 0, x: item.text
        })),
        u: s.updatedAt || Date.now()
      };
      const encoded = encodeBase64Url(JSON.stringify(compact));
      const base = typeof location !== "undefined" ? `${location.origin}${location.pathname}` : "https://moemew.com/";
      return `${base}#m=${encoded}`;
    }

    importHashSnapshot() {
      if (typeof location === "undefined" || !location.hash || !location.hash.startsWith("#m=")) {
        return null;
      }
      const rawStr = decodeBase64Url(location.hash.slice(3));
      if (!rawStr) return null;
      try {
        const c = JSON.parse(rawStr);
        if (!c || typeof c.f !== "number") return null;

        const now = Date.now();
        const existing = this.loadLocalRaw(now);
        const importedMoments = Array.isArray(c.m)
          ? c.m.map((item) => ({
              id: item.i || `${now.toString(36)}_sh`,
              at: item.t || now,
              visitorId: item.v || "shared_friend",
              label: item.l || "远方访客",
              action: item.a || "feed_kibble",
              icon: item.c || "🐾",
              refused: Boolean(item.r),
              text: item.x || ""
            }))
          : [];

        // Merge moments deduplicated by id
        const mergedMap = new Map();
        for (const m of [...importedMoments, ...(existing.moments || [])]) {
          if (m && m.id && !mergedMap.has(m.id)) mergedMap.set(m.id, m);
        }
        const mergedMoments = [...mergedMap.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, MAX_MOMENTS);

        const nextRaw = decayState({
          ...existing,
          fullness: clamp(c.f, 0, 100),
          hydration: clamp(typeof c.w === "number" ? c.w : existing.hydration, 0, 100),
          happiness: clamp(typeof c.h === "number" ? c.h : existing.happiness, 0, 100),
          bowlFoodLevel: typeof c.bf === "number" ? c.bf : existing.bowlFoodLevel,
          bowlWaterLevel: typeof c.bw === "number" ? c.bw : existing.bowlWaterLevel,
          plateMeatLevel: typeof c.pm === "number" ? c.pm : existing.plateMeatLevel,
          lastFedBy: c.fb ? { visitorId: c.fb.v, label: c.fb.l, action: c.fb.a, at: c.fb.t } : existing.lastFedBy,
          lastDrankBy: c.db ? { visitorId: c.db.v, label: c.db.l, action: c.db.a, at: c.db.t } : existing.lastDrankBy,
          moments: mergedMoments,
          updatedAt: c.u || now
        }, now);

        this.saveLocalRaw(nextRaw);

        // Clean hash from address bar so future reloads stay tidy
        if (typeof history !== "undefined" && history.replaceState) {
          history.replaceState(null, "", `${location.pathname}${location.search}`);
        }
        return { lastFedBy: nextRaw.lastFedBy, isFull: nextRaw.fullness >= FULL_REFUSE_THRESHOLD };
      } catch (_) {
        return null;
      }
    }

    startCloudPolling() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        this.pollCloudState();
      }, 5000);

      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden && this.mode === "cloud") {
            this.pollCloudState();
          }
        });
      }
    }

    async pollCloudState() {
      if (!this.syncEndpoint) return;
      try {
        const res = await fetch(`${this.syncEndpoint}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.ok && data.state) {
          this.storageMode = data.storageMode || this.storageMode;
          this.onlineCount = data.onlineCount || 1;
          if (data.you) this.you = data.you;
          this.applyIncomingState(data.state, false);
        }
      } catch (_) {}
    }

    setupLocalMultiTabSync() {
      if (typeof BroadcastChannel !== "undefined") {
        try {
          this.channel = new BroadcastChannel(CHANNEL_NAME);
          this.channel.onmessage = (ev) => {
            if (ev.data && ev.data.type === "state_sync") {
              this.syncLocalState(false);
            }
          };
        } catch (_) {}
      }

      if (typeof window !== "undefined") {
        window.addEventListener("storage", (ev) => {
          if (ev.key === STORAGE_KEY) {
            this.syncLocalState(false);
          }
        });
      }

      if (this.digestTimer) clearInterval(this.digestTimer);
      this.digestTimer = setInterval(() => {
        if (this.mode === "static") this.syncLocalState(false);
      }, 10000);
    }

    loadLocalRaw(now = Date.now()) {
      let raw = null;
      if (typeof localStorage !== "undefined") {
        const txt = safeStorageGet(localStorage, STORAGE_KEY);
        if (txt) {
          try { raw = JSON.parse(txt); } catch (_) {}
        }
      }
      const s = decayState(raw || createDefaultLocalState(now), now);
      s.visitors[this.you.visitorId] = { label: this.you.label, lastSeen: now };
      return s;
    }

    saveLocalRaw(rawState) {
      if (typeof localStorage !== "undefined") {
        safeStorageSet(localStorage, STORAGE_KEY, JSON.stringify(rawState));
      }
      if (this.channel) {
        try { this.channel.postMessage({ type: "state_sync", at: Date.now() }); } catch (_) {}
      }
    }

    syncLocalState(isInitial) {
      const raw = this.loadLocalRaw(Date.now());
      this.saveLocalRaw(raw);
      this.onlineCount = Math.max(1, Object.keys(raw.visitors || {}).length);
      this.applyIncomingState(this.formatPublicState(raw), isInitial);
    }

    applyIncomingState(nextState, isInitial) {
      const moments = Array.isArray(nextState.moments) ? nextState.moments : [];

      if (isInitial) {
        for (const m of moments) {
          if (m && m.id) this.seenMomentIds.add(m.id);
        }
      } else {
        const newRemote = [];
        for (const m of moments) {
          if (!m || !m.id || this.seenMomentIds.has(m.id)) continue;
          this.seenMomentIds.add(m.id);
          if (m.visitorId !== this.you.visitorId) {
            newRemote.push(m);
          }
        }
        if (newRemote.length > 0 && typeof this.onRemoteMoment === "function") {
          this.onRemoteMoment(newRemote[0], nextState);
        }
      }

      this.state = nextState;
      if (typeof this.onStateUpdate === "function") {
        this.onStateUpdate(this.getSnapshot());
      }
    }

    getSnapshot() {
      return {
        mode: this.mode,
        storageMode: this.storageMode,
        you: this.you,
        onlineCount: this.onlineCount,
        state: this.state
      };
    }

    recordInteraction(action, customDetail = "", overrideVisitor = null) {
      const meta = ACTION_META[action];
      if (!meta) return { ok: false, accepted: false, refused: false };

      const actor = overrideVisitor || this.you;
      const now = Date.now();

      if (meta.kind === "play" && !overrideVisitor) {
        const lastAt = this.playCooldowns.get(action) || 0;
        if (now - lastAt < 6000) {
          return { ok: true, accepted: true, refused: false, throttled: true };
        }
        this.playCooldowns.set(action, now);
      }

      const baseRaw = this.mode === "static"
        ? this.loadLocalRaw(now)
        : decayState({ ...this.state, visitors: {} }, now);

      const res = this.applyLocalMutation(baseRaw, actor, action, customDetail, now);
      if (res.moment && res.moment.id) {
        this.seenMomentIds.add(res.moment.id);
      }

      if (this.mode === "static") {
        this.saveLocalRaw(res.rawState);
        this.onlineCount = Math.max(1, Object.keys(res.rawState.visitors || {}).length);
        this.state = this.formatPublicState(res.rawState);
        if (typeof this.onStateUpdate === "function") {
          this.onStateUpdate(this.getSnapshot());
        }
        if (overrideVisitor && res.moment && typeof this.onRemoteMoment === "function") {
          this.onRemoteMoment(res.moment, this.state);
        }
      } else {
        this.state = this.formatPublicState(res.rawState);
        if (typeof this.onStateUpdate === "function") {
          this.onStateUpdate(this.getSnapshot());
        }
        if (!overrideVisitor) {
          this.postCloudInteraction(action, customDetail);
        }
      }

      return {
        ok: true,
        accepted: res.accepted,
        refused: res.refused,
        reason: res.reason,
        justGotFull: res.justGotFull,
        minutesUntilHungry: res.minutesUntilHungry,
        lastFedBy: res.lastFedBy,
        lastDrankBy: res.lastDrankBy,
        isSameVisitor: res.isSameVisitor,
        moment: res.moment,
        state: this.state
      };
    }

    /**
     * Live hydration boost on each lap when kitty autonomously drinks water after dry kibble!
     */
    applyAutoDrinkSip(hydrationGain = 5, bowlWaterLevel = null) {
      const now = Date.now();
      const s = this.mode === "static"
        ? this.loadLocalRaw(now)
        : decayState({ ...this.state, visitors: {} }, now);

      s.hydration = clamp(s.hydration + hydrationGain, 0, 100);
      if (typeof bowlWaterLevel === "number") {
        s.bowlWaterLevel = clamp(bowlWaterLevel, 0, 1);
      }

      if (this.mode === "static") {
        this.saveLocalRaw(s);
      }
      this.state = this.formatPublicState(s);
      if (typeof this.onStateUpdate === "function") {
        this.onStateUpdate(this.getSnapshot());
      }
    }

    /**
     * Finalizes kitty's automatic post-kibble drink: logs a single cute moment (without double-counting
     * hydration already added per lap) and syncs with the optional cloud worker.
     */
    finalizeAutoDrink(bowlWaterLevel = null, laps = 0) {
      const now = Date.now();
      const meta = ACTION_META.auto_sip;
      const s = this.mode === "static"
        ? this.loadLocalRaw(now)
        : decayState({ ...this.state, visitors: {} }, now);

      if (laps <= 0) {
        s.hydration = clamp(s.hydration + 12, 0, 100);
      }
      s.happiness = clamp(s.happiness + meta.happy, 0, 100);
      if (typeof bowlWaterLevel === "number") {
        s.bowlWaterLevel = clamp(bowlWaterLevel, 0, 1);
      }

      const momentId = `${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const moment = {
        id: momentId,
        at: now,
        visitorId: this.you.visitorId,
        label: this.you.label,
        action: "auto_sip",
        icon: meta.icon,
        refused: false,
        text: meta.text,
        fullnessAfter: Math.round(s.fullness)
      };
      this.seenMomentIds.add(momentId);
      s.moments.unshift(moment);
      if (s.moments.length > MAX_MOMENTS) s.moments.length = MAX_MOMENTS;

      if (this.mode === "static") {
        this.saveLocalRaw(s);
      }
      this.state = this.formatPublicState(s);
      if (typeof this.onStateUpdate === "function") {
        this.onStateUpdate(this.getSnapshot());
      }
      if (this.mode === "cloud") {
        this.postCloudInteraction("auto_sip", "");
      }
      return this.state;
    }

    /**
     * Persists post-meal bowl/plate levels so periodic digestion sync never refills emptied bowls!
     */
    syncBowlLevels(levels = {}) {
      const now = Date.now();
      const s = this.mode === "static"
        ? this.loadLocalRaw(now)
        : decayState({ ...this.state, visitors: {} }, now);

      if (typeof levels.bowlFoodLevel === "number") s.bowlFoodLevel = clamp(levels.bowlFoodLevel, 0, 1);
      if (typeof levels.bowlWaterLevel === "number") s.bowlWaterLevel = clamp(levels.bowlWaterLevel, 0, 1);
      if (typeof levels.plateMeatLevel === "number") s.plateMeatLevel = clamp(levels.plateMeatLevel, 0, 1);

      if (this.mode === "static") {
        this.saveLocalRaw(s);
      }
      this.state = this.formatPublicState(s);
    }

    applyLocalMutation(s, visitor, action, customDetail, now) {
      const meta = ACTION_META[action];
      s.visitors[visitor.visitorId] = { label: visitor.label, lastSeen: now };
      const momentId = `${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      if (meta.kind === "food" && s.fullness >= FULL_REFUSE_THRESHOLD) {
        const minutesUntilHungry = Math.max(1, Math.ceil((s.fullness - (FULL_REFUSE_THRESHOLD - 12)) / FULLNESS_DIGEST_PER_MIN));
        const feeder = s.lastFedBy;
        const isSameVisitor = Boolean(feeder && feeder.visitorId === visitor.visitorId);
        const dup = s.moments.find(
          (m) => m.visitorId === visitor.visitorId && m.action === "refused_full" && now - m.at < 12000
        );
        let moment = null;
        if (!dup) {
          const foodName =
            action === "feed_fish_meat" ? "三文鱼肉" :
            action === "feed_fish_snack" ? "小鱼干" : "香脆猫粮";
          moment = {
            id: momentId,
            at: now,
            visitorId: visitor.visitorId,
            label: visitor.label,
            action: "refused_full",
            icon: "🫧",
            refused: true,
            text: feeder && !isSameVisitor
              ? `想投喂${foodName}，但喵喵刚被【${feeder.label}】喂饱啦，摸着圆肚皮摇头打了个饱嗝`
              : `想继续投喂${foodName}，但喵喵摸着圆鼓鼓的肚皮摆摆爪表示真吃不下啦`,
            fullnessAfter: Math.round(s.fullness)
          };
          s.moments.unshift(moment);
          if (s.moments.length > MAX_MOMENTS) s.moments.length = MAX_MOMENTS;
        }
        return {
          accepted: false,
          refused: true,
          reason: "full",
          minutesUntilHungry,
          lastFedBy: feeder,
          isSameVisitor,
          moment,
          rawState: s
        };
      }

      if (meta.kind === "water" && s.hydration >= WATER_REFUSE_THRESHOLD) {
        const drinker = s.lastDrankBy;
        const isSameVisitor = Boolean(drinker && drinker.visitorId === visitor.visitorId);
        const dup = s.moments.find(
          (m) => m.visitorId === visitor.visitorId && m.action === "refused_water" && now - m.at < 12000
        );
        let moment = null;
        if (!dup) {
          moment = {
            id: momentId,
            at: now,
            visitorId: visitor.visitorId,
            label: visitor.label,
            action: "refused_water",
            icon: "💧",
            refused: true,
            text: drinker && !isSameVisitor
              ? `想给喵喵倒水，但刚喝过【${drinker.label}】倒的清水，喵喵舔舔嘴表示还不渴`
              : `想再倒清水，但喵喵已经喝得水饱啦，晃晃脑袋表示不渴`,
            fullnessAfter: Math.round(s.fullness)
          };
          s.moments.unshift(moment);
          if (s.moments.length > MAX_MOMENTS) s.moments.length = MAX_MOMENTS;
        }
        return {
          accepted: false,
          refused: true,
          reason: "hydrated",
          minutesUntilHungry: Math.max(1, Math.ceil((s.hydration - (WATER_REFUSE_THRESHOLD - 12)) / HYDRATION_DECAY_PER_MIN)),
          lastDrankBy: drinker,
          isSameVisitor,
          moment,
          rawState: s
        };
      }

      s.fullness = clamp(s.fullness + meta.full, 0, 100);
      s.hydration = clamp(s.hydration + meta.water, 0, 100);
      s.happiness = clamp(s.happiness + meta.happy, 0, 100);
      s.totalInteractions = (s.totalInteractions || 0) + 1;

      if (action === "feed_kibble") s.bowlFoodLevel = 1.0;
      if (action === "pour_water") s.bowlWaterLevel = 1.0;
      if (action === "feed_fish_meat") s.plateMeatLevel = 1.0;
      if (action === "auto_sip") s.bowlWaterLevel = Math.max(0, (s.bowlWaterLevel ?? 0.35) - 0.35);

      if (meta.kind === "food") {
        s.lastFedBy = { visitorId: visitor.visitorId, label: visitor.label, action, at: now };
      } else if (meta.kind === "water") {
        s.lastDrankBy = { visitorId: visitor.visitorId, label: visitor.label, action, at: now };
      }

      const moment = {
        id: momentId,
        at: now,
        visitorId: visitor.visitorId,
        label: visitor.label,
        action,
        icon: meta.icon,
        refused: false,
        text: customDetail ? String(customDetail).slice(0, 60) : meta.text,
        fullnessAfter: Math.round(s.fullness)
      };
      s.moments.unshift(moment);
      if (s.moments.length > MAX_MOMENTS) s.moments.length = MAX_MOMENTS;

      return {
        accepted: true,
        refused: false,
        reason: null,
        justGotFull: meta.kind === "food" && s.fullness >= FULL_REFUSE_THRESHOLD,
        minutesUntilHungry: 0,
        lastFedBy: s.lastFedBy,
        lastDrankBy: s.lastDrankBy,
        isSameVisitor: true,
        moment,
        rawState: s
      };
    }

    async postCloudInteraction(action, detail) {
      if (!this.syncEndpoint) return;
      try {
        const res = await fetch(`${this.syncEndpoint}/interact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, detail })
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.ok && data.state) {
          this.storageMode = data.storageMode || this.storageMode;
          this.onlineCount = data.onlineCount || 1;
          if (data.you) this.you = data.you;
          if (data.moment && data.moment.id) this.seenMomentIds.add(data.moment.id);
          this.applyIncomingState(data.state, false);
        }
      } catch (_) {}
    }

    formatRelativeTime(ts) {
      const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (diffSec < 12) return "刚刚";
      if (diffSec < 60) return `${diffSec}秒前`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}分钟前`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}小时前`;
      return `${Math.floor(diffHr / 24)}天前`;
    }
  }

  window.MoeSocial = new MoeSocialEngine();
})();

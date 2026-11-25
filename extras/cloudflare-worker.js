/**
 * MoeMew 可选无数据库跨域同步 Worker（供 GitHub Pages 静态站点进阶开启全站实时互通）
 * 使用方法：
 * 1. 登录免费 Cloudflare Workers 控制台，新建一个 Worker，将本文件全文粘贴部署；
 * 2. （可选）在 Worker 设置中绑定一个免费 KV 命名空间，变量名填 MOEMEW_KV（不绑也可运行内存/缓存级同步）；
 * 3. 将部署后的 Worker URL 填入 js/config.js 的 syncEndpoint 即可，无需改动任何其他代码！
 */

const STATE_KEY = "moemew:shared_state:v1";
const MAX_MOMENTS = 40;
const PRESENCE_TTL_MS = 90 * 1000;
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

let memState = null;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function maskIp(raw) {
  const ip = String(raw || "").trim().replace(/^::ffff:/, "");
  if (!ip || ip === "::1" || ip === "127.0.0.1") return "127.0.*.*";
  if (ip.includes(".")) {
    const p = ip.split(".");
    if (p.length === 4) return `${p[0]}.${p[1]}.*.*`;
  }
  if (ip.includes(":")) {
    const p = ip.split(":").filter(Boolean);
    if (p.length >= 2) return `${p[0]}:${p[1]}:*:*`;
  }
  return "访客";
}

function getVisitor(req) {
  const rawIp = (req.headers.get("CF-Connecting-IP") || (req.headers.get("X-Forwarded-For") || "").split(",")[0] || "127.0.0.1").trim();
  const maskedIp = maskIp(rawIp);
  const h = hashStr(`moemew-v1:${rawIp}`);
  const nickname = CUTE_NICKNAMES[h % CUTE_NICKNAMES.length];
  return { visitorId: `v_${h.toString(36)}`, maskedIp, nickname, label: `访客 ${maskedIp} · ${nickname}` };
}

function defaultState(now) {
  return {
    version: 1, fullness: 30, hydration: 42, happiness: 68,
    bowlFoodLevel: 0.25, bowlWaterLevel: 0.35, plateMeatLevel: 0.0,
    lastFedBy: null, lastDrankBy: null, totalInteractions: 0,
    visitors: {}, moments: [], updatedAt: now
  };
}

function decay(raw, now) {
  const s = { ...defaultState(now), ...raw };
  const mins = Math.max(0, now - (s.updatedAt || now)) / 60000;
  if (mins > 0.001) {
    s.fullness = clamp(s.fullness - mins * FULLNESS_DIGEST_PER_MIN, 0, 100);
    s.hydration = clamp(s.hydration - mins * HYDRATION_DECAY_PER_MIN, 0, 100);
    const step = mins * HAPPINESS_DECAY_PER_MIN;
    if (s.happiness > 58) s.happiness = Math.max(58, s.happiness - step);
    else if (s.happiness < 58) s.happiness = Math.min(58, s.happiness + step * 0.5);
  }
  const cleanV = {};
  for (const [k, v] of Object.entries(s.visitors || {})) {
    if (v && now - v.lastSeen <= PRESENCE_TTL_MS) cleanV[k] = v;
  }
  s.visitors = cleanV;
  s.moments = Array.isArray(s.moments) ? s.moments.slice(0, MAX_MOMENTS) : [];
  s.updatedAt = now;
  return s;
}

async function loadState(env, now) {
  let raw = null;
  let storageMode = "edge-memory";
  if (env && env.MOEMEW_KV) {
    storageMode = "kv";
    try { raw = await env.MOEMEW_KV.get(STATE_KEY, "json"); } catch (_) {}
  }
  if (!raw && memState) raw = memState;
  const s = decay(raw || defaultState(now), now);
  memState = s;
  return { state: s, storageMode };
}

async function saveState(env, s) {
  memState = s;
  if (env && env.MOEMEW_KV) {
    try { await env.MOEMEW_KV.put(STATE_KEY, JSON.stringify(s)); return "kv"; } catch (_) {}
  }
  return "edge-memory";
}

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
}

function formatResp(s, visitor, storageMode, extra = {}) {
  return {
    ok: true,
    storageMode,
    serverNow: Date.now(),
    you: visitor,
    onlineCount: Math.max(1, Object.keys(s.visitors || {}).length),
    state: {
      fullness: Math.round(s.fullness),
      hydration: Math.round(s.hydration),
      happiness: Math.round(s.happiness),
      isFull: s.fullness >= FULL_REFUSE_THRESHOLD,
      isHydrated: s.hydration >= WATER_REFUSE_THRESHOLD,
      bowlFoodLevel: s.bowlFoodLevel,
      bowlWaterLevel: s.bowlWaterLevel,
      plateMeatLevel: s.plateMeatLevel,
      lastFedBy: s.lastFedBy,
      lastDrankBy: s.lastDrankBy,
      totalInteractions: s.totalInteractions || 0,
      moments: s.moments || [],
      updatedAt: s.updatedAt
    },
    ...extra
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const now = Date.now();
    const visitor = getVisitor(request);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname.endsWith("/state"))) {
      const { state, storageMode } = await loadState(env, now);
      const prev = state.visitors[visitor.visitorId];
      state.visitors[visitor.visitorId] = { label: visitor.label, lastSeen: now };
      if (!prev || now - prev.lastSeen > 25000) await saveState(env, state);
      return new Response(JSON.stringify(formatResp(state, visitor, storageMode)), { headers: corsHeaders(request) });
    }

    if (request.method === "POST" && url.pathname.endsWith("/interact")) {
      let body = {};
      try { body = await request.json(); } catch (_) {
        return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), { status: 400, headers: corsHeaders(request) });
      }
      const action = String(body.action || "").trim();
      const detail = String(body.detail || "").trim();
      const meta = ACTION_META[action];
      if (!meta) {
        return new Response(JSON.stringify({ ok: false, error: "unknown_action" }), { status: 400, headers: corsHeaders(request) });
      }

      const { state: s, storageMode } = await loadState(env, now);
      s.visitors[visitor.visitorId] = { label: visitor.label, lastSeen: now };
      const mid = `${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      if (meta.kind === "food" && s.fullness >= FULL_REFUSE_THRESHOLD) {
        const feeder = s.lastFedBy;
        const isSame = Boolean(feeder && feeder.visitorId === visitor.visitorId);
        const mins = Math.max(1, Math.ceil((s.fullness - (FULL_REFUSE_THRESHOLD - 12)) / FULLNESS_DIGEST_PER_MIN));
        const dup = s.moments.find((m) => m.visitorId === visitor.visitorId && m.action === "refused_full" && now - m.at < 12000);
        let moment = null;
        if (!dup) {
          const fname = action === "feed_fish_meat" ? "三文鱼肉" : action === "feed_fish_snack" ? "小鱼干" : "香脆猫粮";
          moment = {
            id: mid, at: now, visitorId: visitor.visitorId, label: visitor.label,
            action: "refused_full", icon: "🫧", refused: true, fullnessAfter: Math.round(s.fullness),
            text: feeder && !isSame ? `想投喂${fname}，但喵喵刚被【${feeder.label}】喂饱啦，摸着圆肚皮摇头打了个饱嗝` : `想继续投喂${fname}，但喵喵摸着圆鼓鼓的肚皮摆摆爪表示真吃不下啦`
          };
          s.moments.unshift(moment);
          if (s.moments.length > MAX_MOMENTS) s.moments.length = MAX_MOMENTS;
        }
        const saved = await saveState(env, s);
        return new Response(JSON.stringify(formatResp(s, visitor, saved || storageMode, {
          accepted: false, refused: true, reason: "full", minutesUntilHungry: mins, isSameVisitor: isSame, moment
        })), { headers: corsHeaders(request) });
      }

      if (meta.kind === "water" && s.hydration >= WATER_REFUSE_THRESHOLD) {
        const drinker = s.lastDrankBy;
        const isSame = Boolean(drinker && drinker.visitorId === visitor.visitorId);
        const dup = s.moments.find((m) => m.visitorId === visitor.visitorId && m.action === "refused_water" && now - m.at < 12000);
        let moment = null;
        if (!dup) {
          moment = {
            id: mid, at: now, visitorId: visitor.visitorId, label: visitor.label,
            action: "refused_water", icon: "💧", refused: true, fullnessAfter: Math.round(s.fullness),
            text: drinker && !isSame ? `想给喵喵倒水，但刚喝过【${drinker.label}】倒的清水，喵喵舔舔嘴表示还不渴` : `想再倒清水，但喵喵已经喝得水饱啦，晃晃脑袋表示不渴`
          };
          s.moments.unshift(moment);
          if (s.moments.length > MAX_MOMENTS) s.moments.length = MAX_MOMENTS;
        }
        const saved = await saveState(env, s);
        return new Response(JSON.stringify(formatResp(s, visitor, saved || storageMode, {
          accepted: false, refused: true, reason: "hydrated", minutesUntilHungry: 2, isSameVisitor: isSame, moment
        })), { headers: corsHeaders(request) });
      }

      s.fullness = clamp(s.fullness + meta.full, 0, 100);
      s.hydration = clamp(s.hydration + meta.water, 0, 100);
      s.happiness = clamp(s.happiness + meta.happy, 0, 100);
      s.totalInteractions = (s.totalInteractions || 0) + 1;
      if (action === "feed_kibble") s.bowlFoodLevel = 1.0;
      if (action === "pour_water") s.bowlWaterLevel = 1.0;
      if (action === "feed_fish_meat") s.plateMeatLevel = 1.0;
      if (action === "auto_sip") s.bowlWaterLevel = Math.max(0, (s.bowlWaterLevel ?? 0.35) - 0.35);
      if (meta.kind === "food") s.lastFedBy = { visitorId: visitor.visitorId, label: visitor.label, action, at: now };
      if (meta.kind === "water") s.lastDrankBy = { visitorId: visitor.visitorId, label: visitor.label, action, at: now };

      const dupPlay = meta.kind === "play" && s.moments.find((m) => m.visitorId === visitor.visitorId && m.action === action && now - m.at < 5000);
      let moment = null;
      if (!dupPlay) {
        moment = {
          id: mid, at: now, visitorId: visitor.visitorId, label: visitor.label,
          action, icon: meta.icon, refused: false,
          text: detail ? detail.slice(0, 60) : meta.text,
          fullnessAfter: Math.round(s.fullness)
        };
        s.moments.unshift(moment);
        if (s.moments.length > MAX_MOMENTS) s.moments.length = MAX_MOMENTS;
      }

      const saved = await saveState(env, s);
      return new Response(JSON.stringify(formatResp(s, visitor, saved || storageMode, {
        accepted: true, refused: false, justGotFull: meta.kind === "food" && s.fullness >= FULL_REFUSE_THRESHOLD, moment
      })), { headers: corsHeaders(request) });
    }

    return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404, headers: corsHeaders(request) });
  }
};

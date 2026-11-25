-- ============================================================================
-- 萌喵 moemew.com · Supabase 免费版全站实时互动足迹配置脚本
-- ============================================================================
-- 使用方法（仅需 2 分钟，无需部署任何后端服务器）：
-- 1. 访问 https://supabase.com 注册免费账号并新建一个 Project（地区建议选 Singapore / Tokyo / Seoul，国内访问更稳）；
-- 2. 在左侧菜单打开「SQL Editor」->「New query」，将本文件全部内容粘贴进去并点击「Run」执行；
-- 3. 在左侧菜单打开「Project Settings」->「API」（或 Connect -> API Keys），复制：
--      - Project URL（形如 https://xxxxxx.supabase.co）
--      - anon public key（公开只读/RPC 密钥）
--    填入项目中的 js/config.js（supabaseUrl 与 supabaseAnonKey），推送到 GitHub Pages 即可全网实时同步！
--
-- 安全说明：
-- - 本脚本开启了行级安全（RLS），浏览器端的 anon key 仅可读取状态与调用下方校验过的 RPC 函数，
--   无法直接篡改、清空或删除数据表；所有并发喂食/拒食均通过行锁（FOR UPDATE）原子结算，绝不丢足迹。
-- ============================================================================

-- 1. 轻量单行状态表（存放喵喵当前饱腹/水分/开心值、猫碗余量与最近 40 条全站互动足迹）
create table if not exists public.moemew_state (
  id text primary key default 'global',
  fullness numeric not null default 30,
  hydration numeric not null default 42,
  happiness numeric not null default 68,
  bowl_food_level numeric not null default 0.25,
  bowl_water_level numeric not null default 0.35,
  plate_meat_level numeric not null default 0.0,
  last_fed_by jsonb,
  last_drank_by jsonb,
  total_interactions integer not null default 0,
  moments jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.moemew_state (id)
values ('global')
on conflict (id) do nothing;

-- 开启行级安全：允许匿名访客只读，禁止直接写表（所有写入均经由下方原子 RPC 函数校验）
alter table public.moemew_state enable row level security;

drop policy if exists "moemew_public_read" on public.moemew_state;
create policy "moemew_public_read"
  on public.moemew_state
  for select
  to anon, authenticated
  using (id = 'global');

revoke insert, update, delete on public.moemew_state from anon, authenticated;
grant select on public.moemew_state to anon, authenticated;

-- 开启 Supabase Realtime 实时表变更推送
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moemew_state'
  ) then
    alter publication supabase_realtime add table public.moemew_state;
  end if;
end $$;

-- 2. 工具函数：按真实流逝时间自动计算自然消化后的状态快照（只读，不产生无意义写入）
create or replace function public.moemew_get_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.moemew_state%rowtype;
  v_now timestamptz := now();
  v_mins numeric;
  v_full numeric;
  v_water numeric;
  v_happy numeric;
  v_step numeric;
begin
  select * into r from public.moemew_state where id = 'global';
  if not found then
    insert into public.moemew_state (id) values ('global') on conflict (id) do nothing;
    select * into r from public.moemew_state where id = 'global';
  end if;

  v_mins := greatest(0, extract(epoch from (v_now - coalesce(r.updated_at, v_now))) / 60.0);
  v_full := least(100, greatest(0, r.fullness - v_mins * 4.5));
  v_water := least(100, greatest(0, r.hydration - v_mins * 3.2));
  v_step := v_mins * 1.2;
  if r.happiness > 58 then
    v_happy := greatest(58, r.happiness - v_step);
  elsif r.happiness < 58 then
    v_happy := least(58, r.happiness + v_step * 0.5);
  else
    v_happy := r.happiness;
  end if;

  return jsonb_build_object(
    'ok', true,
    'storageMode', 'supabase-realtime',
    'serverNow', floor(extract(epoch from v_now) * 1000)::bigint,
    'state', jsonb_build_object(
      'fullness', round(v_full)::int,
      'hydration', round(v_water)::int,
      'happiness', round(v_happy)::int,
      'isFull', (v_full >= 88),
      'isHydrated', (v_water >= 92),
      'bowlFoodLevel', round(r.bowl_food_level::numeric, 2),
      'bowlWaterLevel', round(r.bowl_water_level::numeric, 2),
      'plateMeatLevel', round(r.plate_meat_level::numeric, 2),
      'lastFedBy', r.last_fed_by,
      'lastDrankBy', r.last_drank_by,
      'totalInteractions', r.total_interactions,
      'moments', coalesce(r.moments, '[]'::jsonb),
      'updatedAt', floor(extract(epoch from v_now) * 1000)::bigint
    )
  );
end;
$$;

-- 3. 原子互动结算函数（行锁防并发覆盖 + 吃饱/喝饱拒食校验 + 写入最近 40 条全站足迹）
create or replace function public.moemew_interact(
  p_action text,
  p_visitor_id text,
  p_visitor_label text,
  p_detail text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.moemew_state%rowtype;
  v_now timestamptz := now();
  v_now_ms bigint := floor(extract(epoch from v_now) * 1000)::bigint;
  v_mins numeric;
  v_full numeric;
  v_water numeric;
  v_happy numeric;
  v_step numeric;
  v_kind text;
  v_dfull numeric := 0;
  v_dwater numeric := 0;
  v_dhappy numeric := 0;
  v_icon text := '🐾';
  v_default_text text := '';
  v_vid text;
  v_vlabel text;
  v_detail text;
  v_mid text;
  v_moments jsonb;
  v_moment jsonb := null;
  v_dup boolean := false;
  v_is_same boolean := false;
  v_wait_mins int := 0;
  v_food_name text;
  v_bf numeric;
  v_bw numeric;
  v_pm numeric;
  v_last_fed jsonb;
  v_last_drank jsonb;
  v_total int;
begin
  -- 白名单校验动作与数值变化
  case p_action
    when 'feed_kibble'     then v_kind := 'food';       v_dfull := 32; v_dwater := -8; v_dhappy := 8;  v_icon := '🥣'; v_default_text := '往猫碗倒满香脆猫粮，喵喵埋头咔嚓干饭';
    when 'feed_fish_meat'  then v_kind := 'food';       v_dfull := 42; v_dwater := 4;  v_dhappy := 15; v_icon := '🍣'; v_default_text := '在左边鱼肉盘端上鲜嫩三文鱼，喵喵香迷糊啦';
    when 'feed_fish_snack' then v_kind := 'food';       v_dfull := 22; v_dwater := -3; v_dhappy := 9;  v_icon := '🐟'; v_default_text := '抛投了一条香脆小鱼干，喵喵飞奔叼走';
    when 'pour_water'      then v_kind := 'water';      v_dfull := 0;  v_dwater := 38; v_dhappy := 6;  v_icon := '💧'; v_default_text := '给水碗添满清甜泉水，喵喵伸出小粉舌吧嗒喝水';
    when 'auto_sip'        then v_kind := 'auto_water'; v_dfull := 0;  v_dwater := 20; v_dhappy := 3;  v_icon := '💧'; v_default_text := '吃完猫粮乖乖去水碗补了口清水，水分值回升啦';
    when 'pet'             then v_kind := 'play';       v_dfull := -1; v_dwater := 0;  v_dhappy := 10; v_icon := '💗'; v_default_text := '轻轻顺毛撸了撸喵喵，收获一阵呼噜噜';
    when 'roll'            then v_kind := 'play';       v_dfull := -3; v_dwater := -1; v_dhappy := 12; v_icon := '🐾'; v_default_text := '把喵喵逗得翻出软白肚皮左右打滚卖萌';
    when 'catnip'          then v_kind := 'play';       v_dfull := -4; v_dwater := -2; v_dhappy := 16; v_icon := '🌿'; v_default_text := '撒下清香猫薄荷，喵喵闻香开心转圈打滚';
    when 'bubble'          then v_kind := 'play';       v_dfull := -6; v_dwater := -2; v_dhappy := 10; v_icon := '🫧'; v_default_text := '吹起一串彩虹泡泡，陪喵喵蹦跳戳破';
    when 'laser'           then v_kind := 'play';       v_dfull := -7; v_dwater := -3; v_dhappy := 9;  v_icon := '🔴'; v_default_text := '用红激光点陪喵喵满屋360°急停扑抓消食';
    when 'wand'            then v_kind := 'play';       v_dfull := -6; v_dwater := -2; v_dhappy := 10; v_icon := '🪶'; v_default_text := '高举逗猫羽引得喵喵轻盈腾空扑抓';
    when 'ball'            then v_kind := 'play';       v_dfull := -6; v_dwater := -2; v_dhappy := 9;  v_icon := '🧶'; v_default_text := '和喵喵在客厅玩起了毛毡球接力赛';
    when 'trick'           then v_kind := 'play';       v_dfull := -5; v_dwater := -1; v_dhappy := 8;  v_icon := '✨'; v_default_text := '逗喵喵表演了拿手绝活';
    when 'prop'            then v_kind := 'play';       v_dfull := 0;  v_dwater := 0;  v_dhappy := 4;  v_icon := '🏡'; v_default_text := '轻点了客厅里的温馨小摆件';
    else
      return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end case;

  v_vid := left(coalesce(nullif(trim(p_visitor_id), ''), 'anon_guest'), 48);
  v_vlabel := left(coalesce(nullif(trim(p_visitor_label), ''), '神秘访客 · 萌喵之友'), 48);
  v_detail := left(coalesce(trim(p_detail), ''), 60);
  v_mid := to_hex(v_now_ms) || '_' || substr(md5(random()::text || v_vid), 1, 6);

  -- 行锁读取全局状态，确保多人同时互动不互相覆盖
  insert into public.moemew_state (id) values ('global') on conflict (id) do nothing;
  select * into r from public.moemew_state where id = 'global' for update;

  v_mins := greatest(0, extract(epoch from (v_now - coalesce(r.updated_at, v_now))) / 60.0);
  v_full := least(100, greatest(0, r.fullness - v_mins * 4.5));
  v_water := least(100, greatest(0, r.hydration - v_mins * 3.2));
  v_step := v_mins * 1.2;
  if r.happiness > 58 then
    v_happy := greatest(58, r.happiness - v_step);
  elsif r.happiness < 58 then
    v_happy := least(58, r.happiness + v_step * 0.5);
  else
    v_happy := r.happiness;
  end if;

  v_moments := coalesce(r.moments, '[]'::jsonb);
  v_bf := r.bowl_food_level;
  v_bw := r.bowl_water_level;
  v_pm := r.plate_meat_level;
  v_last_fed := r.last_fed_by;
  v_last_drank := r.last_drank_by;
  v_total := coalesce(r.total_interactions, 0);

  -- A. 吃饱拒食校验 (fullness >= 88)
  if v_kind = 'food' and v_full >= 88 then
    v_is_same := (v_last_fed is not null and v_last_fed->>'visitorId' = v_vid);
    v_wait_mins := greatest(1, ceil((v_full - 76) / 4.5)::int);
    select exists(
      select 1 from jsonb_array_elements(v_moments) elem
      where elem->>'visitorId' = v_vid
        and elem->>'action' = 'refused_full'
        and (v_now_ms - coalesce((elem->>'at')::bigint, 0)) < 12000
    ) into v_dup;

    if not v_dup then
      v_food_name := case p_action
        when 'feed_fish_meat' then '三文鱼肉'
        when 'feed_fish_snack' then '小鱼干'
        else '香脆猫粮'
      end;
      v_moment := jsonb_build_object(
        'id', v_mid,
        'at', v_now_ms,
        'visitorId', v_vid,
        'label', v_vlabel,
        'action', 'refused_full',
        'icon', '🫧',
        'refused', true,
        'fullnessAfter', round(v_full)::int,
        'text', case
          when v_last_fed is not null and not v_is_same then
            '想投喂' || v_food_name || '，但喵喵刚被【' || (v_last_fed->>'label') || '】喂饱啦，摸着圆肚皮摇头打了个饱嗝'
          else
            '想继续投喂' || v_food_name || '，但喵喵摸着圆鼓鼓的肚皮摆摆爪表示真吃不下啦'
        end
      );
      select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
      into v_moments
      from (
        select elem, ord
        from jsonb_array_elements(jsonb_build_array(v_moment) || v_moments) with ordinality as t(elem, ord)
        limit 40
      ) sub;
    end if;

    update public.moemew_state
    set fullness = v_full,
        hydration = v_water,
        happiness = v_happy,
        moments = v_moments,
        updated_at = v_now
    where id = 'global';

    return jsonb_build_object(
      'ok', true,
      'storageMode', 'supabase-realtime',
      'accepted', false,
      'refused', true,
      'reason', 'full',
      'minutesUntilHungry', v_wait_mins,
      'lastFedBy', v_last_fed,
      'isSameVisitor', v_is_same,
      'moment', v_moment,
      'state', jsonb_build_object(
        'fullness', round(v_full)::int,
        'hydration', round(v_water)::int,
        'happiness', round(v_happy)::int,
        'isFull', (v_full >= 88),
        'isHydrated', (v_water >= 92),
        'bowlFoodLevel', round(v_bf::numeric, 2),
        'bowlWaterLevel', round(v_bw::numeric, 2),
        'plateMeatLevel', round(v_pm::numeric, 2),
        'lastFedBy', v_last_fed,
        'lastDrankBy', v_last_drank,
        'totalInteractions', v_total,
        'moments', v_moments,
        'updatedAt', v_now_ms
      )
    );
  end if;

  -- B. 喝饱拒水校验 (hydration >= 92)
  if v_kind = 'water' and v_water >= 92 then
    v_is_same := (v_last_drank is not null and v_last_drank->>'visitorId' = v_vid);
    v_wait_mins := greatest(1, ceil((v_water - 80) / 3.2)::int);
    select exists(
      select 1 from jsonb_array_elements(v_moments) elem
      where elem->>'visitorId' = v_vid
        and elem->>'action' = 'refused_water'
        and (v_now_ms - coalesce((elem->>'at')::bigint, 0)) < 12000
    ) into v_dup;

    if not v_dup then
      v_moment := jsonb_build_object(
        'id', v_mid,
        'at', v_now_ms,
        'visitorId', v_vid,
        'label', v_vlabel,
        'action', 'refused_water',
        'icon', '💧',
        'refused', true,
        'fullnessAfter', round(v_full)::int,
        'text', case
          when v_last_drank is not null and not v_is_same then
            '想给喵喵倒水，但刚喝过【' || (v_last_drank->>'label') || '】倒的清水，喵喵舔舔嘴表示还不渴'
          else
            '想再倒清水，但喵喵已经喝得水饱啦，晃晃脑袋表示不渴'
        end
      );
      select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
      into v_moments
      from (
        select elem, ord
        from jsonb_array_elements(jsonb_build_array(v_moment) || v_moments) with ordinality as t(elem, ord)
        limit 40
      ) sub;
    end if;

    update public.moemew_state
    set fullness = v_full,
        hydration = v_water,
        happiness = v_happy,
        moments = v_moments,
        updated_at = v_now
    where id = 'global';

    return jsonb_build_object(
      'ok', true,
      'storageMode', 'supabase-realtime',
      'accepted', false,
      'refused', true,
      'reason', 'hydrated',
      'minutesUntilHungry', v_wait_mins,
      'lastDrankBy', v_last_drank,
      'isSameVisitor', v_is_same,
      'moment', v_moment,
      'state', jsonb_build_object(
        'fullness', round(v_full)::int,
        'hydration', round(v_water)::int,
        'happiness', round(v_happy)::int,
        'isFull', (v_full >= 88),
        'isHydrated', (v_water >= 92),
        'bowlFoodLevel', round(v_bf::numeric, 2),
        'bowlWaterLevel', round(v_bw::numeric, 2),
        'plateMeatLevel', round(v_pm::numeric, 2),
        'lastFedBy', v_last_fed,
        'lastDrankBy', v_last_drank,
        'totalInteractions', v_total,
        'moments', v_moments,
        'updatedAt', v_now_ms
      )
    );
  end if;

  -- C. 正常结算数值、猫碗状态与新足迹
  v_full := least(100, greatest(0, v_full + v_dfull));
  v_water := least(100, greatest(0, v_water + v_dwater));
  v_happy := least(100, greatest(0, v_happy + v_dhappy));
  v_total := v_total + 1;

  if p_action = 'feed_kibble' then v_bf := 1.0; end if;
  if p_action = 'pour_water' then v_bw := 1.0; end if;
  if p_action = 'feed_fish_meat' then v_pm := 1.0; end if;
  if p_action = 'auto_sip' then v_bw := greatest(0, v_bw - 0.35); end if;

  if v_kind = 'food' then
    v_last_fed := jsonb_build_object('visitorId', v_vid, 'label', v_vlabel, 'action', p_action, 'at', v_now_ms);
  elsif v_kind = 'water' then
    v_last_drank := jsonb_build_object('visitorId', v_vid, 'label', v_vlabel, 'action', p_action, 'at', v_now_ms);
  end if;

  if v_kind = 'play' then
    select exists(
      select 1 from jsonb_array_elements(v_moments) elem
      where elem->>'visitorId' = v_vid
        and elem->>'action' = p_action
        and (v_now_ms - coalesce((elem->>'at')::bigint, 0)) < 5000
    ) into v_dup;
  end if;

  if not v_dup then
    v_moment := jsonb_build_object(
      'id', v_mid,
      'at', v_now_ms,
      'visitorId', v_vid,
      'label', v_vlabel,
      'action', p_action,
      'icon', v_icon,
      'refused', false,
      'fullnessAfter', round(v_full)::int,
      'text', case when v_detail <> '' then v_detail else v_default_text end
    );
    select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
    into v_moments
    from (
      select elem, ord
      from jsonb_array_elements(jsonb_build_array(v_moment) || v_moments) with ordinality as t(elem, ord)
      limit 40
    ) sub;
  end if;

  update public.moemew_state
  set fullness = v_full,
      hydration = v_water,
      happiness = v_happy,
      bowl_food_level = v_bf,
      bowl_water_level = v_bw,
      plate_meat_level = v_pm,
      last_fed_by = v_last_fed,
      last_drank_by = v_last_drank,
      total_interactions = v_total,
      moments = v_moments,
      updated_at = v_now
  where id = 'global';

  return jsonb_build_object(
    'ok', true,
    'storageMode', 'supabase-realtime',
    'accepted', true,
    'refused', false,
    'justGotFull', (v_kind = 'food' and v_full >= 88),
    'lastFedBy', v_last_fed,
    'lastDrankBy', v_last_drank,
    'isSameVisitor', true,
    'moment', v_moment,
    'state', jsonb_build_object(
      'fullness', round(v_full)::int,
      'hydration', round(v_water)::int,
      'happiness', round(v_happy)::int,
      'isFull', (v_full >= 88),
      'isHydrated', (v_water >= 92),
      'bowlFoodLevel', round(v_bf::numeric, 2),
      'bowlWaterLevel', round(v_bw::numeric, 2),
      'plateMeatLevel', round(v_pm::numeric, 2),
      'lastFedBy', v_last_fed,
      'lastDrankBy', v_last_drank,
      'totalInteractions', v_total,
      'moments', v_moments,
      'updatedAt', v_now_ms
    )
  );
end;
$$;

-- 4. 餐后同步碗盘余量（防止刷新后空碗被还原）
create or replace function public.moemew_sync_bowls(
  p_food numeric default null,
  p_water numeric default null,
  p_meat numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.moemew_state
  set bowl_food_level = case when p_food is not null then least(1, greatest(0, p_food)) else bowl_food_level end,
      bowl_water_level = case when p_water is not null then least(1, greatest(0, p_water)) else bowl_water_level end,
      plate_meat_level = case when p_meat is not null then least(1, greatest(0, p_meat)) else plate_meat_level end
  where id = 'global';
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.moemew_get_state() to anon, authenticated;
grant execute on function public.moemew_interact(text, text, text, text) to anon, authenticated;
grant execute on function public.moemew_sync_bowls(numeric, numeric, numeric) to anon, authenticated;

/**
 * MoeMew GitHub Pages 静态部署与全站实时同步配置 (js/config.js)
 *
 * 【推荐 · Supabase 免费版全站实时同步（无需部署后端代码，国内可直连，刷新永不丢）】
 * 1. 登录 https://supabase.com 创建免费项目；
 * 2. 打开 SQL Editor，粘贴运行 extras/supabase-setup.sql；
 * 3. 在 Project Settings -> API 复制 Project URL 与 anon public key 填入下方两项，推送即可全网互通！
 *
 * 【备选 · Cloudflare Workers 同步】
 * 若改用 extras/cloudflare-worker.js，将 Worker URL 填入 syncEndpoint 即可（与 Supabase 二选一）。
 *
 * 【未配置时】
 * 自动降级为本机多标签页持久模式（localStorage + sessionStorage + window.name 三级防丢失兜底），
 * 并支持一键「分享现场」链接发给好友接力互动。
 */
window.MOEMEW_CONFIG = {
  supabaseUrl: "https://tlkaxgpqwnllghdibooe.supabase.co",
  supabaseAnonKey: "sb_publishable_A_NXSQlxk0k2CmnBU_6mcw_jHUjyTLT",
  syncEndpoint: ""
};

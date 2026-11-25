/**
 * MoeMew GitHub Pages 静态部署配置 (js/config.js)
 *
 * 默认留空 syncEndpoint 即可直接部署在 GitHub Pages 纯静态运行：
 * - 自动通过公网 IP 接口识别脱敏访客 IP 与专属萌系昵称
 * - 同设备多标签页实时同步 + 支持一键生成「共享现场链接」发给好友触发吃饱拒食
 * - 支持「模拟异地访客喂饱」随时体验拒食与饱嗝动画
 *
 * 【进阶可选】若希望全站所有陌生访客无需分享链接也能自动实时互通：
 * 可将 extras/cloudflare-worker.js 粘贴到免费 Cloudflare Workers，
 * 再把生成的地址填入下方 syncEndpoint（例如 "https://moemew-sync.xxx.workers.dev"），
 * GitHub Pages 前端会自动无缝升级为全站实时同步，依然零传统数据库！
 */
window.MOEMEW_CONFIG = {
  syncEndpoint: ""
};

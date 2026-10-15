/* Supabase 配置（协作模式用）
 *
 * 1. 打开 https://supabase.com 免费建一个项目（2 分钟）
 * 2. Project Settings → API → 把 Project URL 和 anon public key 抄到下面
 * 3. SQL Editor 里执行项目根目录的 supabase.sql（建表 + RLS + 开 Realtime）
 * 4. 重新打开页面，点「创建房间」即可
 *
 * anon key 本来就是设计成可以放在前端的，安全性靠 supabase.sql 里的 RLS 策略约束。
 */
window.LOL_CONFIG = {
  // 注意是项目 URL，不要带 /rest/v1/
  SUPABASE_URL: 'https://tkumltlyqlytgkdsgmfv.supabase.co',
  // 新版 UI 里叫 Publishable key（sb_publishable_ 开头），等价于以前的 anon key
  SUPABASE_ANON_KEY: 'sb_publishable_XazgujPt4C52TeYMl3ns8g_n2WAXM9J'
};

/** HUD styles, inside the HUD's shadow root so the page's CSS cannot reach them. Every class starts with `wl-`. Colors follow the brand guide. */
export const HUD_CSS = `
:host{all:initial}
.wl-hud{
  --wl-blue:#2563EB;--wl-blue-text:#5B8DEF;--wl-green:#22C55E;--wl-amber:#F4B400;--wl-orange:#F97316;--wl-red:#E63946;--wl-slate:#64748B;
  --wl-bg:#1F2126;--wl-raised:#2A2D33;--wl-line:#33373E;--wl-fg:#F5F6F8;--wl-muted:#A1A8B3;
  --wl-main:#FFFFFF;--wl-main-2:#F4F6F9;--wl-main-fg:#1F1F1F;--wl-main-muted:#64748B;--wl-main-line:#E5E8EC;--wl-main-link:#2563EB;
  position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;
  max-width:calc(100vw - 32px);color:var(--wl-fg);text-align:left;
  font:13px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wl-hud.wl-left{right:auto;left:16px;align-items:flex-start}
@media (prefers-color-scheme:dark){.wl-hud{--wl-main:#15171B;--wl-main-2:#1D2025;--wl-main-fg:#ECEEF1;--wl-main-muted:#98A1AD;--wl-main-line:#2A2E35;--wl-main-link:#6EA0FF}}
.wl-hud *,.wl-hud *::before,.wl-hud *::after{box-sizing:border-box}
.wl-hud button{font:inherit;color:inherit;background:none;border:0;margin:0;padding:0;cursor:pointer}
.wl-hud a{color:inherit;text-decoration:none}
.wl-hud :focus-visible{outline:2px solid var(--wl-blue-text);outline-offset:2px;border-radius:6px}
.wl-hud svg{display:block;flex:none}
.wl-mono{font-family:ui-monospace,SFMono-Regular,"Cascadia Code",Menlo,Consolas,monospace}

/* Health colors */
.wl-h-info{--wl-h:var(--wl-blue)}.wl-h-success{--wl-h:var(--wl-green)}.wl-h-opportunity{--wl-h:var(--wl-amber)}
.wl-h-warning{--wl-h:var(--wl-orange)}.wl-h-critical{--wl-h:var(--wl-red)}.wl-h-neutral{--wl-h:var(--wl-slate)}
.wl-dot{flex:none;width:12px;height:12px;border-radius:50%;background:var(--wl-h)}
.wl-dot-sm{width:7px;height:7px}
.wl-busy{animation:wl-pulse 1.1s ease-in-out infinite}
@keyframes wl-pulse{50%{box-shadow:0 0 0 5px color-mix(in srgb,var(--wl-h) 30%,transparent)}}
@media (prefers-reduced-motion:reduce){.wl-busy{animation:none}}
.wl-mark-dot{fill:var(--wl-h,var(--wl-blue))}

/* Card */
.wl-card{position:relative;width:460px;max-width:100%;padding:12px 16px 10px;border-radius:12px;background:var(--wl-bg);
  border:1px solid var(--wl-line);box-shadow:0 12px 40px rgba(0,0,0,.28),0 2px 6px rgba(0,0,0,.18)}
.wl-head{display:flex;align-items:center;gap:10px;min-width:0}
.wl-brand{font-weight:700;font-size:15px;letter-spacing:-.01em;white-space:nowrap}
.wl-req{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--wl-muted);font-size:13px}
.wl-pill{flex:none;min-width:42px;padding:2px 9px;border-radius:6px;font-size:12px;font-weight:650;text-align:center;color:#fff;
  font-variant-numeric:tabular-nums;background:var(--wl-p,var(--wl-slate))}
.wl-pill.wl-p-info{--wl-p:var(--wl-blue)}.wl-pill.wl-p-ok{--wl-p:#16A34A}.wl-pill.wl-p-warn{--wl-p:#EA580C}.wl-pill.wl-p-err{--wl-p:var(--wl-red)}
.wl-pill.wl-p-none{--wl-p:#4A505A;color:var(--wl-fg)}
.wl-iconbtn{display:grid;place-items:center;width:28px;height:28px;border-radius:7px;color:var(--wl-muted)}
.wl-iconbtn:hover{background:var(--wl-raised);color:var(--wl-fg)}
.wl-iconbtn.wl-on{color:var(--wl-fg)}
.wl-chev svg{transition:transform .15s}.wl-chev.wl-open svg{transform:rotate(180deg)}

.wl-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:10px 0 8px}
.wl-cell{position:relative}
.wl-metric{display:flex;flex-direction:column;width:100%;padding:4px 6px;margin:0 -6px;border-radius:8px;text-align:left}
.wl-metric:hover{background:var(--wl-raised)}
.wl-val{font-size:17px;font-weight:650;letter-spacing:-.01em;font-variant-numeric:tabular-nums;white-space:nowrap}
.wl-lbl{font-size:12px;color:var(--wl-muted)}
.wl-v-db{color:var(--wl-amber)}
.wl-bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:#3A3F47}
.wl-bar i{display:block;height:100%}
.wl-bar-lg{height:10px;border-radius:5px;background:var(--wl-main-2)}
.wl-c-server{background:var(--wl-blue)}.wl-c-db{background:var(--wl-amber)}.wl-c-render{background:var(--wl-green)}
.wl-c-other{background:var(--wl-slate);opacity:.55}.wl-c-error{background:var(--wl-red)}
.wl-foot{display:flex;align-items:center;gap:4px;margin-top:8px}
.wl-count{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:6px;color:var(--wl-muted);font-size:12.5px;white-space:nowrap}
.wl-count:hover{background:var(--wl-raised);color:var(--wl-fg)}
.wl-spacer{flex:1}

/* Hover cards */
.wl-tip{position:absolute;bottom:100%;left:-8px;z-index:2;width:248px;padding-bottom:12px;opacity:0;visibility:hidden;
  transform:translateY(4px);transition:opacity .12s,transform .12s,visibility .12s}
.wl-cell:nth-child(n+3) .wl-tip{left:auto;right:-8px}
.wl-cell:hover .wl-tip,.wl-cell:focus-within .wl-tip{opacity:1;visibility:visible;transform:none}
.wl-tip-body{padding:12px 14px;border-radius:10px;background:#17191D;border:1px solid var(--wl-line);box-shadow:0 10px 30px rgba(0,0,0,.35)}
.wl-tip h4{margin:0 0 2px;font-size:13px;font-weight:650}
.wl-tip-big{font-size:15px;font-weight:650;font-variant-numeric:tabular-nums}
.wl-tip-sub{color:var(--wl-muted);font-size:12px}
.wl-tip dl{display:grid;grid-template-columns:1fr auto;gap:3px 12px;margin:10px 0 0;font-size:12px}
.wl-tip dt{display:flex;align-items:center;gap:6px;color:var(--wl-muted)}
.wl-tip dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.wl-tip p{margin:8px 0 0;color:var(--wl-muted);font-size:12px}
.wl-tip .wl-bar{margin-top:10px}
.wl-key{width:8px;height:8px;border-radius:2px}
.wl-spark{display:flex;align-items:flex-end;gap:2px;height:36px;margin-top:10px;padding:0 2px;border-bottom:1px solid var(--wl-line)}
.wl-spark i{flex:1;max-width:10px;min-height:2px;border-radius:2px 2px 0 0;background:var(--wl-amber)}
.wl-link{display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:10px;font-size:12px;color:var(--wl-fg)}
.wl-link:hover{color:var(--wl-blue-text)}

/* Minimized */
.wl-mini{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--wl-bg);border:1px solid var(--wl-line);
  box-shadow:0 8px 24px rgba(0,0,0,.28)}
.wl-mini:hover{transform:scale(1.05)}
.wl-mini.wl-busy{animation:wl-pulse 1.1s ease-in-out infinite}

/* Panels: small, above the card. The full detail is the dashboard, in a new tab. */
.wl-panel{display:flex;flex-direction:column;width:560px;max-width:100%;max-height:min(560px,calc(100vh - 210px));margin-bottom:10px;
  border-radius:12px;overflow:hidden;border:1px solid var(--wl-line);background:var(--wl-main);color:var(--wl-main-fg);box-shadow:0 16px 48px rgba(0,0,0,.3)}
.wl-settings{width:380px}
.wl-panel-bar{display:flex;align-items:center;gap:10px;min-width:0;padding:10px 10px 10px 18px;border-bottom:1px solid var(--wl-main-line)}
.wl-panel-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:700}
.wl-panel-x{display:grid;place-items:center;width:28px;height:28px;border-radius:6px;color:var(--wl-main-muted)}
.wl-panel-x:hover{background:var(--wl-main-2);color:var(--wl-main-fg)}
.wl-body{flex:1;overflow:auto;padding:4px 18px 18px}
.wl-sum{flex:none;padding:0 18px 12px;border-bottom:1px solid var(--wl-main-line)}
.wl-page{flex:none;padding:0 18px 14px;border-top:1px solid var(--wl-main-line)}
.wl-page h3{margin:12px 0 8px;font-size:13px;font-weight:700}
.wl-more{display:inline-flex;align-items:center;gap:5px;margin-top:10px;font-size:12.5px;font-weight:600;color:var(--wl-main-link) !important}
.wl-more:hover{text-decoration:underline !important}
.wl-stats-sm .wl-stat{padding:8px 10px}.wl-stats-sm .wl-stat dd{font-size:14px}
.wl-stats.wl-stats-sm{grid-template-columns:repeat(4,minmax(0,1fr))}
span.wl-count{cursor:default}span.wl-count:hover{background:none;color:var(--wl-muted)}
.wl-meta{margin:12px 0 12px;color:var(--wl-main-muted);font-size:12px}
.wl-legend{display:flex;flex-wrap:wrap;gap:6px 18px;margin:10px 0 0;font-size:12px;color:var(--wl-main-muted)}
.wl-legend span{display:flex;align-items:center;gap:6px}
.wl-legend b{color:var(--wl-main-fg);font-weight:650}
.wl-legend .wl-dot{width:9px;height:9px}
.wl-body h3{margin:22px 0 10px;font-size:13px;font-weight:700}
.wl-body h3:first-child{margin-top:8px}
.wl-muted{color:var(--wl-main-muted)}
.wl-empty{padding:28px 0;color:var(--wl-main-muted);text-align:center}

.wl-wf{display:grid;grid-template-columns:minmax(120px,34%) 64px minmax(0,1fr);align-items:center;font-size:12px}
.wl-wf>*{min-height:24px;display:flex;align-items:center}
.wl-wf-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px}
.wl-wf-name a,.wl-wf-name>span{display:flex;min-width:0}
.wl-wf-head{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}.wl-wf-tail{flex:0 0 auto;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.wl-wf-name a{color:inherit;text-decoration:none}.wl-wf-name a:hover{text-decoration:underline}
.wl-wf-at{justify-content:flex-end;padding-right:12px;color:var(--wl-main-muted);font-variant-numeric:tabular-nums}
.wl-wf-track{position:relative;height:24px}
.wl-wf-track i{position:absolute;top:7px;height:10px;min-width:2px;border-radius:3px}
.wl-wf-axis{position:relative;height:18px;color:var(--wl-main-muted);font-size:10.5px;border-bottom:1px solid var(--wl-main-line)}
.wl-wf-axis span{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}
.wl-wf-axis span:first-child{transform:none}
.wl-wf-grid{position:absolute;top:0;bottom:0;width:1px;background:var(--wl-main-line)}
.wl-k-browser{background:#94A3B8}.wl-k-render{background:var(--wl-green)}.wl-k-error{background:var(--wl-red)}

.wl-table{width:100%;border-collapse:collapse;font-size:12px}
.wl-table th{padding:6px 8px;border-bottom:1px solid var(--wl-main-line);color:var(--wl-main-muted);font-weight:600;text-align:left;white-space:nowrap}
.wl-table td{padding:7px 8px;border-bottom:1px solid var(--wl-main-line);vertical-align:top}
.wl-table .wl-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.wl-table .wl-wrap{word-break:break-all}
.wl-table tr.wl-sel td{background:color-mix(in srgb,var(--wl-blue) 10%,transparent)}
.wl-table tbody tr.wl-click{cursor:pointer}
.wl-table tbody tr.wl-click:hover td{background:var(--wl-main-2)}
.wl-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin:0}
.wl-stat{padding:10px 12px;border:1px solid var(--wl-main-line);border-radius:9px}
.wl-stat dt{color:var(--wl-main-muted);font-size:11.5px}
.wl-stat dd{margin:2px 0 0;font-size:16px;font-weight:650;font-variant-numeric:tabular-nums}
.wl-good{color:#16A34A}.wl-fair{color:#D97706}.wl-poor{color:var(--wl-red)}
.wl-sql{margin:0;padding:8px 10px;border-radius:7px;background:var(--wl-main-2);font-size:11.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;
  display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.wl-q{padding:10px 0;border-bottom:1px solid var(--wl-main-line)}
.wl-q-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px}
.wl-badge{padding:0 6px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.03em;line-height:17px;text-transform:uppercase;
  color:#9A6700;background:color-mix(in srgb,var(--wl-amber) 22%,transparent)}
.wl-badge.wl-b-error{color:var(--wl-red);background:color-mix(in srgb,var(--wl-red) 14%,transparent)}
.wl-badge.wl-b-warning{color:#C2410C;background:color-mix(in srgb,var(--wl-orange) 16%,transparent)}
.wl-finding{display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;align-items:center;padding:10px 12px;margin-bottom:8px;
  border:1px solid var(--wl-main-line);border-left:3px solid var(--wl-amber);border-radius:8px}
.wl-finding.wl-f-error{border-left-color:var(--wl-red)}
.wl-finding.wl-f-warning{border-left-color:var(--wl-orange)}
.wl-finding code{grid-column:1/-1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--wl-main-muted);font-size:11.5px}
.wl-lvl{display:inline-block;min-width:42px;padding:0 4px;border-radius:4px;font-size:10px;font-weight:700;text-align:center;text-transform:uppercase;line-height:17px;
  background:var(--wl-main-2);color:var(--wl-main-muted)}
.wl-lvl-warn{color:#C2410C;background:color-mix(in srgb,var(--wl-orange) 16%,transparent)}
.wl-lvl-error,.wl-lvl-critical{color:var(--wl-red);background:color-mix(in srgb,var(--wl-red) 14%,transparent)}
.wl-row-btns{display:flex;flex-wrap:wrap;gap:8px}
.wl-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:7px;border:1px solid var(--wl-main-line) !important;color:var(--wl-main-fg) !important;font-size:12.5px}
.wl-btn:hover{background:var(--wl-main-2) !important}
.wl-switch{display:flex;align-items:center;gap:10px;padding:12px 0 8px;font-size:13px;cursor:pointer}
.wl-switch input{width:16px;height:16px;accent-color:var(--wl-blue)}
.wl-kv{display:grid;grid-template-columns:100px 1fr;gap:6px 12px;margin:8px 0 16px;font-size:12.5px}
.wl-kv dt{color:var(--wl-main-muted)}.wl-kv dd{margin:0;min-width:0;word-break:break-all}

@media (max-width:480px){.wl-stats.wl-stats-sm{grid-template-columns:repeat(2,minmax(0,1fr))}.wl-body{padding:4px 14px 14px}.wl-sum,.wl-page{padding-left:14px;padding-right:14px}}
@media (max-width:480px){.wl-val{font-size:15px}.wl-card{padding:10px 12px 8px}.wl-req{display:none}}
`;

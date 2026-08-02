var _=(function(k){"use strict";const f="privaseer-privacy-toast",D="privaseer-toast-styles";let o=null,n=null,A=!1;function O(i){switch(i){case"high":return"#ef4444";case"medium":return"#f59e0b";case"low":return"#10b981"}}function M(i){switch(i){case"high":return"High Risk";case"medium":return"Medium";case"low":return"Low Risk"}}function F(i){switch(i){case"email":return"email address";case"location":return"location data";case"behavioral":return"browsing behavior";case"fingerprint":return"browser fingerprint";case"advertising":return"ad tracking data";case"social":return"social activity";case"unknown":return"personal data"}}function B(){if(A)return;const i=document.createElement("style");i.id=D,i.textContent=`
    @keyframes pvSlideIn {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pvSlideOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(16px); }
    }

    #${f} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 380px;
      max-width: calc(100vw - 48px);
      background: #1e1e2e;
      color: #cdd6f4;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      z-index: 2147483646;
      animation: pvSlideIn 0.3s ease-out;
      overflow: hidden;
    }
    #${f}.privaseer-dismissing {
      animation: pvSlideOut 0.25s ease-in forwards;
    }
    #${f} * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* ── Header ── */
    .pv-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 18px 20px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .pv-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .pv-header-text {
      flex: 1;
      min-width: 0;
    }
    .pv-title {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.2px;
    }
    .pv-subtitle {
      font-size: 11px;
      color: #585b70;
      margin-top: 2px;
    }
    .pv-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 20px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .pv-close {
      width: 28px;
      height: 28px;
      border: none;
      background: none;
      color: #585b70;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-radius: 8px;
      transition: all 0.15s;
    }
    .pv-close:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #cdd6f4;
    }

    /* ── Body ── */
    .pv-body {
      padding: 16px 20px 14px;
    }
    .pv-collector {
      font-size: 14px;
      font-weight: 700;
      color: #cdd6f4;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pv-collector-favicon {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .pv-detail {
      font-size: 13px;
      color: #a6adc8;
      line-height: 1.6;
      margin-bottom: 10px;
    }
    .pv-detail strong {
      color: #cdd6f4;
      font-weight: 600;
    }
    .pv-tip {
      font-size: 12px;
      color: #585b70;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      border-left: 3px solid;
    }

    /* ── Actions ── */
    .pv-actions {
      display: flex;
      gap: 8px;
      padding: 4px 20px 18px;
    }
    .pv-btn {
      padding: 9px 18px;
      border: none;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .pv-btn:hover {
      filter: brightness(1.1);
    }
    .pv-btn-primary {
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: #fff;
      box-shadow: 0 2px 10px rgba(102, 126, 234, 0.25);
    }
    .pv-btn-primary:hover {
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.35);
      transform: translateY(-1px);
    }
    .pv-btn-secondary {
      background: rgba(255, 255, 255, 0.07);
      color: #bac2de;
    }
    .pv-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.11);
    }
    .pv-btn-ghost {
      background: none;
      color: #585b70;
      padding: 9px 14px;
    }
    .pv-btn-ghost:hover {
      color: #a6adc8;
    }

    /* ── Alternatives Panel ── */
    .pv-alts {
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      transition: max-height 0.35s ease, opacity 0.25s ease, padding 0.35s ease;
      padding: 0 20px;
      border-top: 0px solid transparent;
    }
    .pv-alts.pv-open {
      max-height: 320px;
      opacity: 1;
      padding: 14px 20px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    .pv-alts-label {
      font-size: 10px;
      font-weight: 700;
      color: #585b70;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 10px;
    }
    .pv-alt {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.03);
      margin-bottom: 6px;
      transition: background 0.15s;
    }
    .pv-alt:last-child {
      margin-bottom: 0;
    }
    .pv-alt:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .pv-alt-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea, #764ba2);
      flex-shrink: 0;
    }
    .pv-alt-info {
      flex: 1;
      min-width: 0;
    }
    .pv-alt-name {
      font-size: 13px;
      font-weight: 600;
      color: #cdd6f4;
    }
    .pv-alt-desc {
      font-size: 11px;
      color: #585b70;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pv-alt-go {
      padding: 6px 14px;
      border: none;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      background: rgba(102, 126, 234, 0.12);
      color: #667eea;
      transition: all 0.15s;
      font-family: inherit;
      flex-shrink: 0;
    }
    .pv-alt-go:hover {
      background: rgba(102, 126, 234, 0.22);
    }

    /* ── Progress ── */
    .pv-progress {
      height: 2px;
      background: rgba(255, 255, 255, 0.04);
    }
    .pv-progress-bar {
      height: 100%;
      width: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      transition: width 0.1s linear;
    }
  `,document.head.appendChild(i),A=!0}function $(){return'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'}function P(){return'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}function g(){if(!o)return;n&&(clearTimeout(n),n=null),o.classList.add("privaseer-dismissing");const i=o;setTimeout(()=>{i.remove(),o===i&&(o=null)},250)}function T(i){B(),o&&(o.remove(),o=null,n&&(clearTimeout(n),n=null));const e=O(i.riskLevel),t=M(i.riskLevel),r=F(i.dataType),a=i.alternatives.length>0,s=`https://www.google.com/s2/favicons?domain=${encodeURIComponent(i.collectorName)}&sz=32`,l=i.riskLevel==="high"?"We recommend switching to a privacy-friendly alternative.":a?"Privacy-friendly alternatives are available below.":"Privaseer is keeping you informed about data collection.",c=document.createElement("div");c.id=f,c.setAttribute("role","alert"),c.setAttribute("aria-live","assertive"),c.innerHTML=`
    <div class="pv-header">
      <div class="pv-icon">${$()}</div>
      <div class="pv-header-text">
        <div class="pv-title">Privacy Alert</div>
        <div class="pv-subtitle">Data collection detected</div>
      </div>
      <span class="pv-badge" style="background:${e}18;color:${e};">${t}</span>
      <button class="pv-close" aria-label="Close">${P()}</button>
    </div>

    <div class="pv-body">
      <div class="pv-collector">
        <img class="pv-collector-favicon" src="${s}" alt="" onerror="this.style.display='none'"/>
        ${b(i.collectorName)}
      </div>
      <div class="pv-detail">
        This site is collecting your <strong>${r}</strong>. Your data may be shared with third-party trackers.
      </div>
      <div class="pv-tip" style="border-color: ${e};">
        ${l}
      </div>
    </div>

    <div class="pv-actions">
      ${a?'<button class="pv-btn pv-btn-primary" data-action="alternatives">View Alternatives</button>':""}
      ${i.showBurnerEmail?'<button class="pv-btn pv-btn-secondary" data-action="burner">Use Burner Email</button>':""}
      <button class="pv-btn pv-btn-ghost" data-action="dismiss">Dismiss</button>
    </div>

    ${a?`<div class="pv-alts" id="pv-alts-panel">
      <div class="pv-alts-label">Privacy-friendly alternatives</div>
      ${i.alternatives.map(d=>`
        <div class="pv-alt">
          <div class="pv-alt-dot"></div>
          <div class="pv-alt-info">
            <div class="pv-alt-name">${b(d.name)}</div>
            <div class="pv-alt-desc">${b(d.description)}</div>
          </div>
          <button class="pv-alt-go" data-url="${b(d.url)}">Visit</button>
        </div>
      `).join("")}
    </div>`:""}

    <div class="pv-progress"><div class="pv-progress-bar" id="pv-progress"></div></div>
  `,document.body.appendChild(c),o=c,c.querySelector(".pv-close")?.addEventListener("click",d=>{d.stopPropagation(),g()}),c.querySelectorAll(".pv-btn").forEach(d=>d.addEventListener("click",v=>{v.stopPropagation(),R(v.currentTarget.dataset.action)})),c.querySelectorAll(".pv-alt-go").forEach(d=>d.addEventListener("click",v=>{v.stopPropagation();const I=v.currentTarget.dataset.url;I&&window.open(I,"_blank","noopener,noreferrer")})),C()}function C(){const i=document.getElementById("pv-progress"),e=Date.now();function t(){const r=Math.max(0,1-(Date.now()-e)/1e4);i&&(i.style.width=`${r*100}%`),r>0&&o&&requestAnimationFrame(t)}requestAnimationFrame(t),n=setTimeout(g,1e4)}function R(i){switch(i){case"alternatives":{const e=document.getElementById("pv-alts-panel");e&&e.classList.toggle("pv-open")&&n&&(clearTimeout(n),n=null);break}case"burner":{const e=document.querySelector('input[type="email"], input[name*="email" i], input[autocomplete="email"]');e&&(e.focus(),e.scrollIntoView({behavior:"smooth",block:"center"})),g();break}case"dismiss":g();break}}function b(i){const e=document.createElement("div");return e.textContent=i,e.innerHTML}function N(){return o!==null}function z(i){if(i)try{let e=i;return e=e.replace(/[A-Z]:\\[^\s:)]+/g,t=>{const r=t.split("\\");return r[r.length-1]||"[file]"}),e=e.replace(/\/(?:home|usr|opt|var|Users)\/[^\s:)]+/g,t=>{const r=t.split("/");return r[r.length-1]||"[file]"}),e=e.replace(/chrome-extension:\/\/[a-z]+\/([^\s:)]+)/g,"ext:/$1"),e=e.replace(/(?:file:\/\/|\/)[^\s:)]*\//g,""),e}catch{return"[stack trace unavailable]"}}const U={ONE_WEEK_MS:10080*60*1e3},E=500,j=U.ONE_WEEK_MS,S="privaseer_logs";class Y{isDevelopment=!1;logBuffer=[];flushTimer=null;initialized=!1;initializing=!1;initPromise=null;async ensureInitialized(){if(!this.initialized){if(this.initializing&&this.initPromise)return this.initPromise;this.initializing=!0,this.initPromise=this.performInitialization(),await this.initPromise}}async performInitialization(){try{await this.loadLogs(),await this.cleanup(),this.initialized=!0}catch{this.initialized=!0}finally{this.initializing=!1}}async loadLogs(){try{const t=(await chrome.storage.local.get(S))[S];t?.logs&&(this.logBuffer=t.logs.slice(-E))}catch{}}async saveLogs(){try{if(!chrome?.runtime?.id)return;const e={logs:this.logBuffer.slice(-E),lastCleanup:Date.now()};await chrome.storage.local.set({[S]:e})}catch{}}async cleanup(){const e=Date.now()-j;this.logBuffer=this.logBuffer.filter(t=>t.timestamp>e),await this.saveLogs()}scheduleFlush(){this.flushTimer&&clearTimeout(this.flushTimer),this.flushTimer=setTimeout(()=>{this.saveLogs(),this.flushTimer=null},5e3)}createLogEntry(e,t,r,a,s){const l={timestamp:Date.now(),level:e,category:t,message:r};return a!==void 0&&(l.data=a),s instanceof Error&&(l.error=s.message,l.stack=z(s.stack)),l}writeLog(e){if(this.ensureInitialized().catch(()=>{}),this.logBuffer.push(e),this.logBuffer.length>E&&this.logBuffer.shift(),this.scheduleFlush(),this.isDevelopment){const t=new Date(e.timestamp).toISOString(),r=`[Privaseer ${e.level.toUpperCase()}] [${e.category}] ${t}`;switch(e.level){case"debug":console.debug(r,e.message,e.data||"");break;case"info":console.log(r,e.message,e.data||"");break;case"warn":console.warn(r,e.message,e.data||"");break;case"error":console.error(r,e.message,e.error||"",z(e.stack)||"");break}}}debug(e,t,r){const a=this.createLogEntry("debug",e,t,r);this.writeLog(a)}info(e,t,r){const a=this.createLogEntry("info",e,t,r);this.writeLog(a)}warn(e,t,r){const a=this.createLogEntry("warn",e,t,r);this.writeLog(a)}error(e,t,r,a){const s=r instanceof Error?r:void 0,l=this.createLogEntry("error",e,t,a,s);this.writeLog(l)}async getLogs(e,t,r=100){await this.ensureInitialized();let a=[...this.logBuffer];return e&&(a=a.filter(s=>s.level===e)),t&&(a=a.filter(s=>s.category===t)),a.slice(-r).reverse()}async clearLogs(){await this.ensureInitialized(),this.logBuffer=[],await this.saveLogs(),this.info("Logger","Logs cleared")}async exportLogs(){return await this.ensureInitialized(),JSON.stringify({exportDate:new Date().toISOString(),version:"1.0.0",logs:this.logBuffer},null,2)}getStats(){const e={total:this.logBuffer.length,byLevel:{debug:0,info:0,warn:0,error:0}};for(const t of this.logBuffer)e.byLevel[t.level]++;return e}}const h=new Y;function q(i){return i instanceof Error}function y(i){if(q(i))return i;if(typeof i=="string")return new Error(i);if(typeof i=="object"&&i!==null){const e=i;if("message"in e&&typeof e.message=="string")return new Error(e.message)}return new Error(String(i))}const V=3e4,H=3e3,W=5e3;let w=0,m=[],p=null,u=null,x=!1;class G{initialized=!1;mutationObserver=null;async initialize(){if(!this.initialized)try{this.setupMessageListener(),this.setupEmailFieldDetection(),this.scanForExistingEmailFields(),this.checkCurrentSite(),this.initialized=!0,h.debug("PrivacyAdvisor","Initialized",{url:window.location.href})}catch(e){h.error("PrivacyAdvisor","Failed to initialize",y(e))}}setupMessageListener(){chrome.runtime.onMessage.addListener(e=>{if(e.type==="PRIVACY_ADVISOR_ALERT"){const t=e.data;this.handleTrackerDetected(t.trackerDomain,t.category)}})}handleTrackerDetected(e,t){m.push({domain:e,category:t}),p&&clearTimeout(p),p=setTimeout(()=>{this.showTrackerToast()},H)}async showTrackerToast(){if(m.length===0)return;if(!this.canShowToast()){m=[];return}const e=[...m];m=[];const t={fingerprinting:0,cryptomining:0,malware:0,advertising:1,social:1,beacons:1,analytics:2,unknown:3};e.sort((a,s)=>(t[a.category]??3)-(t[s.category]??3));const r=e[0];try{const a=await this.sendMessageWithRetry({type:"CLASSIFY_RISK",data:{domain:r.domain,category:r.category,trackerCount:e.length}});if(!a?.success)return;const s=this.pageHasEmailFields();T({collectorName:r.domain,dataType:a.dataType??"unknown",riskLevel:a.riskLevel??"low",domain:window.location.hostname,category:r.category,alternatives:a.alternatives??[],showBurnerEmail:s}),w=Date.now()}catch(a){h.error("PrivacyAdvisor","Failed to show tracker toast",y(a))}}async checkCurrentSite(){try{const e=window.location.hostname,t=await this.sendMessageWithRetry({type:"GET_ALTERNATIVES",data:{domain:e}});if(t?.success&&t.alternatives&&t.alternatives.length>0&&this.canShowToast()){const r=t.riskLevel??"low";T({collectorName:e,dataType:"behavioral",riskLevel:r==="low"?"medium":r,domain:e,category:"site",alternatives:t.alternatives,showBurnerEmail:this.pageHasEmailFields()}),w=Date.now()}}catch{h.debug("PrivacyAdvisor","Site check skipped — background not ready")}}setupEmailFieldDetection(){this.mutationObserver=new MutationObserver(()=>{u&&clearTimeout(u),u=setTimeout(()=>{this.scanForNewEmailFields()},W)}),this.mutationObserver.observe(document.body,{childList:!0,subtree:!0})}scanForExistingEmailFields(){document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i], input[autocomplete="email"]').length>0&&!x&&(x=!0)}scanForNewEmailFields(){if(x)return;document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i], input[autocomplete="email"]').length>0&&(x=!0,this.canShowToast()&&!N()&&this.showEmailFieldToast())}async showEmailFieldToast(){if(this.canShowToast())try{const e=window.location.hostname;let t=[];try{const r=await this.sendMessageWithRetry({type:"GET_ALTERNATIVES",data:{domain:e}});r?.success&&r.alternatives&&(t=r.alternatives)}catch{}T({collectorName:e,dataType:"email",riskLevel:"medium",domain:e,category:"email-collection",alternatives:t,showBurnerEmail:!0}),w=Date.now()}catch(e){h.error("PrivacyAdvisor","Failed to show email field toast",y(e))}}canShowToast(){return Date.now()-w>=V}pageHasEmailFields(){return document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i], input[autocomplete="email"]').length>0}async sendMessageWithRetry(e,t=2){let r=0;for(;r<=t;)try{return await chrome.runtime.sendMessage(e)}catch(a){const s=y(a);if(s.message.includes("Receiving end does not exist")&&r<t)r+=1,await new Promise(l=>setTimeout(l,500));else throw s}throw new Error("Failed to send message after max retries")}cleanup(){this.mutationObserver&&(this.mutationObserver.disconnect(),this.mutationObserver=null),p&&(clearTimeout(p),p=null),u&&(clearTimeout(u),u=null),g()}}const L=new G;return document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>L.initialize()):L.initialize(),k.privacyAdvisor=L,Object.defineProperty(k,Symbol.toStringTag,{value:"Module"}),k})({});

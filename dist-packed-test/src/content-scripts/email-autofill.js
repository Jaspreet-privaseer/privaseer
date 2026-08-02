var _=(function(c){"use strict";function h(r){if(r)try{let e=r;return e=e.replace(/[A-Z]:\\[^\s:)]+/g,t=>{const i=t.split("\\");return i[i.length-1]||"[file]"}),e=e.replace(/\/(?:home|usr|opt|var|Users)\/[^\s:)]+/g,t=>{const i=t.split("/");return i[i.length-1]||"[file]"}),e=e.replace(/chrome-extension:\/\/[a-z]+\/([^\s:)]+)/g,"ext:/$1"),e=e.replace(/(?:file:\/\/|\/)[^\s:)]*\//g,""),e}catch{return"[stack trace unavailable]"}}const p={ONE_WEEK_MS:10080*60*1e3},d=500,E=p.ONE_WEEK_MS,f="privaseer_logs";class b{isDevelopment=!1;logBuffer=[];flushTimer=null;initialized=!1;initializing=!1;initPromise=null;async ensureInitialized(){if(!this.initialized){if(this.initializing&&this.initPromise)return this.initPromise;this.initializing=!0,this.initPromise=this.performInitialization(),await this.initPromise}}async performInitialization(){try{await this.loadLogs(),await this.cleanup(),this.initialized=!0}catch{this.initialized=!0}finally{this.initializing=!1}}async loadLogs(){try{const t=(await chrome.storage.local.get(f))[f];t?.logs&&(this.logBuffer=t.logs.slice(-d))}catch{}}async saveLogs(){try{if(!chrome?.runtime?.id)return;const e={logs:this.logBuffer.slice(-d),lastCleanup:Date.now()};await chrome.storage.local.set({[f]:e})}catch{}}async cleanup(){const e=Date.now()-E;this.logBuffer=this.logBuffer.filter(t=>t.timestamp>e),await this.saveLogs()}scheduleFlush(){this.flushTimer&&clearTimeout(this.flushTimer),this.flushTimer=setTimeout(()=>{this.saveLogs(),this.flushTimer=null},5e3)}createLogEntry(e,t,i,n,o){const a={timestamp:Date.now(),level:e,category:t,message:i};return n!==void 0&&(a.data=n),o instanceof Error&&(a.error=o.message,a.stack=h(o.stack)),a}writeLog(e){if(this.ensureInitialized().catch(()=>{}),this.logBuffer.push(e),this.logBuffer.length>d&&this.logBuffer.shift(),this.scheduleFlush(),this.isDevelopment){const t=new Date(e.timestamp).toISOString(),i=`[Privaseer ${e.level.toUpperCase()}] [${e.category}] ${t}`;switch(e.level){case"debug":console.debug(i,e.message,e.data||"");break;case"info":console.log(i,e.message,e.data||"");break;case"warn":console.warn(i,e.message,e.data||"");break;case"error":console.error(i,e.message,e.error||"",h(e.stack)||"");break}}}debug(e,t,i){const n=this.createLogEntry("debug",e,t,i);this.writeLog(n)}info(e,t,i){const n=this.createLogEntry("info",e,t,i);this.writeLog(n)}warn(e,t,i){const n=this.createLogEntry("warn",e,t,i);this.writeLog(n)}error(e,t,i,n){const o=i instanceof Error?i:void 0,a=this.createLogEntry("error",e,t,n,o);this.writeLog(a)}async getLogs(e,t,i=100){await this.ensureInitialized();let n=[...this.logBuffer];return e&&(n=n.filter(o=>o.level===e)),t&&(n=n.filter(o=>o.category===t)),n.slice(-i).reverse()}async clearLogs(){await this.ensureInitialized(),this.logBuffer=[],await this.saveLogs(),this.info("Logger","Logs cleared")}async exportLogs(){return await this.ensureInitialized(),JSON.stringify({exportDate:new Date().toISOString(),version:"1.0.0",logs:this.logBuffer},null,2)}getStats(){const e={total:this.logBuffer.length,byLevel:{debug:0,info:0,warn:0,error:0}};for(const t of this.logBuffer)e.byLevel[t.level]++;return e}}const s=new b;function w(r){return r instanceof Error}function l(r){if(w(r))return r;if(typeof r=="string")return new Error(r);if(typeof r=="object"&&r!==null){const e=r;if("message"in e&&typeof e.message=="string")return new Error(e.message)}return new Error(String(r))}function y(r){if(!r)return null;try{const e=new URL(r);return`${e.protocol}//${e.hostname}${e.pathname}`}catch{return null}}class m{isProcessing=!1;burnerEmailButton=null;isEnabled=!1;focusinHandler=null;focusoutHandler=null;mutationObserver=null;async initialize(){try{const e=await this.checkIfEnabled();this.isEnabled=e,this.isEnabled&&this.setupInputDetection(),this.setupSettingListener(),s.debug("EmailAutofill","Initialized successfully",{url:window.location.href,enabled:this.isEnabled})}catch(e){s.error("EmailAutofill","Failed to initialize",l(e))}}async checkIfEnabled(){try{const e=await chrome.runtime.sendMessage({type:"GET_BURNER_EMAIL_SETTING"});return e?.success&&e?.enabled===!0}catch(e){return s.error("EmailAutofill","Failed to check if enabled",l(e)),!1}}setupSettingListener(){chrome.runtime.onMessage.addListener(e=>{if(e.type==="BURNER_EMAIL_SETTING_CHANGED"){const t=e.data?.enabled===!0;s.debug("EmailAutofill","Setting changed",{enabled:t}),t&&!this.isEnabled?this.enable():!t&&this.isEnabled&&this.disable()}})}enable(){this.isEnabled=!0,this.setupInputDetection(),s.info("EmailAutofill","Burner email feature enabled")}disable(){this.isEnabled=!1,this.cleanup(),s.info("EmailAutofill","Burner email feature disabled")}setupInputDetection(){this.focusinHandler||this.focusoutHandler||(this.focusinHandler=e=>{if(!this.isEnabled)return;const t=e.target;this.isEmailInput(t)&&this.showBurnerEmailButton(t)},this.focusoutHandler=e=>{if(!this.isEnabled)return;const t=e.target;this.isEmailInput(t)&&setTimeout(()=>{const i=e.relatedTarget;i!==this.burnerEmailButton&&!this.burnerEmailButton?.contains(i)&&this.hideBurnerEmailButton()},200)},document.addEventListener("focusin",this.focusinHandler),document.addEventListener("focusout",this.focusoutHandler),this.mutationObserver=new MutationObserver(()=>{this.isEnabled&&this.detectNewEmailInputs()}),this.mutationObserver.observe(document.body,{childList:!0,subtree:!0}),s.debug("EmailAutofill","Input detection setup complete"))}cleanup(){this.focusinHandler&&(document.removeEventListener("focusin",this.focusinHandler),this.focusinHandler=null),this.focusoutHandler&&(document.removeEventListener("focusout",this.focusoutHandler),this.focusoutHandler=null),this.mutationObserver&&(this.mutationObserver.disconnect(),this.mutationObserver=null),this.hideBurnerEmailButton(),s.debug("EmailAutofill","Cleanup complete")}isEmailInput(e){if(!(e instanceof HTMLInputElement))return!1;const t=e.type?.toLowerCase(),i=e.name?.toLowerCase(),n=e.id?.toLowerCase(),o=e.placeholder?.toLowerCase(),a=e.autocomplete?.toLowerCase();return t==="email"||a==="email"||i?.includes("email")||n?.includes("email")||o?.includes("email")||o?.includes("e-mail")}detectNewEmailInputs(){document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]').forEach(t=>{t instanceof HTMLInputElement&&!t.dataset.burnerEmailReady&&(t.dataset.burnerEmailReady="true")})}showBurnerEmailButton(e){this.burnerEmailButton&&this.hideBurnerEmailButton();const t=document.createElement("div");t.id="privaseer-burner-email-btn",t.setAttribute("role","button"),t.setAttribute("aria-label","Generate burner email address"),t.setAttribute("tabindex","0"),t.innerHTML=`
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
        <path d="M12 13l-8 5"></path>
        <path d="M12 13l8 5"></path>
      </svg>
      <span>Generate Burner Email</span>
    `,t.style.cssText=`
      position: absolute;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      transition: all 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `,t.addEventListener("mouseenter",()=>{t.style.transform="translateY(-2px)",t.style.boxShadow="0 6px 16px rgba(102, 126, 234, 0.5)"}),t.addEventListener("mouseleave",()=>{t.style.transform="translateY(0)",t.style.boxShadow="0 4px 12px rgba(102, 126, 234, 0.4)"}),t.addEventListener("mousedown",i=>{i.preventDefault(),i.stopPropagation()}),t.addEventListener("click",async i=>{i.preventDefault(),i.stopPropagation(),t.style.opacity="0.6",t.style.pointerEvents="none",await this.generateAndFillBurnerEmail(e)}),t.addEventListener("keydown",async i=>{i.key!=="Enter"&&i.key!==" "||(i.preventDefault(),i.stopPropagation(),t.style.pointerEvents!=="none"&&(t.style.opacity="0.6",t.style.pointerEvents="none",await this.generateAndFillBurnerEmail(e)))}),this.positionButton(t,e),document.body.appendChild(t),this.burnerEmailButton=t}positionButton(e,t){const i=t.getBoundingClientRect(),n=window.scrollY||window.pageYOffset,o=window.scrollX||window.pageXOffset;e.style.top=`${i.bottom+n+8}px`,e.style.left=`${i.left+o}px`}hideBurnerEmailButton(){this.burnerEmailButton&&(this.burnerEmailButton.remove(),this.burnerEmailButton=null)}async generateAndFillBurnerEmail(e){if(this.isProcessing){s.debug("EmailAutofill","Already processing, ignoring click");return}this.isProcessing=!0,s.debug("EmailAutofill","Starting burner email generation");try{const t=new URL(window.location.href).hostname;if(s.debug("EmailAutofill","Domain:",{domain:t}),!chrome?.runtime?.id)throw s.error("EmailAutofill","Extension context invalidated"),new Error("Extension context invalidated - please reload the page");s.debug("EmailAutofill","Sending message to background",{domain:t});let i,n=0;const o=2;for(;n<=o;)try{s.debug("EmailAutofill",`Sending GENERATE_BURNER_EMAIL message (attempt ${n+1}/${o+1})`);const a=y(window.location.href);i=await chrome.runtime.sendMessage({type:"GENERATE_BURNER_EMAIL",data:{domain:t,...a&&{url:a}}}),s.debug("EmailAutofill","Response received from background",{response:i});break}catch(a){const u=l(a);if(s.error("EmailAutofill","Message send error",u,{errorMessage:u.message}),u.message.includes("Receiving end does not exist")&&n<o)s.debug("EmailAutofill","Service worker asleep, retrying in 500ms..."),n++,await new Promise(v=>setTimeout(v,500));else throw u}if(s.debug("EmailAutofill","Final response from background",{response:i}),i&&i.success&&i.email)e.value=i.email,e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0})),this.showSuccessNotification(i.email),this.hideBurnerEmailButton(),s.info("EmailAutofill","Burner email generated and filled",{domain:t,email:i.email});else{const a=i?.error||"Failed to generate burner email";s.error("EmailAutofill","Generation failed",new Error(a)),this.showErrorNotification(a),this.hideBurnerEmailButton()}}catch(t){const i=l(t);s.error("EmailAutofill","Failed to generate burner email",i),i.message.includes("Extension context invalidated")?this.showErrorNotification("Please reload the page to use burner emails"):i.message.includes("Receiving end does not exist")?this.showErrorNotification("Extension not ready - please try again"):this.showErrorNotification("Could not generate burner email"),this.hideBurnerEmailButton()}finally{this.isProcessing=!1}}showSuccessNotification(e){const t=document.createElement("div");t.setAttribute("role","alert"),t.setAttribute("aria-live","assertive"),t.setAttribute("aria-atomic","true"),t.innerHTML=`
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <div>
          <div style="font-weight: 600; margin-bottom: 2px;">Burner Email Created</div>
          <div style="font-size: 12px; opacity: 0.9;">${e}</div>
        </div>
      </div>
    `,t.style.cssText=`
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 8px;
      font-size: 14px;
      z-index: 9999999;
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
      animation: slideInRight 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `,document.body.appendChild(t),setTimeout(()=>{t.style.animation="slideOutRight 0.3s ease",setTimeout(()=>t.remove(),300)},3e3)}showErrorNotification(e){const t=document.createElement("div");t.setAttribute("role","alert"),t.setAttribute("aria-live","assertive"),t.setAttribute("aria-atomic","true"),t.innerHTML=`
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>${e}</div>
      </div>
    `,t.style.cssText=`
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 20px;
      background: #ef4444;
      color: white;
      border-radius: 8px;
      font-size: 14px;
      z-index: 9999999;
      box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4);
      animation: slideInRight 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `,document.body.appendChild(t),setTimeout(()=>{t.style.animation="slideOutRight 0.3s ease",setTimeout(()=>t.remove(),300)},3e3)}}const g=new m;return document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>g.initialize()):g.initialize(),c.EmailAutofill=m,Object.defineProperty(c,Symbol.toStringTag,{value:"Module"}),c})({});

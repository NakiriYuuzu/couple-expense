import{Ft as e,J as t,Lt as n,X as r,Z as i}from"./supabase-CSTO7vps.js";var a=n(e(((e,t)=>{(function(n,r){typeof e==`object`&&t!==void 0?t.exports=r():typeof define==`function`&&define.amd?define(r):(n||=self,n.PullToRefresh=r())})(e,function(){var e={pullStartY:null,pullMoveY:null,handlers:[],styleEl:null,events:null,dist:0,state:`pending`,timeout:null,distResisted:0,supportsPassive:!1,supportsPointerEvents:typeof window<`u`&&!!window.PointerEvent};try{window.addEventListener(`test`,null,{get passive(){e.supportsPassive=!0}})}catch{}function t(t){if(!t.ptrElement){var n=document.createElement(`div`);t.mainElement===document.body?document.body.insertBefore(n,document.body.firstChild):t.mainElement.parentNode.insertBefore(n,t.mainElement),n.classList.add(t.classPrefix+`ptr`),n.innerHTML=t.getMarkup().replace(/__PREFIX__/g,t.classPrefix),t.ptrElement=n,typeof t.onInit==`function`&&t.onInit(t),e.styleEl||(e.styleEl=document.createElement(`style`),e.styleEl.setAttribute(`id`,`pull-to-refresh-js-style`),document.head.appendChild(e.styleEl)),e.styleEl.textContent=t.getStyles().replace(/__PREFIX__/g,t.classPrefix).replace(/\s+/g,` `)}return t}function n(t){t.ptrElement&&(t.ptrElement.classList.remove(t.classPrefix+`refresh`),t.ptrElement.style[t.cssProp]=`0px`,setTimeout(function(){t.ptrElement&&t.ptrElement.parentNode&&(t.ptrElement.parentNode.removeChild(t.ptrElement),t.ptrElement=null),e.state=`pending`},t.refreshTimeout))}function r(t){var n=t.ptrElement.querySelector(`.`+t.classPrefix+`icon`),r=t.ptrElement.querySelector(`.`+t.classPrefix+`text`);n&&(e.state===`refreshing`?n.innerHTML=t.iconRefreshing:n.innerHTML=t.iconArrow),r&&(e.state===`releasing`&&(r.innerHTML=t.instructionsReleaseToRefresh),(e.state===`pulling`||e.state===`pending`)&&(r.innerHTML=t.instructionsPullToRefresh),e.state===`refreshing`&&(r.innerHTML=t.instructionsRefreshing))}var i={setupDOM:t,onReset:n,update:r},a,o=function(t){return e.pointerEventsEnabled&&e.supportsPointerEvents?t.screenY:t.touches[0].screenY},s=(function(){var t;function n(n){var r=e.handlers.filter(function(e){return e.contains(n.target)})[0];e.enable=!!r,r&&e.state===`pending`&&(t=i.setupDOM(r),r.shouldPullToRefresh()&&(e.pullStartY=o(n)),clearTimeout(e.timeout),i.update(r))}function r(n){if(t&&t.ptrElement&&e.enable){if(e.pullStartY?e.pullMoveY=o(n):t.shouldPullToRefresh()&&(e.pullStartY=o(n)),e.state===`refreshing`){n.cancelable&&t.shouldPullToRefresh()&&e.pullStartY<e.pullMoveY&&n.preventDefault();return}e.state===`pending`&&(t.ptrElement.classList.add(t.classPrefix+`pull`),e.state=`pulling`,i.update(t)),e.pullStartY&&e.pullMoveY&&(e.dist=e.pullMoveY-e.pullStartY),e.distExtra=e.dist-t.distIgnore,e.distExtra>0&&(n.cancelable&&n.preventDefault(),t.ptrElement.style[t.cssProp]=e.distResisted+`px`,e.distResisted=t.resistanceFunction(e.distExtra/t.distThreshold)*Math.min(t.distMax,e.distExtra),e.state===`pulling`&&e.distResisted>t.distThreshold&&(t.ptrElement.classList.add(t.classPrefix+`release`),e.state=`releasing`,i.update(t)),e.state===`releasing`&&e.distResisted<t.distThreshold&&(t.ptrElement.classList.remove(t.classPrefix+`release`),e.state=`pulling`,i.update(t)))}}function s(){if(t&&t.ptrElement&&e.enable){if(clearTimeout(a),a=setTimeout(function(){t&&t.ptrElement&&e.state===`pending`&&i.onReset(t)},500),e.state===`releasing`&&e.distResisted>t.distThreshold)e.state=`refreshing`,t.ptrElement.style[t.cssProp]=t.distReload+`px`,t.ptrElement.classList.add(t.classPrefix+`refresh`),e.timeout=setTimeout(function(){var e=t.onRefresh(function(){return i.onReset(t)});e&&typeof e.then==`function`&&e.then(function(){return i.onReset(t)}),!e&&!t.onRefresh.length&&i.onReset(t)},t.refreshTimeout);else{if(e.state===`refreshing`)return;t.ptrElement.style[t.cssProp]=`0px`,e.state=`pending`}i.update(t),t.ptrElement.classList.remove(t.classPrefix+`release`),t.ptrElement.classList.remove(t.classPrefix+`pull`),e.pullStartY=e.pullMoveY=null,e.dist=e.distResisted=0}}function c(){t&&t.mainElement.classList.toggle(t.classPrefix+`top`,t.shouldPullToRefresh())}var l=e.supportsPassive?{passive:e.passive||!1}:void 0;return e.pointerEventsEnabled&&e.supportsPointerEvents?(window.addEventListener(`pointerup`,s),window.addEventListener(`pointerdown`,n),window.addEventListener(`pointermove`,r,l)):(window.addEventListener(`touchend`,s),window.addEventListener(`touchstart`,n),window.addEventListener(`touchmove`,r,l)),window.addEventListener(`scroll`,c),{onTouchEnd:s,onTouchStart:n,onTouchMove:r,onScroll:c,destroy:function(){e.pointerEventsEnabled&&e.supportsPointerEvents?(window.removeEventListener(`pointerdown`,n),window.removeEventListener(`pointerup`,s),window.removeEventListener(`pointermove`,r,l)):(window.removeEventListener(`touchstart`,n),window.removeEventListener(`touchend`,s),window.removeEventListener(`touchmove`,r,l)),window.removeEventListener(`scroll`,c)}}}),c=`
<div class="__PREFIX__box">
  <div class="__PREFIX__content">
    <div class="__PREFIX__icon"></div>
    <div class="__PREFIX__text"></div>
  </div>
</div>
`,l=`
.__PREFIX__ptr {
  box-shadow: inset 0 -3px 5px rgba(0, 0, 0, 0.12);
  pointer-events: none;
  font-size: 0.85em;
  font-weight: bold;
  top: 0;
  height: 0;
  transition: height 0.3s, min-height 0.3s;
  text-align: center;
  width: 100%;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  align-content: stretch;
}

.__PREFIX__box {
  padding: 10px;
  flex-basis: 100%;
}

.__PREFIX__pull {
  transition: none;
}

.__PREFIX__text {
  margin-top: .33em;
  color: rgba(0, 0, 0, 0.3);
}

.__PREFIX__icon {
  color: rgba(0, 0, 0, 0.3);
  transition: transform .3s;
}

/*
When at the top of the page, disable vertical overscroll so passive touch
listeners can take over.
*/
.__PREFIX__top {
  touch-action: pan-x pan-down pinch-zoom;
}

.__PREFIX__release .__PREFIX__icon {
  transform: rotate(180deg);
}
`,u={distThreshold:60,distMax:80,distReload:50,distIgnore:0,mainElement:`body`,triggerElement:`body`,ptrElement:`.ptr`,classPrefix:`ptr--`,cssProp:`min-height`,iconArrow:`&#8675;`,iconRefreshing:`&hellip;`,instructionsPullToRefresh:`Pull down to refresh`,instructionsReleaseToRefresh:`Release to refresh`,instructionsRefreshing:`Refreshing`,refreshTimeout:500,getMarkup:function(){return c},getStyles:function(){return l},onInit:function(){},onRefresh:function(){return location.reload()},resistanceFunction:function(e){return Math.min(1,e/2.5)},shouldPullToRefresh:function(){return!window.scrollY}},d=[`mainElement`,`ptrElement`,`triggerElement`],f=(function(t){var n={};return Object.keys(u).forEach(function(e){n[e]=t[e]||u[e]}),n.refreshTimeout=typeof t.refreshTimeout==`number`?t.refreshTimeout:u.refreshTimeout,d.forEach(function(e){typeof n[e]==`string`&&(n[e]=document.querySelector(n[e]))}),e.events||=s(),n.contains=function(e){return n.triggerElement.contains(e)},n.destroy=function(){clearTimeout(e.timeout);var t=e.handlers.indexOf(n);e.handlers.splice(t,1)},n});return{setPassiveMode:function(t){e.passive=t},setPointerEventsMode:function(t){e.pointerEventsEnabled=t},destroyAll:function(){e.events&&=(e.events.destroy(),null),e.handlers.forEach(function(e){e.destroy()})},init:function(t){t===void 0&&(t={});var n=f(t);return e.handlers.push(n),n},_:{setupHandler:f,setupEvents:s,setupDOM:i.setupDOM,onReset:i.onReset,update:i.update}}})}))(),1);function o(e){let{onRefresh:n,selector:o,disabled:s=!1,mainElement:c}=e,l=null;return r(async()=>{if(s)return;await t();let e=`body`;c?e=c:o&&document.querySelector(o)&&(e=o),l=a.default.init({mainElement:e,onRefresh:async()=>{try{await n()}catch(e){console.error(`Refresh failed:`,e)}},distThreshold:60,distMax:80,distReload:50,distIgnore:10,resistanceFunction:e=>Math.min(1,e/2.5),iconArrow:`&#8675;`,iconRefreshing:`&hellip;`,instructionsPullToRefresh:`下拉刷新`,instructionsReleaseToRefresh:`鬆開刷新`,instructionsRefreshing:`正在刷新...`,shouldPullToRefresh:function(){let t=document.querySelector(e);return e===`body`||!t?window.scrollY===0:t.scrollTop===0},getMarkup:function(){return`                <div class="__PREFIX__box" style="pointer-events: none;">                    <div class="__PREFIX__content">                        <div class="__PREFIX__icon"></div>                        <div class="__PREFIX__text"></div>                    </div>                </div>`},classPrefix:`ptr--`,cssProp:`min-height`,getStyles:function(){return`                .__PREFIX__ptr {                    pointer-events: none;                    font-size: 0.85em;                    font-weight: bold;                    top: 0;                    height: 0;                    transition: height 0.3s, min-height 0.3s;                    text-align: center;                    width: 100%;                    overflow: hidden;                    display: flex;                    align-items: flex-end;                    align-content: stretch;                }                .__PREFIX__box {                    padding: 10px;                    flex-basis: 100%;                }                .__PREFIX__pull {                    transition: none;                }                .__PREFIX__text {                    margin-top: .33em;                    color: var(--brand-primary);                }                .__PREFIX__icon {                    color: var(--brand-primary);                    transition: transform .3s;                }                .__PREFIX__top {                    touch-action: pan-y;                }                .__PREFIX__release .__PREFIX__icon {                    transform: rotate(180deg);                }                `}})}),i(()=>{l&&=(l.destroy(),null)}),{destroy:()=>{l&&=(l.destroy(),null)}}}export{o as t};
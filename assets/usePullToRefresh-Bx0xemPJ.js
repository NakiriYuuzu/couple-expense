import{aA as e,aB as t,aC as n,aG as r,aN as i,aP as a,aQ as o,aR as s,aV as c,ay as l,az as u,bd as d,bg as f,n as p}from"./index-Dkwm6DWF.js";const m={class:`flex items-center justify-between`},h={class:`flex items-center gap-3`},g={class:`flex-1`},_={class:`text-[13px] font-normal text-card-foreground`},v={key:0,class:`text-[11px] text-muted-foreground mt-0.5`},y={class:`text-[13px] font-normal text-expense`},b=`bg-brand-accent`,x=`text-brand-primary`;var S=r({__name:`ExpenseItem`,props:{id:{},title:{},amount:{},category:{},icon:{},user:{},showUser:{type:Boolean}},emits:[`click`],setup(r,{emit:i}){let a=r,o=i,S=()=>{o(`click`,a)},C=l(()=>p.getIconByKey(a.icon));return(i,a)=>(s(),n(`div`,{class:`bg-card rounded-[10px] p-3 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer`,onClick:S},[u(`div`,m,[u(`div`,h,[u(`div`,{class:d([`flex h-5 w-5 items-center justify-center rounded-[4px]`,b])},[(s(),e(c(C.value),{class:d([`h-3 w-3`,x])}))],2),u(`div`,g,[u(`p`,_,f(r.title),1),r.showUser&&r.user?(s(),n(`p`,v,f(r.user.display_name||`未知使用者`),1)):t(``,!0)])]),u(`p`,y,f(r.amount),1)])]))}}),C=S,w={pullStartY:null,pullMoveY:null,handlers:[],styleEl:null,events:null,dist:0,state:`pending`,timeout:null,distResisted:0,supportsPassive:!1,supportsPointerEvents:typeof window<`u`&&!!window.PointerEvent};try{window.addEventListener(`test`,null,{get passive(){w.supportsPassive=!0}})}catch{}function T(e){if(!e.ptrElement){var t=document.createElement(`div`);e.mainElement===document.body?document.body.insertBefore(t,document.body.firstChild):e.mainElement.parentNode.insertBefore(t,e.mainElement),t.classList.add(e.classPrefix+`ptr`),t.innerHTML=e.getMarkup().replace(/__PREFIX__/g,e.classPrefix),e.ptrElement=t,typeof e.onInit==`function`&&e.onInit(e),w.styleEl||(w.styleEl=document.createElement(`style`),w.styleEl.setAttribute(`id`,`pull-to-refresh-js-style`),document.head.appendChild(w.styleEl)),w.styleEl.textContent=e.getStyles().replace(/__PREFIX__/g,e.classPrefix).replace(/\s+/g,` `)}return e}function E(e){e.ptrElement&&(e.ptrElement.classList.remove(e.classPrefix+`refresh`),e.ptrElement.style[e.cssProp]=`0px`,setTimeout(function(){e.ptrElement&&e.ptrElement.parentNode&&(e.ptrElement.parentNode.removeChild(e.ptrElement),e.ptrElement=null),w.state=`pending`},e.refreshTimeout))}function D(e){var t=e.ptrElement.querySelector(`.`+e.classPrefix+`icon`),n=e.ptrElement.querySelector(`.`+e.classPrefix+`text`);t&&(w.state===`refreshing`?t.innerHTML=e.iconRefreshing:t.innerHTML=e.iconArrow),n&&(w.state===`releasing`&&(n.innerHTML=e.instructionsReleaseToRefresh),(w.state===`pulling`||w.state===`pending`)&&(n.innerHTML=e.instructionsPullToRefresh),w.state===`refreshing`&&(n.innerHTML=e.instructionsRefreshing))}var O={setupDOM:T,onReset:E,update:D},k,A=function(e){return w.pointerEventsEnabled&&w.supportsPointerEvents?e.screenY:e.touches[0].screenY},j=(function(){var e;function t(t){var n=w.handlers.filter(function(e){return e.contains(t.target)})[0];w.enable=!!n,n&&w.state===`pending`&&(e=O.setupDOM(n),n.shouldPullToRefresh()&&(w.pullStartY=A(t)),clearTimeout(w.timeout),O.update(n))}function n(t){if(e&&e.ptrElement&&w.enable){if(w.pullStartY?w.pullMoveY=A(t):e.shouldPullToRefresh()&&(w.pullStartY=A(t)),w.state===`refreshing`){t.cancelable&&e.shouldPullToRefresh()&&w.pullStartY<w.pullMoveY&&t.preventDefault();return}w.state===`pending`&&(e.ptrElement.classList.add(e.classPrefix+`pull`),w.state=`pulling`,O.update(e)),w.pullStartY&&w.pullMoveY&&(w.dist=w.pullMoveY-w.pullStartY),w.distExtra=w.dist-e.distIgnore,w.distExtra>0&&(t.cancelable&&t.preventDefault(),e.ptrElement.style[e.cssProp]=w.distResisted+`px`,w.distResisted=e.resistanceFunction(w.distExtra/e.distThreshold)*Math.min(e.distMax,w.distExtra),w.state===`pulling`&&w.distResisted>e.distThreshold&&(e.ptrElement.classList.add(e.classPrefix+`release`),w.state=`releasing`,O.update(e)),w.state===`releasing`&&w.distResisted<e.distThreshold&&(e.ptrElement.classList.remove(e.classPrefix+`release`),w.state=`pulling`,O.update(e)))}}function r(){if(e&&e.ptrElement&&w.enable){if(clearTimeout(k),k=setTimeout(function(){e&&e.ptrElement&&w.state===`pending`&&O.onReset(e)},500),w.state===`releasing`&&w.distResisted>e.distThreshold)w.state=`refreshing`,e.ptrElement.style[e.cssProp]=e.distReload+`px`,e.ptrElement.classList.add(e.classPrefix+`refresh`),w.timeout=setTimeout(function(){var t=e.onRefresh(function(){return O.onReset(e)});t&&typeof t.then==`function`&&t.then(function(){return O.onReset(e)}),!t&&!e.onRefresh.length&&O.onReset(e)},e.refreshTimeout);else{if(w.state===`refreshing`)return;e.ptrElement.style[e.cssProp]=`0px`,w.state=`pending`}O.update(e),e.ptrElement.classList.remove(e.classPrefix+`release`),e.ptrElement.classList.remove(e.classPrefix+`pull`),w.pullStartY=w.pullMoveY=null,w.dist=w.distResisted=0}}function i(){e&&e.mainElement.classList.toggle(e.classPrefix+`top`,e.shouldPullToRefresh())}var a=w.supportsPassive?{passive:w.passive||!1}:void 0;return w.pointerEventsEnabled&&w.supportsPointerEvents?(window.addEventListener(`pointerup`,r),window.addEventListener(`pointerdown`,t),window.addEventListener(`pointermove`,n,a)):(window.addEventListener(`touchend`,r),window.addEventListener(`touchstart`,t),window.addEventListener(`touchmove`,n,a)),window.addEventListener(`scroll`,i),{onTouchEnd:r,onTouchStart:t,onTouchMove:n,onScroll:i,destroy:function(){w.pointerEventsEnabled&&w.supportsPointerEvents?(window.removeEventListener(`pointerdown`,t),window.removeEventListener(`pointerup`,r),window.removeEventListener(`pointermove`,n,a)):(window.removeEventListener(`touchstart`,t),window.removeEventListener(`touchend`,r),window.removeEventListener(`touchmove`,n,a)),window.removeEventListener(`scroll`,i)}}}),M=`
<div class="__PREFIX__box">
  <div class="__PREFIX__content">
    <div class="__PREFIX__icon"></div>
    <div class="__PREFIX__text"></div>
  </div>
</div>
`,N=`
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
`,P={distThreshold:60,distMax:80,distReload:50,distIgnore:0,mainElement:`body`,triggerElement:`body`,ptrElement:`.ptr`,classPrefix:`ptr--`,cssProp:`min-height`,iconArrow:`&#8675;`,iconRefreshing:`&hellip;`,instructionsPullToRefresh:`Pull down to refresh`,instructionsReleaseToRefresh:`Release to refresh`,instructionsRefreshing:`Refreshing`,refreshTimeout:500,getMarkup:function(){return M},getStyles:function(){return N},onInit:function(){},onRefresh:function(){return location.reload()},resistanceFunction:function(e){return Math.min(1,e/2.5)},shouldPullToRefresh:function(){return!window.scrollY}},F=[`mainElement`,`ptrElement`,`triggerElement`],I=(function(e){var t={};return Object.keys(P).forEach(function(n){t[n]=e[n]||P[n]}),t.refreshTimeout=typeof e.refreshTimeout==`number`?e.refreshTimeout:P.refreshTimeout,F.forEach(function(e){typeof t[e]==`string`&&(t[e]=document.querySelector(t[e]))}),w.events||=j(),t.contains=function(e){return t.triggerElement.contains(e)},t.destroy=function(){clearTimeout(w.timeout);var e=w.handlers.indexOf(t);w.handlers.splice(e,1)},t}),L={setPassiveMode:function(e){w.passive=e},setPointerEventsMode:function(e){w.pointerEventsEnabled=e},destroyAll:function(){w.events&&(w.events.destroy(),w.events=null),w.handlers.forEach(function(e){e.destroy()})},init:function(e){e===void 0&&(e={});var t=I(e);return w.handlers.push(t),t},_:{setupHandler:I,setupEvents:j,setupDOM:O.setupDOM,onReset:O.onReset,update:O.update}},R=L;function z(e){let{onRefresh:t,selector:n,disabled:r=!1,mainElement:s}=e,c=null;return a(async()=>{if(r)return;await i();let e=`body`;if(s)e=s;else if(n){let t=document.querySelector(n);t&&(e=n)}c=R.init({mainElement:e,onRefresh:async()=>{try{await t()}catch(e){console.error(`Refresh failed:`,e)}},distThreshold:60,distMax:80,distReload:50,distIgnore:10,resistanceFunction:e=>Math.min(1,e/2.5),iconArrow:`&#8675;`,iconRefreshing:`&hellip;`,instructionsPullToRefresh:`下拉刷新`,instructionsReleaseToRefresh:`鬆開刷新`,instructionsRefreshing:`正在刷新...`,shouldPullToRefresh:function(){let t=document.querySelector(e);return e===`body`||!t?window.scrollY===0:t.scrollTop===0},getMarkup:function(){return`                <div class="__PREFIX__box" style="pointer-events: none;">                    <div class="__PREFIX__content">                        <div class="__PREFIX__icon"></div>                        <div class="__PREFIX__text"></div>                    </div>                </div>`},classPrefix:`ptr--`,cssProp:`min-height`,getStyles:function(){return`                .__PREFIX__ptr {                    pointer-events: none;                    font-size: 0.85em;                    font-weight: bold;                    top: 0;                    height: 0;                    transition: height 0.3s, min-height 0.3s;                    text-align: center;                    width: 100%;                    overflow: hidden;                    display: flex;                    align-items: flex-end;                    align-content: stretch;                }                .__PREFIX__box {                    padding: 10px;                    flex-basis: 100%;                }                .__PREFIX__pull {                    transition: none;                }                .__PREFIX__text {                    margin-top: .33em;                    color: var(--brand-primary);                }                .__PREFIX__icon {                    color: var(--brand-primary);                    transition: transform .3s;                }                .__PREFIX__top {                    touch-action: pan-y;                }                .__PREFIX__release .__PREFIX__icon {                    transform: rotate(180deg);                }                `}})}),o(()=>{c&&(c.destroy(),c=null)}),{destroy:()=>{c&&(c.destroy(),c=null)}}}export{z as b,C as c};
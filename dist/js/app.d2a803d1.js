(function(){"use strict";var e={5613:function(e,t,n){var a=n(9242),o=n(3396),r=n(4870),l=(n(560),n(4268)),u=n(7180),i=n(1649),s=n(7435);const c={class:"quesiton-box"},f={key:1,class:"empty-container"};var v={__name:"Home",setup(e){const t=s.Z.PRESENTED_IMAGE_SIMPLE,n=window.acquireVsCodeApi(),a=(0,r.iH)(null),v=(0,r.iH)(null),d=(0,r.iH)(""),p=(0,r.iH)([]),m=(0,r.iH)(!1),y=()=>{p.value=[],k()},g=()=>{d.value&&!m.value&&(p.value.push({role:"user",content:d.value}),d.value="",m.value=!0,(0,o.Y3)((()=>{n.postMessage({command:"fetch",messages:JSON.stringify(p.value)})})))},h=()=>{n.postMessage({command:"abort-fetch"}),m.value=!1,k()},w=async e=>{"Enter"===e.key&&(e.preventDefault(),e.shiftKey?d.value+="\n":d.value&&!m.value&&await g())};(0,o.bv)((()=>{(0,o.YP)(p,(()=>{(0,o.Y3)((()=>{const e=a.value;e.scrollTop=e.scrollHeight}))}),{immediate:!0,deep:!0}),(0,o.YP)(d,(()=>{(0,o.Y3)((()=>{const e=v.value.$el;e.scrollTop=e.scrollHeight}))}),{immediate:!0,deep:!0}),window.addEventListener("message",(e=>{const{data:t}=e;switch(t.command){case"response":{let e=t.text;p.value.length>0&&"assistant"===p.value[p.value.length-1].role?p.value[p.value.length-1].content+=e:p.value.push({role:"assistant",content:e}),t.finished&&(m.value=!1,k());break}case"reload":b();break;case"select":d.value=t.text?t.text+"\r\n":"";break;default:break}}))}));const k=()=>{n.setState({history:p.value})},b=()=>{let e=n.getState();e&&(p.value=e.history||[])};return(e,n)=>{const s=(0,o.up)("a-textarea"),k=(0,o.up)("a-avatar"),b=(0,o.up)("MdPreview"),_=(0,o.up)("a-comment"),x=(0,o.up)("a-empty");return(0,o.wg)(),(0,o.iD)("div",null,[(0,o._)("div",c,[(0,o.Wm)((0,r.SU)(l.Z),{onClick:y,style:{"font-size":"20px"}}),(0,o.Wm)(s,{value:d.value,"onUpdate:value":n[0]||(n[0]=e=>d.value=e),placeholder:"输入您的代码问题",maxlength:4e3,"auto-size":{maxRows:5},style:{width:"88vw",margin:"0 12px"},onKeydown:w,ref_key:"textArea",ref:v},null,8,["value"]),m.value?((0,o.wg)(),(0,o.j4)((0,r.SU)(i.Z),{key:1,onClick:h,style:{"font-size":"20px"}})):((0,o.wg)(),(0,o.j4)((0,r.SU)(u.Z),{key:0,onClick:g,style:{"font-size":"20px"}}))]),p.value.length>0?((0,o.wg)(),(0,o.iD)("div",{key:0,class:"display-box",ref_key:"displayBox",ref:a},[((0,o.wg)(!0),(0,o.iD)(o.HY,null,(0,o.Ko)(p.value,((e,t)=>((0,o.wg)(),(0,o.j4)(_,{key:t},(0,o.Nv)({content:(0,o.w5)((()=>[(0,o.Wm)(b,{modelValue:e.content,theme:"dark"},null,8,["modelValue"])])),_:2},["user"===e.role?{name:"author",fn:(0,o.w5)((()=>[(0,o.Uk)("我")])),key:"0"}:{name:"author",fn:(0,o.w5)((()=>[(0,o.Uk)("AI助手")])),key:"1"},"user"===e.role?{name:"avatar",fn:(0,o.w5)((()=>[(0,o.Wm)(k,{style:{color:"#f56a00","background-color":"#fde3cf"}},{default:(0,o.w5)((()=>[(0,o.Uk)("Q")])),_:1})])),key:"2"}:{name:"avatar",fn:(0,o.w5)((()=>[(0,o.Wm)(k,{style:{color:"#87ceeb","background-color":"#a0ffff"}},{default:(0,o.w5)((()=>[(0,o.Uk)("A")])),_:1})])),key:"3"}]),1024)))),128))],512)):((0,o.wg)(),(0,o.iD)("div",f,[(0,o.Wm)(x,{image:(0,r.SU)(t)},null,8,["image"])]))])}}},d=n(89);const p=(0,d.Z)(v,[["__scopeId","data-v-4290ceac"]]);var m=p,y=n(9805),g=n(7334),h={__name:"App",setup(e){return(e,t)=>{const n=(0,o.up)("a-app"),a=(0,o.up)("a-config-provider");return(0,o.wg)(),(0,o.j4)(a,{locale:(0,r.SU)(y.Z),theme:{algorithm:(0,r.SU)(g.Z).darkAlgorithm}},{default:(0,o.w5)((()=>[(0,o.Wm)(n,null,{default:(0,o.w5)((()=>[(0,o.Wm)(m)])),_:1})])),_:1},8,["locale","theme"])}}};const w=h;var k=w,b=n(3706),_=(n(7424),n(5419));n(1849);const x=(0,a.ri)(k);x.use(b.M),x.use(_.ZP),x.mount("#app")}},t={};function n(a){var o=t[a];if(void 0!==o)return o.exports;var r=t[a]={exports:{}};return e[a].call(r.exports,r,r.exports,n),r.exports}n.m=e,function(){var e=[];n.O=function(t,a,o,r){if(!a){var l=1/0;for(c=0;c<e.length;c++){a=e[c][0],o=e[c][1],r=e[c][2];for(var u=!0,i=0;i<a.length;i++)(!1&r||l>=r)&&Object.keys(n.O).every((function(e){return n.O[e](a[i])}))?a.splice(i--,1):(u=!1,r<l&&(l=r));if(u){e.splice(c--,1);var s=o();void 0!==s&&(t=s)}}return t}r=r||0;for(var c=e.length;c>0&&e[c-1][2]>r;c--)e[c]=e[c-1];e[c]=[a,o,r]}}(),function(){n.n=function(e){var t=e&&e.__esModule?function(){return e["default"]}:function(){return e};return n.d(t,{a:t}),t}}(),function(){n.d=function(e,t){for(var a in t)n.o(t,a)&&!n.o(e,a)&&Object.defineProperty(e,a,{enumerable:!0,get:t[a]})}}(),function(){n.g=function(){if("object"===typeof globalThis)return globalThis;try{return this||new Function("return this")()}catch(e){if("object"===typeof window)return window}}()}(),function(){n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)}}(),function(){n.r=function(e){"undefined"!==typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})}}(),function(){var e={143:0};n.O.j=function(t){return 0===e[t]};var t=function(t,a){var o,r,l=a[0],u=a[1],i=a[2],s=0;if(l.some((function(t){return 0!==e[t]}))){for(o in u)n.o(u,o)&&(n.m[o]=u[o]);if(i)var c=i(n)}for(t&&t(a);s<l.length;s++)r=l[s],n.o(e,r)&&e[r]&&e[r][0](),e[r]=0;return n.O(c)},a=self["webpackChunksimple_vue"]=self["webpackChunksimple_vue"]||[];a.forEach(t.bind(null,0)),a.push=t.bind(null,a.push.bind(a))}();var a=n.O(void 0,[998],(function(){return n(5613)}));a=n.O(a)})();
//# sourceMappingURL=app.d2a803d1.js.map
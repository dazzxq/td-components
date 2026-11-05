var m=Object.defineProperty;var u=(r,e)=>m(r,"name",{value:e,configurable:!0});function b(r,e){const t=Number(r?.top),n=Number(r?.bottom),i=Number(e);if(!Number.isFinite(t)||!Number.isFinite(n)||!Number.isFinite(i)||n<=t)return 0;const o=n-i;return o<=0?1:t>=0?0:Math.min(1,-t/(-t+o))}u(b,"readingProgress");export{b as readingProgress};
//# sourceMappingURL=reading-progress.js.map

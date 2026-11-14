// OWNER: subagent A. Workaround: the shared Dialog's popIn keyframes animate `transform: translate(-50%,-50%)`
// on top of Tailwind v4's `translate` property, so dialogs render offset by -100% while the animation runs.
// This pop animation only touches opacity + scale, which compose correctly. (Reported to the orchestrator.)
const ID = 'cv-dialog-pop-fix'
if (typeof document !== 'undefined' && !document.getElementById(ID)) {
  const el = document.createElement('style')
  el.id = ID
  el.textContent = '@keyframes cvDlgPop{from{opacity:0;scale:.96}to{opacity:1;scale:1}}'
  document.head.appendChild(el)
}
export const DIALOG_POP = 'data-[state=open]:animate-[cvDlgPop_.25s_cubic-bezier(.2,.9,.3,1.2)]'

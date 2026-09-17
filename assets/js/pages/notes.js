/* Trackers Workspace v2 — Note Pad route only. */
(function(){
  document.body.dataset.module='notes';

  function mountNotesToolbar(){
    const topbar=document.querySelector('.neo-topbar');
    const toolbar=document.querySelector('#notesView .notes-topbar');
    if(!topbar||!toolbar)return;
    if(toolbar.parentElement!==topbar) topbar.appendChild(toolbar);
    topbar.classList.add('notes-route-topbar');
  }

  mountNotesToolbar();
  requestAnimationFrame(mountNotesToolbar);
})();

// Settings read by the other game scripts; imported first by main.js.
// The ten Kevin MacLeod MP3s (CC BY 4.0) exceed Qollab's 2 MB file limit, so they stream from the
// project's public GitHub repository through jsDelivr. If they cannot load, the two original
// synthesized scores play instead.
window.FoundryMusicBase = 'https://cdn.jsdelivr.net/gh/mav1o1/quantum-foundry@90b022be67b3c6c119b442886a2794fbd10ad88f/offline-game/assets/music/';
// main.js attaches the Qollab host (Qiskit in this page) as soon as the game has loaded.
window.FoundryHostPending = true;

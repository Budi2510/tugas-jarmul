const socket = io();

const joinPanel = document.getElementById('joinPanel');
const meetingPanel = document.getElementById('meetingPanel');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const roomTitle = document.getElementById('roomTitle');
const chatRoomLabel = document.getElementById('chatRoomLabel');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const logoutBtn = document.getElementById('logoutBtn');
const cameraBtn = document.getElementById('cameraBtn');
const micBtn = document.getElementById('micBtn');
const filterSelect = document.getElementById('filterSelect');
const cameraSelect = document.getElementById('cameraSelect');
const videos = document.getElementById('videos');
const localVideo = document.getElementById('localVideo');
const localLabel = document.getElementById('localLabel');
const messages = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const toast = document.getElementById('toast');

let localStream = null;
let roomId = '';
let userName = '';
let cameraEnabled = true;
let micEnabled = true;
let currentFilter = 'normal';

const peers = new Map();
const peerNames = new Map();
const pendingIceCandidates = new Map();
const peerFilters = new Map();

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function showToast(text) {
  toast.textContent = text;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2600);
}

function getRoomFromUrl() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1]) return decodeURIComponent(parts[1]);
  return '';
}

function setRoomInUrl(nextRoomId) {
  const url = new URL(window.location.href);
  url.pathname = `/room/${encodeURIComponent(nextRoomId)}`;
  window.history.replaceState({}, '', url.toString());
}

function resetRoomUrl() {
  const url = new URL(window.location.href);
  url.pathname = '/';
  window.history.replaceState({}, '', url.toString());
}

function normalizeRoom(value) {
  return value.trim().replace(/\s+/g, '-');
}

function addMessage({ text, userName: senderName, socketId, system = false }) {
  const item = document.createElement('div');
  item.className = 'message';

  if (system) {
    item.classList.add('system');
    item.textContent = text;
  } else {
    const mine = socketId === socket.id;
    if (mine) item.classList.add('mine');

    const strong = document.createElement('strong');
    strong.textContent = mine ? 'Kamu' : senderName || 'User';

    const span = document.createElement('span');
    span.textContent = text;

    item.appendChild(strong);
    item.appendChild(span);
  }

  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function applyVideoFilter(video, filter = 'normal') {
  if (!video) return;
  video.className = `filter-${filter || 'normal'}`;
}

function createRemoteVideoCard(peerId, label = 'User') {
  let card = document.getElementById(`card-${peerId}`);
  if (card) return card.querySelector('video');

  card = document.createElement('article');
  card.className = 'video-card';
  card.id = `card-${peerId}`;

  const video = document.createElement('video');
  video.id = `video-${peerId}`;
  video.autoplay = true;
  video.playsInline = true;

  applyVideoFilter(video, peerFilters.get(peerId) || 'normal');

  const videoLabel = document.createElement('span');
  videoLabel.className = 'video-label';
  videoLabel.textContent = label;

  const placeholder = document.createElement('div');
  placeholder.className = 'video-placeholder';
  placeholder.id = `placeholder-${peerId}`;
  placeholder.textContent = 'Menunggu kamera dari user ini...';

  card.appendChild(video);
  card.appendChild(placeholder);
  card.appendChild(videoLabel);
  videos.appendChild(card);

  return video;
}

function removeRemoteVideoCard(peerId) {
  const card = document.getElementById(`card-${peerId}`);
  if (card) card.remove();
}

function getOrCreatePeer(peerId, peerName = 'User') {
  if (peers.has(peerId)) return peers.get(peerId);

  peerNames.set(peerId, peerName);
  createRemoteVideoCard(peerId, peerName);

  const pc = new RTCPeerConnection(rtcConfig);

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    const remoteVideo = createRemoteVideoCard(peerId, peerNames.get(peerId) || peerName);
    const [remoteStream] = event.streams;

    if (remoteStream) {
      remoteVideo.srcObject = remoteStream;
      applyVideoFilter(remoteVideo, peerFilters.get(peerId) || 'normal');
      const placeholder = document.getElementById(`placeholder-${peerId}`);
      if (placeholder) placeholder.remove();
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        target: peerId,
        candidate: event.candidate,
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      if (pc.connectionState === 'failed') {
        showToast('Koneksi video gagal. Coba refresh kedua laptop.');
      }
    }
  };

  peers.set(peerId, pc);
  return pc;
}

async function flushPendingIce(peerId, pc) {
  const candidates = pendingIceCandidates.get(peerId) || [];
  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.warn('Failed to add pending ICE candidate:', error);
    }
  }
  pendingIceCandidates.delete(peerId);
}

async function callPeer(peerId, peerName) {
  const pc = getOrCreatePeer(peerId, peerName);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit('offer', {
    target: peerId,
    offer,
  });
}


async function loadCameras(){
 const devices=await navigator.mediaDevices.enumerateDevices();
 const cams=devices.filter(d=>d.kind==='videoinput');
 if(!cameraSelect) return;
 cameraSelect.innerHTML='';
 cams.forEach((c,i)=>{
  const o=document.createElement('option');
  o.value=c.deviceId;
  o.textContent=c.label||('Camera '+(i+1));
  cameraSelect.appendChild(o);
 });
}
async function startLocalMedia() {
  if (localStream) return localStream;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: cameraSelect && cameraSelect.value ? {exact: cameraSelect.value}: undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    localVideo.srcObject = localStream;
    applyVideoFilter(localVideo, currentFilter);
    return localStream;
  } catch (error) {
    console.error(error);

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      alert('Kamera/mic belum diizinkan. Klik ikon gembok/kamera di address bar, ubah Camera dan Microphone jadi Allow, lalu refresh.');
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      alert('Kamera atau microphone tidak ditemukan di laptop ini.');
    } else if (error.name === 'NotReadableError') {
      alert('Kamera sedang dipakai aplikasi lain. Tutup Zoom/Meet/Teams/kamera lain, lalu refresh.');
    } else {
      alert(`Gagal membuka kamera/mic: ${error.message}`);
    }

    throw error;
  }
}

async function joinRoom() {
  roomId = normalizeRoom(roomInput.value || getRoomFromUrl());
  userName = nameInput.value.trim() || 'User';

  if (!roomId) {
    showToast('Isi Room ID dulu ya.');
    return;
  }

  joinBtn.disabled = true;
  joinBtn.textContent = 'Membuka kamera...';

  try {
    await startLocalMedia();

    cameraEnabled = true;
    micEnabled = true;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = true;
    });
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });

    cameraBtn.textContent = 'Matikan Kamera';
    micBtn.textContent = 'Mute Mic';
    localLabel.textContent = userName === 'User' ? 'Kamu' : userName;
    roomTitle.textContent = roomId;
    chatRoomLabel.textContent = `Room: ${roomId}`;
    setRoomInUrl(roomId);

    joinPanel.classList.add('hidden');
    meetingPanel.classList.remove('hidden');

    socket.emit('join-room', {
      roomId,
      userName,
    });

    socket.emit('change-filter', {
      roomId,
      filter: currentFilter,
    });

    addMessage({
      system: true,
      text: `Kamu masuk ke room ${roomId}.`,
    });
  } catch (_error) {
    joinBtn.disabled = false;
    joinBtn.textContent = 'Masuk Room';
  }
}

function cleanupMeetingView({ stopMedia = false } = {}) {
  peers.forEach((pc) => pc.close());
  peers.clear();

  peerNames.clear();
  pendingIceCandidates.clear();
  peerFilters.clear();

  document.querySelectorAll('.video-card:not(.local-card)').forEach((card) => card.remove());

  if (stopMedia && localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
    localVideo.srcObject = null;
  }

  messages.innerHTML = '';
}

function logoutRoom() {
  if (!roomId) return;

  socket.emit('leave-room');

  cleanupMeetingView({ stopMedia: true });

  roomId = '';
  roomTitle.textContent = '-';
  chatRoomLabel.textContent = 'Room: -';
  roomInput.value = '';
  joinBtn.disabled = false;
  joinBtn.textContent = 'Masuk Room';

  meetingPanel.classList.add('hidden');
  joinPanel.classList.remove('hidden');

  resetRoomUrl();
  showToast('Kamu sudah logout dari room.');
}

joinBtn.addEventListener('click', joinRoom);

logoutBtn.addEventListener('click', logoutRoom);

roomInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});

nameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});

cameraBtn.addEventListener('click', () => {
  if (!localStream) return;
  cameraEnabled = !cameraEnabled;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = cameraEnabled;
  });
  cameraBtn.textContent = cameraEnabled ? 'Matikan Kamera' : 'Nyalakan Kamera';
});

micBtn.addEventListener('click', () => {
  if (!localStream) return;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled;
  });
  micBtn.textContent = micEnabled ? 'Mute Mic' : 'Unmute Mic';
});

filterSelect.addEventListener('change', () => {
  currentFilter = filterSelect.value;
  applyVideoFilter(localVideo, currentFilter);

  if (roomId) {
    socket.emit('change-filter', {
      roomId,
      filter: currentFilter,
    });
  }
});

copyLinkBtn.addEventListener('click', async () => {
  const url = new URL(window.location.href);
  url.pathname = `/room/${encodeURIComponent(roomId)}`;

  try {
    await navigator.clipboard.writeText(url.toString());
    showToast('Link room sudah dicopy.');
  } catch (_error) {
    showToast('Gagal copy otomatis. Copy link dari address bar ya.');
  }
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  socket.emit('chat-message', {
    roomId,
    userName,
    text,
  });

  messageInput.value = '';
});

socket.on('existing-users', async (users) => {
  for (const user of users) {
    peerNames.set(user.socketId, user.userName || 'User');
    peerFilters.set(user.socketId, user.filter || 'normal');
    createRemoteVideoCard(user.socketId, user.userName || 'User');

    try {
      await callPeer(user.socketId, user.userName);
    } catch (error) {
      console.error('Failed to call existing user:', error);
    }
  }
});

socket.on('user-joined', ({ socketId, userName: joinedName, filter }) => {
  peerNames.set(socketId, joinedName || 'User');
  peerFilters.set(socketId, filter || 'normal');
  createRemoteVideoCard(socketId, joinedName || 'User');
});

socket.on('offer', async ({ from, userName: callerName, filter, offer }) => {
  try {
    peerNames.set(from, callerName || 'User');
    peerFilters.set(from, filter || 'normal');

    const pc = getOrCreatePeer(from, callerName || 'User');

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushPendingIce(from, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('answer', {
      target: from,
      answer,
    });
  } catch (error) {
    console.error('Failed to handle offer:', error);
  }
});

socket.on('answer', async ({ from, answer }) => {
  try {
    const pc = peers.get(from);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    await flushPendingIce(from, pc);
  } catch (error) {
    console.error('Failed to handle answer:', error);
  }
});

socket.on('ice-candidate', async ({ from, candidate }) => {
  try {
    const pc = peers.get(from);
    const ice = new RTCIceCandidate(candidate);

    if (!pc || !pc.remoteDescription) {
      const current = pendingIceCandidates.get(from) || [];
      current.push(ice);
      pendingIceCandidates.set(from, current);
      return;
    }

    await pc.addIceCandidate(ice);
  } catch (error) {
    console.warn('Failed to add ICE candidate:', error);
  }
});

socket.on('update-filter', ({ socketId, filter }) => {
  peerFilters.set(socketId, filter || 'normal');
  const video = document.getElementById(`video-${socketId}`);
  applyVideoFilter(video, filter || 'normal');
});

socket.on('chat-message', (message) => {
  addMessage(message);
});

socket.on('user-left', ({ socketId, userName: leftName }) => {
  const pc = peers.get(socketId);
  if (pc) pc.close();

  peers.delete(socketId);
  peerNames.delete(socketId);
  pendingIceCandidates.delete(socketId);
  peerFilters.delete(socketId);

  removeRemoteVideoCard(socketId);
  showToast(`${leftName || 'User'} keluar dari room.`);
});

window.addEventListener('beforeunload', () => {
  if (roomId) socket.emit('leave-room');
  cleanupMeetingView({ stopMedia: true });
});

const roomFromUrl = getRoomFromUrl();
if (roomFromUrl) {
  roomInput.value = roomFromUrl;
}

nameInput.value = localStorage.getItem('webrtc-user-name') || '';
nameInput.addEventListener('input', () => {
  localStorage.setItem('webrtc-user-name', nameInput.value.trim());
});

if (!window.isSecureContext) {
  showToast('Halaman belum secure. Gunakan link https:// agar kamera bisa aktif.');
}


// Screenshot Feature + Gesture
function takeScreenshot(){
 const video=document.getElementById('localVideo');
 if(!video || !video.videoWidth) return;
 const canvas=document.createElement('canvas');
 canvas.width=video.videoWidth;
 canvas.height=video.videoHeight;
 const ctx=canvas.getContext('2d');
 const filter=getComputedStyle(video).filter;
 ctx.filter=filter==='none'?'none':filter;
 ctx.drawImage(video,0,0);
 const a=document.createElement('a');
 a.href=canvas.toDataURL('image/png');
 a.download='screenshot-'+Date.now()+'.png';
 a.click();
 showToast('Screenshot berhasil disimpan');
}
window.takeScreenshot=takeScreenshot;

window.addEventListener('load',()=>{
 const btn=document.getElementById('screenshotBtn');
 if(btn) btn.addEventListener('click',takeScreenshot);

 const wait=setInterval(()=>{
   const vid=document.getElementById('localVideo');
   if(vid && window.startHandGestureDetection){
      clearInterval(wait);
      startHandGestureDetection(vid, takeScreenshot);
      showToast('Gesture screenshot aktif (✌️)');
   }
 },1000);
});


function takeGestureScreenshot(){
 if(!localVideo || !localVideo.videoWidth) return;
 const canvas=document.createElement('canvas');
 canvas.width=localVideo.videoWidth;
 canvas.height=localVideo.videoHeight;
 const ctx=canvas.getContext('2d');
 const filter=getComputedStyle(localVideo).filter;
 ctx.filter=filter==='none'?'none':filter;
 ctx.drawImage(localVideo,0,0,canvas.width,canvas.height);
 const preview=window.open('');
 preview.document.write('<img style="max-width:100%" src="'+canvas.toDataURL('image/png')+'">');
 const a=document.createElement('a');
 a.href=canvas.toDataURL('image/png');
 a.download='gesture-screenshot-'+Date.now()+'.png';
 a.click();
 showToast('Screenshot gesture berhasil diambil');
}

window.addEventListener('load',()=>{
 setTimeout(()=>{
   if(window.startHandGestureDetection && localVideo){
      startHandGestureDetection(localVideo,takeGestureScreenshot);
      showToast('MediaPipe Gesture Aktif');
   }
 },3000);
});

window.addEventListener('load',()=>{
 const btn=document.getElementById('screenshotBtn');
 if(btn) btn.onclick=takeScreenshot;

 let started=false;
 const t=setInterval(()=>{
  if(started) return;
  const v=document.getElementById('localVideo');
  if(v && v.srcObject && v.videoWidth>0 && window.startHandGestureDetection){
    started=true;
    clearInterval(t);
    startHandGestureDetection(v,takeScreenshot);
    showToast('Gesture ✌ aktif');
  }
 },1000);
});

window.addEventListener('load', async()=>{try{const s=await navigator.mediaDevices.getUserMedia({video:true});s.getTracks().forEach(t=>t.stop());loadCameras();}catch(e){console.log(e)}});
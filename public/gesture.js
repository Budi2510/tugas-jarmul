
let gestureCooldown=false;

function loadScript(src){
 return new Promise((resolve,reject)=>{
  const s=document.createElement('script');
  s.src=src;
  s.onload=resolve;
  s.onerror=reject;
  document.head.appendChild(s);
 });
}

async function startHandGestureDetection(videoElement,onScreenshot){
 await Promise.all([
  loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'),
  loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js')
 ]);

 const hands=new Hands({
   locateFile:(file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
 });

 hands.setOptions({
   maxNumHands:1,
   modelComplexity:1,
   minDetectionConfidence:0.8,
   minTrackingConfidence:0.8
 });

 hands.onResults((results)=>{
   if(!results.multiHandLandmarks || !results.multiHandLandmarks.length) return;
   const lm=results.multiHandLandmarks[0];

   const indexUp=lm[8].y < lm[6].y;
   const middleUp=lm[12].y < lm[10].y;
   const ringDown=lm[16].y > lm[14].y;
   const pinkyDown=lm[20].y > lm[18].y;

   if(indexUp && middleUp && ringDown && pinkyDown && !gestureCooldown){
      gestureCooldown=true;
      onScreenshot();
      setTimeout(()=>gestureCooldown=false,3000);
   }
 });

 const camera=new Camera(videoElement,{
  onFrame:async()=>{ await hands.send({image:videoElement}); },
  width:320,height:240
 });

 camera.start();
 console.log('Gesture Active');
}

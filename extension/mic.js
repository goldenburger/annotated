const status = document.getElementById('status');
document.getElementById('allow').addEventListener('click', async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    status.textContent = 'Microphone allowed. Close this tab and record again in the side panel.';
  } catch (e) {
    status.textContent = `The microphone is still blocked (${e.name}). Click the icon at the left of the address bar and allow the microphone.`;
  }
});

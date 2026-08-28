if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.update();
      await navigator.serviceWorker.register('/sw.js?v=uc3', { scope: '/' });
    } catch (e) { console.warn('ORYN service worker refresh failed', e); }
  });
}
